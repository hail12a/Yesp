--[[
	2D Survival (.io style) — Server   (ServerScriptService)
	========================================================
	Authoritative server for a moomoo.io / starve.io-style top-down
	survival game rendered entirely in a ScreenGui.

	• Continuous (float) world — no tile grid. Smooth movement.
	• Scattered resource nodes: trees (wood), stones (stone), bushes (food).
	• Server owns all positions, health, inventory and combat.
	• Sends one WorldInit (full node list) per client on join, then a
	  steady stream of Snapshots (players + only the nodes that changed).

	Pair with the companion LocalScript in StarterPlayerScripts.
	Auto-creates its RemoteEvents in ReplicatedStorage.
]]

local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- ── RemoteEvents ────────────────────────────────────────────────────────────

local folder = ReplicatedStorage:FindFirstChild("SurvivalEvents")
if not folder then
	folder = Instance.new("Folder")
	folder.Name   = "SurvivalEvents"
	folder.Parent = ReplicatedStorage
end
local function ev(name)
	local e = folder:FindFirstChild(name)
	if not e then
		e = Instance.new("RemoteEvent")
		e.Name, e.Parent = name, folder
	end
	return e
end

local WorldInit  = ev("WorldInit")   -- server → one client : full node list + size
local Snapshot   = ev("Snapshot")    -- server → all        : players + changed nodes
local SetInput   = ev("SetInput")    -- client → server     : movement direction
local DoAction   = ev("DoAction")    -- client → server     : "gather" / "attack"

-- ── World config ────────────────────────────────────────────────────────────

local WORLD_W, WORLD_H = 3600, 2600
local PLAYER_R   = 28
local PLAYER_SPD = 280          -- units / second
local REACH      = 70           -- how far gather/attack reaches past your body

local KIND = { TREE = 1, STONE = 2, BUSH = 3 }

local NODE_DEF = {
	[KIND.TREE]  = { r = 52, hp = 4, give = "wood",  amount = 1, respawn = 12, solid = true  },
	[KIND.STONE] = { r = 44, hp = 5, give = "stone", amount = 1, respawn = 18, solid = true  },
	[KIND.BUSH]  = { r = 30, hp = 1, give = "food",  amount = 1, respawn = 9,  solid = false },
}

-- ── Generate nodes (seeded → identical every boot) ──────────────────────────

math.randomseed(1337)

local nodes   = {}   -- [id] = { id, k, x, y, r, hp, dead, respawnAt }
local nextId  = 1

local function tooClose(x, y, minDist)
	for _, n in pairs(nodes) do
		local dx, dy = n.x - x, n.y - y
		if dx*dx + dy*dy < minDist*minDist then return true end
	end
	return false
end

local function spawnNodes(kind, count, minDist)
	local def = NODE_DEF[kind]
	local made = 0
	local tries = 0
	while made < count and tries < count * 40 do
		tries += 1
		local x = math.random(120, WORLD_W - 120)
		local y = math.random(120, WORLD_H - 120)
		if not tooClose(x, y, minDist) then
			nodes[nextId] = {
				id = nextId, k = kind, x = x, y = y,
				r = def.r, hp = def.hp, dead = false, respawnAt = 0,
			}
			nextId += 1
			made += 1
		end
	end
end

spawnNodes(KIND.TREE,  46, 150)
spawnNodes(KIND.STONE, 30, 150)
spawnNodes(KIND.BUSH,  40, 110)

local function nodeWire(n)
	return { id = n.id, k = n.k, x = n.x, y = n.y, r = n.r, dead = n.dead }
end

local function fullNodeList()
	local t = {}
	for _, n in pairs(nodes) do t[#t+1] = nodeWire(n) end
	return t
end

-- ── Players ─────────────────────────────────────────────────────────────────

local state  = {}   -- [uid] = { name, x, y, hp, wood, stone, food, facing }
local inputs = {}   -- [uid] = { dx, dy }
local dirty  = {}   -- set of node ids changed since last snapshot

local function freeSpawn()
	for _ = 1, 200 do
		local x = math.random(200, WORLD_W - 200)
		local y = math.random(200, WORLD_H - 200)
		local ok = true
		for _, n in pairs(nodes) do
			if not n.dead and NODE_DEF[n.k].solid then
				local dx, dy = n.x - x, n.y - y
				if dx*dx + dy*dy < (n.r + PLAYER_R + 10)^2 then ok = false break end
			end
		end
		if ok then return x, y end
	end
	return WORLD_W/2, WORLD_H/2
end

local function addPlayer(p)
	local x, y = freeSpawn()
	state[p.UserId]  = { name = p.Name, x = x, y = y, hp = 100,
	                     wood = 0, stone = 0, food = 0, facing = 0 }
	inputs[p.UserId] = { dx = 0, dy = 0 }
end

-- ── Networking from clients ─────────────────────────────────────────────────

SetInput.OnServerEvent:Connect(function(p, dx, dy)
	local i = inputs[p.UserId]; if not i then return end
	dx, dy = tonumber(dx) or 0, tonumber(dy) or 0
	local m = math.sqrt(dx*dx + dy*dy)
	if m > 1 then dx, dy = dx/m, dy/m end      -- clamp to unit (anti-cheat)
	i.dx, i.dy = dx, dy
	local d = state[p.UserId]
	if d and (dx ~= 0 or dy ~= 0) then d.facing = math.atan2(dy, dx) end
end)

local function nearestSolid(d)
	local best, bestDist
	for _, n in pairs(nodes) do
		if not n.dead then
			local dx, dy = n.x - d.x, n.y - d.y
			local dist = math.sqrt(dx*dx + dy*dy)
			if dist < n.r + PLAYER_R + REACH then
				if not bestDist or dist < bestDist then best, bestDist = n, dist end
			end
		end
	end
	return best
end

DoAction.OnServerEvent:Connect(function(p, action)
	local d = state[p.UserId]; if not d then return end

	if action == "gather" then
		local n = nearestSolid(d)
		if n then
			local def = NODE_DEF[n.k]
			n.hp -= 1
			if def.give == "food" then d.hp = math.min(100, d.hp + 15) end
			if n.hp <= 0 then
				d[def.give] = (d[def.give] or 0) + def.amount
				n.dead = true
				n.respawnAt = os.clock() + def.respawn
				dirty[n.id] = true
			end
		end

	elseif action == "attack" then
		for uid, other in pairs(state) do
			if uid ~= p.UserId then
				local dx, dy = other.x - d.x, other.y - d.y
				if dx*dx + dy*dy < (PLAYER_R*2 + REACH)^2 then
					other.hp -= 18
					if other.hp <= 0 then
						other.hp = 100
						other.x, other.y = freeSpawn()
					end
				end
			end
		end
	end
end)

-- ── Simulation loop ─────────────────────────────────────────────────────────

local function collideNodes(d)
	for _, n in pairs(nodes) do
		if not n.dead and NODE_DEF[n.k].solid then
			local dx, dy = d.x - n.x, d.y - n.y
			local dist = math.sqrt(dx*dx + dy*dy)
			local minD = n.r + PLAYER_R
			if dist < minD and dist > 0 then
				local push = (minD - dist)
				d.x = d.x + (dx/dist) * push
				d.y = d.y + (dy/dist) * push
			end
		end
	end
end

RunService.Heartbeat:Connect(function(dt)
	-- move players
	for uid, d in pairs(state) do
		local i = inputs[uid]
		if i and (i.dx ~= 0 or i.dy ~= 0) then
			d.x = d.x + i.dx * PLAYER_SPD * dt
			d.y = d.y + i.dy * PLAYER_SPD * dt
			d.x = math.clamp(d.x, PLAYER_R, WORLD_W - PLAYER_R)
			d.y = math.clamp(d.y, PLAYER_R, WORLD_H - PLAYER_R)
			collideNodes(d)
		end
	end
	-- respawn nodes
	local now = os.clock()
	for _, n in pairs(nodes) do
		if n.dead and now >= n.respawnAt then
			n.dead = false
			n.hp   = NODE_DEF[n.k].hp
			dirty[n.id] = true
		end
	end
end)

-- ── Snapshot broadcast (≈18 Hz) ─────────────────────────────────────────────

task.spawn(function()
	while true do
		task.wait(1/18)

		local players = {}
		for uid, d in pairs(state) do
			players[#players+1] = {
				uid = uid, name = d.name, x = d.x, y = d.y, hp = d.hp,
				wood = d.wood, stone = d.stone, food = d.food, facing = d.facing,
			}
		end

		local changed = nil
		if next(dirty) then
			changed = {}
			for id in pairs(dirty) do
				if nodes[id] then changed[#changed+1] = nodeWire(nodes[id]) end
			end
			dirty = {}
		end

		Snapshot:FireAllClients(players, changed)
	end
end)

-- ── Lifecycle ───────────────────────────────────────────────────────────────

Players.PlayerAdded:Connect(function(p)
	addPlayer(p)
	task.wait(1)
	WorldInit:FireClient(p, fullNodeList(), WORLD_W, WORLD_H, PLAYER_R)
end)

Players.PlayerRemoving:Connect(function(p)
	state[p.UserId]  = nil
	inputs[p.UserId] = nil
end)

for _, p in ipairs(Players:GetPlayers()) do
	addPlayer(p)
	WorldInit:FireClient(p, fullNodeList(), WORLD_W, WORLD_H, PLAYER_R)
end
