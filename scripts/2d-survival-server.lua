--[[
	2D Survival Game — Server  (ServerScriptService)
	-------------------------------------------------
	Manages the shared world and player states.
	Creates RemoteEvents in ReplicatedStorage automatically.

	Controls:
	  Client fires PlayerAction with ("move","up"/"down"/"left"/"right")
	  Client fires PlayerAction with ("gather")   — chops trees / mines stone
	  Client fires PlayerAction with ("attack")   — damages nearby players

	Broadcasts WorldSync to all clients every action + every 5 s.
	Requires the companion LocalScript in StarterPlayerScripts.
]]

local Players         = game:GetService("Players")
local RunService      = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- ── RemoteEvents ──────────────────────────────────────────────────────────────

local folder = ReplicatedStorage:FindFirstChild("SurvivalEvents")
	or (function()
		local f = Instance.new("Folder")
		f.Name   = "SurvivalEvents"
		f.Parent = ReplicatedStorage
		return f
	end)()

local function makeEvent(name)
	local e = folder:FindFirstChild(name)
	if not e then
		e = Instance.new("RemoteEvent")
		e.Name   = name
		e.Parent = folder
	end
	return e
end

local WorldSync    = makeEvent("WorldSync")     -- server → all clients
local PlayerAction = makeEvent("PlayerAction")  -- client → server

-- ── Map ───────────────────────────────────────────────────────────────────────

local MAP_W, MAP_H = 48, 32

local T = { GRASS=0, TREE=1, STONE=2, WATER=3, FOOD=4 }

-- Procedural world (seeded so it's the same every server start)
math.randomseed(0xBEEF)
local world = {}
for y = 1, MAP_H do
	world[y] = {}
	for x = 1, MAP_W do
		local border = (x == 1 or x == MAP_W or y == 1 or y == MAP_H)
		if border then
			world[y][x] = T.WATER
		else
			local r = math.random()
			if     r < 0.18 then world[y][x] = T.TREE
			elseif r < 0.28 then world[y][x] = T.STONE
			elseif r < 0.33 then world[y][x] = T.FOOD
			else                  world[y][x] = T.GRASS
			end
		end
	end
end

local function flattenMap()
	local t = {}
	for y = 1, MAP_H do
		for x = 1, MAP_W do
			t[#t + 1] = world[y][x]
		end
	end
	return t
end

-- ── Player data ───────────────────────────────────────────────────────────────

local state = {}   -- [userId] = { name, x, y, health, wood, stone, food }

local function findSpawn()
	for _ = 1, 200 do
		local x = math.random(2, MAP_W - 1)
		local y = math.random(2, MAP_H - 1)
		if world[y][x] == T.GRASS then return x, y end
	end
	return 2, 2
end

local function addPlayer(player)
	local x, y = findSpawn()
	state[player.UserId] = {
		name   = player.Name,
		x      = x,  y      = y,
		health = 100,
		wood   = 0,  stone  = 0,  food = 0,
	}
end

local function serializePlayers()
	local t = {}
	for uid, d in pairs(state) do
		t[#t + 1] = {
			uid    = uid,
			name   = d.name,
			x      = d.x,   y      = d.y,
			health = d.health,
			wood   = d.wood, stone  = d.stone, food = d.food,
		}
	end
	return t
end

local function broadcast()
	WorldSync:FireAllClients(flattenMap(), serializePlayers(), MAP_W, MAP_H)
end

-- ── Movement directions ───────────────────────────────────────────────────────

local DIR = {
	up    = { 0, -1 }, down  = { 0,  1 },
	left  = {-1,  0 }, right = { 1,  0 },
}

local WALKABLE = { [T.GRASS]=true, [T.FOOD]=true }

-- ── Action handler ────────────────────────────────────────────────────────────

PlayerAction.OnServerEvent:Connect(function(player, action, param)
	local d = state[player.UserId]
	if not d then return end

	if action == "move" then
		local dir = DIR[param]
		if not dir then return end
		local nx, ny = d.x + dir[1], d.y + dir[2]
		if nx < 1 or nx > MAP_W or ny < 1 or ny > MAP_H then return end
		local tile = world[ny][nx]
		if WALKABLE[tile] then
			if tile == T.FOOD then
				d.food   = d.food + 1
				d.health = math.min(100, d.health + 10)
				world[ny][nx] = T.GRASS
			end
			d.x, d.y = nx, ny
			broadcast()
		end

	elseif action == "gather" then
		local gathered = false
		for _, dir in pairs(DIR) do
			local gx, gy = d.x + dir[1], d.y + dir[2]
			if gx >= 1 and gx <= MAP_W and gy >= 1 and gy <= MAP_H then
				local tile = world[gy][gx]
				if tile == T.TREE then
					d.wood = d.wood + 1
					world[gy][gx] = T.GRASS
					gathered = true
				elseif tile == T.STONE then
					d.stone = d.stone + 1
					world[gy][gx] = T.GRASS
					gathered = true
				end
			end
		end
		if gathered then broadcast() end

	elseif action == "attack" then
		for uid, other in pairs(state) do
			if uid ~= player.UserId then
				if math.abs(other.x - d.x) <= 1 and math.abs(other.y - d.y) <= 1 then
					other.health = other.health - 20
					if other.health <= 0 then
						-- respawn
						other.health = 100
						local sx, sy = findSpawn()
						other.x, other.y = sx, sy
					end
				end
			end
		end
		broadcast()
	end
end)

-- ── Lifecycle ─────────────────────────────────────────────────────────────────

Players.PlayerAdded:Connect(function(player)
	addPlayer(player)
	task.wait(1.5)   -- let LocalScript finish loading
	broadcast()
end)

Players.PlayerRemoving:Connect(function(player)
	state[player.UserId] = nil
	broadcast()
end)

-- Already-in-game players (script hot-reload)
for _, p in ipairs(Players:GetPlayers()) do addPlayer(p) end

-- Periodic keep-alive sync
task.spawn(function()
	while true do
		task.wait(5)
		broadcast()
	end
end)
