-- ============================================================
-- CrownHat  (Script)
-- Place in: ServerScriptService
--
-- Gives a custom mesh hat (crown) to a specific player on spawn.
-- ============================================================

local Players = game:GetService("Players")

local MESH_ID = "rbxassetid://959221541"
local TEXTURE_ID = "rbxassetid://959221603"

local function giveHat(player)
	local char = player.Character or player.CharacterAdded:Wait()
	local head = char:WaitForChild("Head")

	local old = char:FindFirstChild("MeshHat")
	if old then old:Destroy() end

	local hat = Instance.new("Accessory")
	hat.Name = "MeshHat"

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(1, 1, 1)
	handle.CanCollide = false
	handle.Massless = true
	handle.Anchored = false
	handle.Parent = hat

	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.FileMesh
	mesh.MeshId = MESH_ID
	mesh.TextureId = TEXTURE_ID
	mesh.Scale = Vector3.new(1, 1, 1)
	mesh.Offset = Vector3.new(0, 0.6, 0) -- raises crown above head; tweak this
	mesh.Parent = handle

	local attach = Instance.new("Attachment")
	attach.Name = "HatAttachment"
	attach.Position = Vector3.new(0, 0, 0) -- keep at origin
	attach.Parent = handle

	local headAttach = head:FindFirstChild("HatAttachment")
	if not headAttach then
		headAttach = Instance.new("Attachment")
		headAttach.Name = "HatAttachment"
		headAttach.Position = Vector3.new(0, 0.5, 0) -- top of head
		headAttach.Parent = head
	end

	hat.Parent = char
end

local function onAdded(player)
	if player.Name == "JunkoProblem" then
		if player.Character then giveHat(player) end
		player.CharacterAdded:Connect(function()
			giveHat(player)
		end)
	end
end

for _, p in ipairs(Players:GetPlayers()) do
	onAdded(p)
end

Players.PlayerAdded:Connect(onAdded)
