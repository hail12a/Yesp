-- ============================================================
-- AdminServer  (Script)
-- Place in: ServerScriptService
--
-- SECURITY: every action re-checks the caller is an admin. Never trust
-- the client. The panel only SHOWS for admins, but the server is what
-- actually enforces it.
--
-- SETUP:
--   ReplicatedStorage > ModuleScript "AdminConfig"
--   ReplicatedStorage > RemoteFunction "AdminRequest"
--   ReplicatedStorage > RemoteEvent "AdminIsAdmin"   (server tells client)
--   ServerStorage > Folder "DealerCars" (for give-car; shared w/ dealership)
--   Money system (leaderstats.Money) present.
-- ============================================================

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage     = game:GetService("ServerStorage")
local Workspace         = game:GetService("Workspace")
local HttpService       = game:GetService("HttpService")

local AdminConfig = require(ReplicatedStorage:WaitForChild("AdminConfig"))
local adminRequest = ReplicatedStorage:WaitForChild("AdminRequest")
local adminIsAdmin = ReplicatedStorage:WaitForChild("AdminIsAdmin")
local dealerCars   = ServerStorage:FindFirstChild("DealerCars")

-- optional: dealership ownership hook (if present) so give-car also grants ownership
local ownGrantEvent = ReplicatedStorage:FindFirstChild("AdminGrantCar")

-- ===== admin checks =====
local function inList(player, list)
	for _, entry in ipairs(list) do
		if type(entry) == "number" and player.UserId == entry then return true end
		if type(entry) == "string" and player.Name == entry then return true end
	end
	return false
end

local function isAdmin(player)
	if player.UserId == game.CreatorId then return true end       -- creator (user games)
	-- for group games, CreatorId is the group; also allow the place owner
	if inList(player, AdminConfig.ADMINS) then return true end
	if inList(player, AdminConfig.SUPER_ADMINS) then return true end
	return false
end

local function isSuperAdmin(player)
	if player.UserId == game.CreatorId then return true end
	if #AdminConfig.SUPER_ADMINS == 0 then return isAdmin(player) end
	return inList(player, AdminConfig.SUPER_ADMINS)
end

-- tell each client whether they're an admin (so the panel shows/hides)
local function notifyAdmin(player)
	task.wait(1)
	adminIsAdmin:FireClient(player, isAdmin(player), isSuperAdmin(player))
end
Players.PlayerAdded:Connect(notifyAdmin)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(notifyAdmin, p) end

-- ===== helpers =====
local function findPlayer(name)
	if type(name) ~= "string" then return nil end
	name = name:lower()
	-- exact first
	for _, p in ipairs(Players:GetPlayers()) do
		if p.Name:lower() == name or p.DisplayName:lower() == name then return p end
	end
	-- partial match
	for _, p in ipairs(Players:GetPlayers()) do
		if p.Name:lower():sub(1, #name) == name then return p end
	end
	return nil
end

local function getMoney(player)
	local ls = player:FindFirstChild("leaderstats")
	return ls and ls:FindFirstChild("Money")
end

local function listPlayers()
	local t = {}
	for _, p in ipairs(Players:GetPlayers()) do
		table.insert(t, { name = p.Name, display = p.DisplayName, userId = p.UserId })
	end
	return t
end

local function listCars()
	local t = {}
	if dealerCars then
		for _, m in ipairs(dealerCars:GetChildren()) do
			if m:IsA("Model") then table.insert(t, m.Name) end
		end
	end
	table.sort(t)
	return t
end

-- ===== main request handler =====
adminRequest.OnServerInvoke = function(player, action, arg1, arg2)
	-- HARD GATE: non-admins get nothing, ever.
	if not isAdmin(player) then
		return { ok = false, msg = "Not authorized." }
	end

	-- read-only data actions
	if action == "getlists" then
		return { ok = true, players = listPlayers(), cars = listCars() }
	end

	-- give cash: arg1 = target name, arg2 = amount
	if action == "givecash" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local amount = tonumber(arg2)
		if not amount then return { ok = false, msg = "Invalid amount." } end
		local m = getMoney(target)
		if not m then return { ok = false, msg = "Target has no Money stat." } end
		m.Value = m.Value + math.floor(amount)
		return { ok = true, msg = ("Gave $%d to %s."):format(math.floor(amount), target.Name) }
	end

	-- set cash: arg1 = name, arg2 = amount (absolute)
	if action == "setcash" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local amount = tonumber(arg2)
		if not amount then return { ok = false, msg = "Invalid amount." } end
		local m = getMoney(target)
		if not m then return { ok = false, msg = "Target has no Money stat." } end
		m.Value = math.floor(amount)
		return { ok = true, msg = ("Set %s's cash to $%d."):format(target.Name, math.floor(amount)) }
	end

	-- give car: arg1 = name, arg2 = car name
	if action == "givecar" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		if type(arg2) ~= "string" then return { ok = false, msg = "Invalid car." } end
		if not dealerCars or not dealerCars:FindFirstChild(arg2) then
			return { ok = false, msg = "Car not found: " .. tostring(arg2) }
		end
		-- if the dealership grant hook exists, use it so it saves as owned
		if ownGrantEvent then
			ownGrantEvent:Fire(target, arg2)   -- BindableEvent to DealershipServer
			return { ok = true, msg = ("Granted %s to %s (saved)."):format(arg2, target.Name) }
		end
		-- fallback: just spawn it in front of them
		local char = target.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		if hrp then
			local car = dealerCars[arg2]:Clone()
			if car.PrimaryPart then
				car:SetPrimaryPartCFrame(hrp.CFrame * CFrame.new(0, 0, -12) + Vector3.new(0,3,0))
			end
			car.Parent = Workspace
		end
		return { ok = true, msg = ("Spawned %s for %s."):format(arg2, target.Name) }
	end

	-- teleport: arg1 = who, arg2 = to whom
	if action == "teleport" then
		local a = findPlayer(arg1)
		local b = findPlayer(arg2)
		if not a or not b then return { ok = false, msg = "Player(s) not found." } end
		local ahrp = a.Character and a.Character:FindFirstChild("HumanoidRootPart")
		local bhrp = b.Character and b.Character:FindFirstChild("HumanoidRootPart")
		if ahrp and bhrp then
			ahrp.CFrame = bhrp.CFrame * CFrame.new(0, 0, 4)
			return { ok = true, msg = ("Teleported %s to %s."):format(a.Name, b.Name) }
		end
		return { ok = false, msg = "Characters not ready." }
	end

	-- kick: arg1 = name, arg2 = reason
	if action == "kick" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		target:Kick(tostring(arg2 or "Kicked by an admin."))
		return { ok = true, msg = ("Kicked %s."):format(target.Name) }
	end

	-- announce: arg1 = message (broadcast to all)
	if action == "announce" then
		if type(arg1) ~= "string" or arg1 == "" then return { ok = false, msg = "Empty message." } end
		adminIsAdmin:FireAllClients(nil, nil, nil, arg1)   -- reuse channel with 4th arg = announcement
		return { ok = true, msg = "Announced." }
	end

	-- heal: arg1 = name
	if action == "heal" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hum = target.Character and target.Character:FindFirstChildOfClass("Humanoid")
		if hum then hum.Health = hum.MaxHealth return { ok = true, msg = "Healed " .. target.Name } end
		return { ok = false, msg = "No humanoid." }
	end

	-- SUPER-ADMIN ONLY below
	if action == "ban" or action == "shutdown" then
		if not isSuperAdmin(player) then
			return { ok = false, msg = "Super-admin only." }
		end
		if action == "ban" then
			local target = findPlayer(arg1)
			if not target then return { ok = false, msg = "Player not found." } end
			target:Kick("Banned: " .. tostring(arg2 or "no reason"))
			-- NOTE: real persistent bans need a DataStore ban-list; this is a session kick.
			return { ok = true, msg = "Kicked (session ban) " .. target.Name }
		end
	end

	return { ok = false, msg = "Unknown action." }
end
