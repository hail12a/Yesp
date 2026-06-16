--[[
	Avatar Collector (Prototype) — ServerScriptService
	-------------------------------------------------
	Collects each player's avatar when they join:
	  • username + userId + display name
	  • headshot thumbnail URL (renderable on the website)
	  • worn items (clothing + accessories) from their HumanoidDescription
	  • join timestamp (UTC)
	...and POSTs it all to the Yesp site, room = "avatars".

	View the results on the website's "Avatar Vault" page.
	Requires HttpService enabled (Game Settings → Security).
]]

local Players     = game:GetService("Players")
local HttpService = game:GetService("HttpService")

local ENDPOINT = "http://78.108.218.209:8098"  -- your Yesp site
local ROOM     = "avatars"

-- public headshot URL the website can show in an <img>
local function headshot(userId)
	return ("https://www.roblox.com/headshot-thumbnail/image?userId=%d&width=420&height=420&format=png"):format(userId)
end

-- pull the worn items off the player's avatar
local function gatherItems(userId)
	local items = {}
	local ok, desc = pcall(function()
		return Players:GetHumanoidDescriptionFromUserId(userId)
	end)
	if not ok or not desc then return items end

	-- clothing
	if desc.Shirt   ~= 0 then table.insert(items, { kind = "Shirt",      id = desc.Shirt }) end
	if desc.Pants   ~= 0 then table.insert(items, { kind = "Pants",      id = desc.Pants }) end
	if desc.GraphicTShirt ~= 0 then table.insert(items, { kind = "TShirt", id = desc.GraphicTShirt }) end
	if desc.Face    ~= 0 then table.insert(items, { kind = "Face",       id = desc.Face }) end

	-- accessories come as comma-separated asset id lists
	for _, field in ipairs({ "HatAccessory","HairAccessory","FaceAccessory",
	                         "NeckAccessory","ShouldersAccessory","FrontAccessory",
	                         "BackAccessory","WaistAccessory" }) do
		local list = desc[field]
		if list and list ~= "" then
			for idStr in string.gmatch(list, "%d+") do
				table.insert(items, { kind = field, id = tonumber(idStr) })
			end
		end
	end
	return items
end

local function collect(player)
	local payload = {
		room = ROOM,
		from = "avatar-bot",
		text = player.Name .. " joined",
		data = {
			userId      = player.UserId,
			name        = player.Name,
			displayName = player.DisplayName,
			thumb       = headshot(player.UserId),
			items       = gatherItems(player.UserId),
			joined      = os.date("!%Y-%m-%dT%H:%M:%SZ"),  -- ISO 8601 UTC
		},
	}

	local ok, err = pcall(function()
		HttpService:PostAsync(
			ENDPOINT .. "/api/say",
			HttpService:JSONEncode(payload),
			Enum.HttpContentType.ApplicationJson
		)
	end)
	if not ok then warn("[AvatarCollector] failed for", player.Name, err) end
end

-- collect everyone already here, then everyone who joins
for _, p in ipairs(Players:GetPlayers()) do
	task.spawn(collect, p)
end
Players.PlayerAdded:Connect(collect)
