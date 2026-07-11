-- ============================================================
-- Chat Style Relay  (ServerScript)  — for v8
-- Place in: ServerScriptService
-- Requires: ReplicatedStorage > RemoteEvent named "ChatStyleEvent"
--
-- Relays each player's chosen color + font to everyone, with
-- validation so clients can't send abusive values.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local styleEvent = ReplicatedStorage:WaitForChild("ChatStyleEvent")

-- [userId] = { color = "r,g,b", font = "SourceSans" }
local playerStyles = {}

local ALLOWED_FONTS = {
	SourceSans = true, SourceSansBold = true, Gotham = true,
	GothamBold = true, Arcade = true, Cartoon = true,
	Fantasy = true, Antique = true, Michroma = true, Highway = true,
	SourceSansLight = true, SourceSansItalic = true, SourceSansSemibold = true,
	GothamMedium = true, GothamBlack = true, Bangers = true, Creepster = true,
	DenkOne = true, FredokaOne = true, IndieFlower = true,
}

local function clampColorString(str)
	local r, g, b = string.match(tostring(str), "^(%d+),(%d+),(%d+)$")
	if not r then return "255,255,255" end
	r = math.clamp(tonumber(r), 0, 255)
	g = math.clamp(tonumber(g), 0, 255)
	b = math.clamp(tonumber(b), 0, 255)
	return string.format("%d,%d,%d", r, g, b)
end

styleEvent.OnServerEvent:Connect(function(player, color, font)
	color = clampColorString(color)
	if not ALLOWED_FONTS[font] then font = "SourceSans" end

	playerStyles[player.UserId] = { color = color, font = font }
	styleEvent:FireAllClients(player.UserId, color, font)
end)

Players.PlayerAdded:Connect(function(newPlayer)
	task.wait(2)
	for userId, style in pairs(playerStyles) do
		styleEvent:FireClient(newPlayer, userId, style.color, style.font)
	end
end)

Players.PlayerRemoving:Connect(function(player)
	playerStyles[player.UserId] = nil
end)
