-- ============================================================
-- AdminServer v2  (Script)
-- Place in: ServerScriptService
--
-- SECURITY: every action re-checks the caller is an admin. Never trust
-- the client. The panel only SHOWS for admins, but the server is what
-- actually enforces it.
--
-- Handles the expanded AdminClient v2:
--   Money   : givecash / setcash / takecash / giveall / setall / multiplyall
--   Players : bring / goto / teleport / freeze / thaw / speed / jump /
--             heal / god / ungod / respawn / kill / kick / ban
--   World   : settime / freezetime / brightness / fog / gravity
--   Effects : fire / sparkles / smoke / neon / clearfx / explode / fling / size
--   Announce: rich payload {text,r,g,b,duration,style}
--   Server  : getlists / givecar
--
-- SETUP (no new instances vs v1):
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
local Lighting          = game:GetService("Lighting")

local AdminConfig = require(ReplicatedStorage:WaitForChild("AdminConfig"))
local adminRequest = ReplicatedStorage:WaitForChild("AdminRequest")
local adminIsAdmin = ReplicatedStorage:WaitForChild("AdminIsAdmin")
local dealerCars   = ServerStorage:FindFirstChild("DealerCars")

-- optional: dealership ownership hook (if present) so give-car also grants ownership
local ownGrantEvent = ReplicatedStorage:FindFirstChild("AdminGrantCar")

-- ===== state =====
local godPlayers   = {}   -- [userId] = HealthChanged connection
local frozenParts  = {}   -- [userId] = true (HRP anchored)
local timeFrozen   = false
local frozenHour   = 12

-- ============================================================
-- ADMIN CHECKS
-- ============================================================
local function inList(player, list)
	for _, entry in ipairs(list) do
		if type(entry) == "number" and player.UserId == entry then return true end
		if type(entry) == "string" and player.Name == entry then return true end
	end
	return false
end

local function isAdmin(player)
	if player.UserId == game.CreatorId then return true end
	if inList(player, AdminConfig.ADMINS) then return true end
	if inList(player, AdminConfig.SUPER_ADMINS) then return true end
	return false
end

local function isSuperAdmin(player)
	if player.UserId == game.CreatorId then return true end
	if #AdminConfig.SUPER_ADMINS == 0 then return isAdmin(player) end
	return inList(player, AdminConfig.SUPER_ADMINS)
end

local function notifyAdmin(player)
	task.wait(1)
	adminIsAdmin:FireClient(player, isAdmin(player), isSuperAdmin(player))
end
Players.PlayerAdded:Connect(notifyAdmin)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(notifyAdmin, p) end

-- ============================================================
-- HELPERS
-- ============================================================
local function findPlayer(name)
	if type(name) ~= "string" or name == "" then return nil end
	name = name:lower()
	for _, p in ipairs(Players:GetPlayers()) do
		if p.Name:lower() == name or p.DisplayName:lower() == name then return p end
	end
	for _, p in ipairs(Players:GetPlayers()) do
		if p.Name:lower():sub(1, #name) == name then return p end
	end
	return nil
end

local function getMoney(player)
	local ls = player:FindFirstChild("leaderstats")
	return ls and ls:FindFirstChild("Money")
end

local function getChar(player)
	return player and player.Character
end
local function getHRP(player)
	local c = getChar(player)
	return c and c:FindFirstChild("HumanoidRootPart")
end
local function getHum(player)
	local c = getChar(player)
	return c and c:FindFirstChildOfClass("Humanoid")
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

local function clearBodyFx(char)
	if not char then return end
	for _, d in ipairs(char:GetDescendants()) do
		if d:IsA("Fire") or d:IsA("Sparkles") or d:IsA("Smoke") then
			d:Destroy()
		end
		if d:IsA("BasePart") and d:GetAttribute("AdminNeon") then
			d.Material = Enum.Material.Plastic
			d:SetAttribute("AdminNeon", nil)
		end
	end
end

-- ============================================================
-- TIME FREEZE LOOP  (holds ClockTime when frozen, overriding cycles)
-- ============================================================
task.spawn(function()
	while true do
		if timeFrozen then
			Lighting.ClockTime = frozenHour
		end
		task.wait(0.2)
	end
end)

-- ============================================================
-- MAIN REQUEST HANDLER
-- ============================================================
adminRequest.OnServerInvoke = function(player, action, arg1, arg2, arg3)
	-- HARD GATE
	if not isAdmin(player) then
		return { ok = false, msg = "Not authorized." }
	end

	-- ---------- read-only ----------
	if action == "getlists" then
		return { ok = true, players = listPlayers(), cars = listCars() }
	end

	-- ======================================================
	-- MONEY
	-- ======================================================
	if action == "givecash" or action == "setcash" or action == "takecash" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local amount = tonumber(arg2)
		if not amount then return { ok = false, msg = "Invalid amount." } end
		amount = math.floor(amount)
		local m = getMoney(target)
		if not m then return { ok = false, msg = "Target has no Money stat." } end
		if action == "givecash" then
			m.Value = m.Value + amount
			return { ok = true, msg = ("Gave $%d to %s."):format(amount, target.Name) }
		elseif action == "takecash" then
			m.Value = math.max(0, m.Value - amount)
			return { ok = true, msg = ("Removed $%d from %s."):format(amount, target.Name) }
		else
			m.Value = amount
			return { ok = true, msg = ("Set %s's cash to $%d."):format(target.Name, amount) }
		end
	end

	if action == "giveall" or action == "setall" then
		local amount = tonumber(arg1)
		if not amount then return { ok = false, msg = "Invalid amount." } end
		amount = math.floor(amount)
		local n = 0
		for _, p in ipairs(Players:GetPlayers()) do
			local m = getMoney(p)
			if m then
				m.Value = (action == "giveall") and (m.Value + amount) or amount
				n = n + 1
			end
		end
		return { ok = true, msg = ("%s $%d for %d players."):format(action == "giveall" and "Gave" or "Set", amount, n) }
	end

	if action == "multiplyall" then
		local factor = tonumber(arg1)
		if not factor or factor < 0 then return { ok = false, msg = "Invalid multiplier." } end
		local n = 0
		for _, p in ipairs(Players:GetPlayers()) do
			local m = getMoney(p)
			if m then m.Value = math.floor(m.Value * factor) n = n + 1 end
		end
		return { ok = true, msg = ("Multiplied cash x%.2f for %d players."):format(factor, n) }
	end

	-- ======================================================
	-- PLAYERS
	-- ======================================================
	if action == "bring" or action == "goto" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local myHRP = getHRP(player)
		local tHRP = getHRP(target)
		if not myHRP or not tHRP then return { ok = false, msg = "Characters not ready." } end
		if action == "bring" then
			tHRP.CFrame = myHRP.CFrame * CFrame.new(0, 0, -4)
			return { ok = true, msg = "Brought " .. target.Name }
		else
			myHRP.CFrame = tHRP.CFrame * CFrame.new(0, 0, -4)
			return { ok = true, msg = "Teleported to " .. target.Name }
		end
	end

	if action == "teleport" then
		local a = findPlayer(arg1)
		local b = findPlayer(arg2)
		if not a or not b then return { ok = false, msg = "Player(s) not found." } end
		local ahrp, bhrp = getHRP(a), getHRP(b)
		if ahrp and bhrp then
			ahrp.CFrame = bhrp.CFrame * CFrame.new(0, 0, 4)
			return { ok = true, msg = ("Teleported %s to %s."):format(a.Name, b.Name) }
		end
		return { ok = false, msg = "Characters not ready." }
	end

	if action == "freeze" or action == "thaw" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hrp = getHRP(target)
		if not hrp then return { ok = false, msg = "Character not ready." } end
		if action == "freeze" then
			hrp.Anchored = true
			frozenParts[target.UserId] = true
			return { ok = true, msg = "Froze " .. target.Name }
		else
			hrp.Anchored = false
			frozenParts[target.UserId] = nil
			return { ok = true, msg = "Thawed " .. target.Name }
		end
	end

	if action == "speed" or action == "jump" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hum = getHum(target)
		if not hum then return { ok = false, msg = "No humanoid." } end
		local v = tonumber(arg2)
		if not v then return { ok = false, msg = "Invalid value." } end
		if action == "speed" then
			hum.WalkSpeed = v
			return { ok = true, msg = ("%s WalkSpeed = %d"):format(target.Name, v) }
		else
			hum.UseJumpPower = true
			hum.JumpPower = v
			return { ok = true, msg = ("%s JumpPower = %d"):format(target.Name, v) }
		end
	end

	if action == "heal" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hum = getHum(target)
		if hum then hum.Health = hum.MaxHealth return { ok = true, msg = "Healed " .. target.Name } end
		return { ok = false, msg = "No humanoid." }
	end

	if action == "god" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hum = getHum(target)
		if not hum then return { ok = false, msg = "No humanoid." } end
		if godPlayers[target.UserId] then godPlayers[target.UserId]:Disconnect() end
		hum.MaxHealth = math.huge
		hum.Health = math.huge
		godPlayers[target.UserId] = hum.HealthChanged:Connect(function()
			if hum and hum.Parent then hum.Health = hum.MaxHealth end
		end)
		return { ok = true, msg = "God mode ON for " .. target.Name }
	end

	if action == "ungod" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hum = getHum(target)
		if godPlayers[target.UserId] then godPlayers[target.UserId]:Disconnect() godPlayers[target.UserId] = nil end
		if hum then hum.MaxHealth = 100 hum.Health = 100 end
		return { ok = true, msg = "God mode OFF for " .. target.Name }
	end

	if action == "respawn" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		if godPlayers[target.UserId] then godPlayers[target.UserId]:Disconnect() godPlayers[target.UserId] = nil end
		target:LoadCharacter()
		return { ok = true, msg = "Respawned " .. target.Name }
	end

	if action == "kill" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hum = getHum(target)
		if hum then hum.Health = 0 return { ok = true, msg = "Killed " .. target.Name } end
		return { ok = false, msg = "No humanoid." }
	end

	if action == "kick" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		target:Kick(tostring(arg2 or "Kicked by an admin."))
		return { ok = true, msg = ("Kicked %s."):format(target.Name) }
	end

	-- ======================================================
	-- WORLD / TIME
	-- ======================================================
	if action == "settime" then
		local h = tonumber(arg1)
		if not h then return { ok = false, msg = "Invalid time." } end
		h = math.clamp(h, 0, 24)
		frozenHour = h
		Lighting.ClockTime = h
		return { ok = true, msg = ("Time set to %.1f:00"):format(h) }
	end

	if action == "freezetime" then
		timeFrozen = (tonumber(arg1) == 1)
		if timeFrozen then frozenHour = Lighting.ClockTime end
		return { ok = true, msg = timeFrozen and "Time frozen." or "Time unfrozen." }
	end

	if action == "brightness" then
		local v = tonumber(arg1)
		if not v then return { ok = false, msg = "Invalid value." } end
		Lighting.Brightness = math.clamp(v, 0, 10)
		return { ok = true, msg = ("Brightness = %.1f"):format(Lighting.Brightness) }
	end

	if action == "fog" then
		local v = tonumber(arg1)
		if not v then return { ok = false, msg = "Invalid value." } end
		Lighting.FogEnd = math.max(0, v)
		return { ok = true, msg = ("Fog end = %d"):format(Lighting.FogEnd) }
	end

	if action == "gravity" then
		local v = tonumber(arg1)
		if not v then return { ok = false, msg = "Invalid value." } end
		Workspace.Gravity = math.clamp(v, 0, 1000)
		return { ok = true, msg = ("Gravity = %.1f"):format(Workspace.Gravity) }
	end

	-- ======================================================
	-- EFFECTS
	-- ======================================================
	if action == "fire" or action == "sparkles" or action == "smoke" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hrp = getHRP(target)
		if not hrp then return { ok = false, msg = "Character not ready." } end
		if action == "fire" then
			local f = Instance.new("Fire") f.Heat = 15 f.Size = 8 f.Parent = hrp
		elseif action == "sparkles" then
			local s = Instance.new("Sparkles") s.SparkleColor = Color3.fromRGB(255, 220, 90) s.Parent = hrp
		else
			local s = Instance.new("Smoke") s.Opacity = 0.5 s.Parent = hrp
		end
		return { ok = true, msg = action .. " added to " .. target.Name }
	end

	if action == "neon" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local char = getChar(target)
		if not char then return { ok = false, msg = "Character not ready." } end
		for _, d in ipairs(char:GetDescendants()) do
			if d:IsA("BasePart") then
				d.Material = Enum.Material.Neon
				d:SetAttribute("AdminNeon", true)
			end
		end
		return { ok = true, msg = "Neon applied to " .. target.Name }
	end

	if action == "clearfx" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		clearBodyFx(getChar(target))
		return { ok = true, msg = "Cleared FX on " .. target.Name }
	end

	if action == "explode" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hrp = getHRP(target)
		if not hrp then return { ok = false, msg = "Character not ready." } end
		local e = Instance.new("Explosion")
		e.Position = hrp.Position
		e.BlastRadius = 12
		e.BlastPressure = 500000
		e.Parent = Workspace
		return { ok = true, msg = "Exploded " .. target.Name }
	end

	if action == "fling" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hrp = getHRP(target)
		if not hrp then return { ok = false, msg = "Character not ready." } end
		hrp.AssemblyLinearVelocity = Vector3.new(math.random(-1,1), 1, math.random(-1,1)).Unit * 250
		hrp.AssemblyAngularVelocity = Vector3.new(0, 100, 0)
		return { ok = true, msg = "Flung " .. target.Name }
	end

	if action == "size" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		local hum = getHum(target)
		if not hum then return { ok = false, msg = "No humanoid." } end
		local s = tonumber(arg2)
		if not s then return { ok = false, msg = "Invalid size." } end
		s = math.clamp(s, 0.3, 5)
		for _, name in ipairs({ "BodyHeightScale", "BodyWidthScale", "BodyDepthScale", "HeadScale" }) do
			local v = hum:FindFirstChild(name)
			if v and v:IsA("NumberValue") then v.Value = s end
		end
		return { ok = true, msg = ("Sized %s x%.1f"):format(target.Name, s) }
	end

	-- ======================================================
	-- ANNOUNCE (rich payload)
	-- ======================================================
	if action == "announce" then
		local payload
		if type(arg1) == "table" then
			local text = tostring(arg1.text or "")
			if text == "" then return { ok = false, msg = "Empty message." } end
			payload = {
				text = string.sub(text, 1, 200),
				r = math.clamp(tonumber(arg1.r) or 255, 0, 255),
				g = math.clamp(tonumber(arg1.g) or 200, 0, 255),
				b = math.clamp(tonumber(arg1.b) or 60, 0, 255),
				duration = math.clamp(tonumber(arg1.duration) or 6, 1, 30),
				style = (arg1.style == "Fade" or arg1.style == "Flash") and arg1.style or "Slide",
			}
		else
			local text = tostring(arg1 or "")
			if text == "" then return { ok = false, msg = "Empty message." } end
			payload = { text = string.sub(text, 1, 200), r=255, g=200, b=60, duration=6, style="Slide" }
		end
		adminIsAdmin:FireAllClients(nil, nil, nil, payload)
		return { ok = true, msg = "Announced." }
	end

	-- ======================================================
	-- SERVER: give car
	-- ======================================================
	if action == "givecar" then
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		if type(arg2) ~= "string" then return { ok = false, msg = "Invalid car." } end
		if not dealerCars or not dealerCars:FindFirstChild(arg2) then
			return { ok = false, msg = "Car not found: " .. tostring(arg2) }
		end
		if ownGrantEvent then
			ownGrantEvent:Fire(target, arg2)
			return { ok = true, msg = ("Granted %s to %s (saved)."):format(arg2, target.Name) }
		end
		local hrp = getHRP(target)
		if hrp then
			local car = dealerCars[arg2]:Clone()
			if car.PrimaryPart then
				car:SetPrimaryPartCFrame(hrp.CFrame * CFrame.new(0, 0, -12) + Vector3.new(0,3,0))
			end
			car.Parent = Workspace
		end
		return { ok = true, msg = ("Spawned %s for %s."):format(arg2, target.Name) }
	end

	-- ======================================================
	-- SUPER-ADMIN ONLY
	-- ======================================================
	if action == "ban" then
		if not isSuperAdmin(player) then
			return { ok = false, msg = "Super-admin only." }
		end
		local target = findPlayer(arg1)
		if not target then return { ok = false, msg = "Player not found." } end
		target:Kick("Banned: " .. tostring(arg2 or "no reason"))
		-- NOTE: real persistent bans need a DataStore ban-list; this is a session kick.
		return { ok = true, msg = "Kicked (session ban) " .. target.Name }
	end

	return { ok = false, msg = "Unknown action." }
end

-- cleanup god connections on leave
Players.PlayerRemoving:Connect(function(p)
	if godPlayers[p.UserId] then godPlayers[p.UserId]:Disconnect() godPlayers[p.UserId] = nil end
	frozenParts[p.UserId] = nil
end)
