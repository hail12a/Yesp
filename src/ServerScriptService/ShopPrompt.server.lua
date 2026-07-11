-- ============================================================
-- ShopPrompt  (Script)
-- Place in: ServerScriptService
--
-- Finds the Part named "Shop" in Workspace and attaches a
-- ProximityPrompt (hold E for 1 second). When triggered, tells that
-- player's client to open the dealership.
--
-- SETUP:
--   Workspace > Part named "Shop"
--   ReplicatedStorage > RemoteEvent "OpenDealership"
-- ============================================================

local Workspace         = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local openEvent = ReplicatedStorage:WaitForChild("OpenDealership")

local function setupShop(shop)
	if not shop:IsA("BasePart") then return end
	-- avoid duplicate prompts
	if shop:FindFirstChild("ShopPrompt") then return end

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "ShopPrompt"
	prompt.ActionText = "Dealership"
	prompt.ObjectText = "Shop"
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.HoldDuration = 1          -- hold E for 1 second
	prompt.MaxActivationDistance = 12
	prompt.RequiresLineOfSight = false
	prompt.Parent = shop

	prompt.Triggered:Connect(function(player)
		openEvent:FireClient(player)
	end)
end

-- attach to existing Shop part(s)
for _, obj in ipairs(Workspace:GetDescendants()) do
	if obj:IsA("BasePart") and obj.Name == "Shop" then
		setupShop(obj)
	end
end

-- attach to any Shop parts added later
Workspace.DescendantAdded:Connect(function(obj)
	if obj:IsA("BasePart") and obj.Name == "Shop" then
		setupShop(obj)
	end
end)
