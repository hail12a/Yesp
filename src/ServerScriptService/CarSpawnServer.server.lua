-- ============================================================
-- CarSpawnServer  (Script)
-- Place in: ServerScriptService
--
-- Handles secure car spawning. The client asks to spawn a car by
-- name; the server checks the car exists and (optionally) that the
-- player owns it, then spawns it near them. Never trust the client.
--
-- SETUP:
--   - ReplicatedStorage > RemoteEvent  "SpawnCarEvent"
--   - ServerStorage > Folder "DealerCars"  (put car Models here;
--     each Model must have a PrimaryPart set)
--   - Ownership: by default everyone can spawn any car. To gate by
--     ownership, fill OWNERSHIP or wire it to your future shop system.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")

local spawnEvent = ReplicatedStorage:WaitForChild("SpawnCarEvent")
local carModels = ServerStorage:WaitForChild("DealerCars")

-- Optional: track spawned cars per player so each only has one out at a time
local activeCars = {}

-- Ownership check placeholder. Return true if player may spawn carName.
-- For now: everyone can spawn everything. Later, check your shop/DataStore.
local function ownsCar(player, carName)
	return true
end

spawnEvent.OnServerEvent:Connect(function(player, carName)
	if type(carName) ~= "string" then return end

	local template = carModels:FindFirstChild(carName)
	if not template or not template:IsA("Model") then
		warn("[CarSpawn]", player.Name, "requested unknown car:", carName)
		return
	end

	if not ownsCar(player, carName) then
		warn("[CarSpawn]", player.Name, "does not own:", carName)
		return
	end

	local character = player.Character
	if not character then return end
	local hrp = character:FindFirstChild("HumanoidRootPart")
	if not hrp then return end

	-- remove their previous car
	if activeCars[player.UserId] then
		activeCars[player.UserId]:Destroy()
		activeCars[player.UserId] = nil
	end

	local car = template:Clone()
	if not car.PrimaryPart then
		-- fallback: use first BasePart as primary
		local firstPart = car:FindFirstChildWhichIsA("BasePart", true)
		if firstPart then car.PrimaryPart = firstPart end
	end
	if not car.PrimaryPart then
		warn("[CarSpawn] car has no PrimaryPart:", carName)
		car:Destroy()
		return
	end

	-- place a few studs in front of the player
	local spawnCFrame = hrp.CFrame * CFrame.new(0, 0, -12) + Vector3.new(0, 3, 0)
	car:SetPrimaryPartCFrame(spawnCFrame)
	car.Parent = Workspace

	-- tag owner (useful later for locking/despawning)
	car:SetAttribute("OwnerUserId", player.UserId)
	activeCars[player.UserId] = car
end)

Players.PlayerRemoving:Connect(function(player)
	if activeCars[player.UserId] then
		activeCars[player.UserId]:Destroy()
		activeCars[player.UserId] = nil
	end
end)
