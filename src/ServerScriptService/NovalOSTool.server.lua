-- ============================================================
-- NovalOSTool  (Script)
-- Place in: ServerScriptService
--
-- Makes sure every player has a Tool named "NovalOS" in their Backpack.
-- Holding (equipping) the tool makes the phone pop out (handled client-side
-- by StarterPlayerScripts/NovalOS). The tool needs no Handle.
--
-- If you'd rather place the Tool yourself, just drop a Tool named "NovalOS"
-- (RequiresHandle = false) into StarterPack and delete this script.
-- ============================================================

local Players     = game:GetService("Players")
local StarterPack = game:GetService("StarterPack")

local function makeTool()
	local tool = Instance.new("Tool")
	tool.Name = "NovalOS"
	tool.RequiresHandle = false
	tool.CanBeDropped = false
	tool.ToolTip = "Hold to open your phone"
	return tool
end

-- keep one in StarterPack so future spawns get it automatically
if not StarterPack:FindFirstChild("NovalOS") then
	makeTool().Parent = StarterPack
end

local function give(player)
	local function ensure()
		local bp = player:FindFirstChildOfClass("Backpack")
		local char = player.Character
		if bp and not bp:FindFirstChild("NovalOS") and not (char and char:FindFirstChild("NovalOS")) then
			makeTool().Parent = bp
		end
	end
	player.CharacterAdded:Connect(function()
		task.wait(0.5)
		ensure()
	end)
	if player.Character then ensure() end
end

Players.PlayerAdded:Connect(give)
for _, p in ipairs(Players:GetPlayers()) do give(p) end
