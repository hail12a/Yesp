-- ============================================================
-- DealershipClient  (LocalScript)
-- Place in: StarterPlayer > StarterPlayerScripts
--
-- Redesigned dealership UI (opens from the Shop ProximityPrompt):
--   - CENTERED panel (not full-screen), rounded card
--   - top bar: Filters dropdown  |  Clear filters  |  Search box  |  Exit (X)
--   - money display top-right
--   - RIGHT side: "Car Type" dropdown (Normal/Sports/Classic/Public Service/Funny)
--   - 3-column grid of cars with badges + type label + price
--   - click a car -> detail page, car preview, Buy button
--   - "Car bought" toast notification
--
-- Also exposes globals the garage uses to sell cars.
--
-- SETUP (client-side reads these):
--   ReplicatedStorage > ModuleScript "CarCatalog"
--   ReplicatedStorage > RemoteFunction "DealerRequest"
--   ReplicatedStorage > RemoteEvent "DealerNotify"
--   ReplicatedStorage > RemoteEvent "OpenDealership"
--   ReplicatedStorage > Folder "PreviewCars"  (built by server)
-- ============================================================

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService        = game:GetService("RunService")
local TweenService      = game:GetService("TweenService")

local player    = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local CarCatalog  = require(ReplicatedStorage:WaitForChild("CarCatalog"))
local requestFn   = ReplicatedStorage:WaitForChild("DealerRequest")
local notifyEvent = ReplicatedStorage:WaitForChild("DealerNotify")
local openEvent   = ReplicatedStorage:WaitForChild("OpenDealership")
local previewCars = ReplicatedStorage:WaitForChild("PreviewCars", 20)

-- ============================================================
-- CAMERA GUARD (unchanged)
-- ============================================================
task.spawn(function()
	local cam = workspace.CurrentCamera
	while true do
		task.wait(0.5)
		cam = workspace.CurrentCamera
		if cam then
			local char = player.Character
			local humanoid = char and char:FindFirstChildOfClass("Humanoid")
			local sitting = humanoid and humanoid.Sit
			if not sitting then
				if cam.CameraType ~= Enum.CameraType.Custom then
					cam.CameraType = Enum.CameraType.Custom
				end
				if humanoid and cam.CameraSubject ~= humanoid then
					cam.CameraSubject = humanoid
				end
			end
		end
	end
end)

-- ===== theme =====
local COL_DIM     = Color3.fromRGB(0, 0, 0)      -- dimmed backdrop
local COL_BG      = Color3.fromRGB(28, 30, 36)   -- main panel
local COL_HEADER  = Color3.fromRGB(20, 22, 27)
local COL_CARD    = Color3.fromRGB(40, 43, 51)
local COL_CARD2   = Color3.fromRGB(52, 56, 66)
local COL_TEXT    = Color3.fromRGB(240, 240, 240)
local COL_SUB     = Color3.fromRGB(160, 165, 175)
local COL_GREEN   = Color3.fromRGB(80, 200, 120)
local COL_BUY     = Color3.fromRGB(60, 140, 220)
local COL_PILLBG  = Color3.fromRGB(48, 51, 60)
local FONT        = Enum.Font.GothamBold
local FONT_REG    = Enum.Font.Gotham

local function commas(n)
	local s = tostring(math.floor(n))
	return (s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", ""))
end

local function typeLabel(id)
	return (CarCatalog.CAR_TYPE_LABELS and CarCatalog.CAR_TYPE_LABELS[id]) or id or "Normal"
end

-- ============================================================
-- ROOT + DIM BACKDROP
-- ============================================================
local gui = Instance.new("ScreenGui")
gui.Name = "DealershipUI"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Enabled = false
gui.DisplayOrder = 50
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = playerGui

-- full-screen dim behind the centered panel
local dim = Instance.new("Frame")
dim.Size = UDim2.new(1, 0, 1, 0)
dim.BackgroundColor3 = COL_DIM
dim.BackgroundTransparency = 0.4
dim.BorderSizePixel = 0
dim.Visible = false
dim.Parent = gui

-- CENTERED main panel
local root = Instance.new("Frame")
root.AnchorPoint = Vector2.new(0.5, 0.5)
root.Position = UDim2.new(0.5, 0, 0.5, 0)
root.Size = UDim2.new(0, 900, 0, 560)
root.BackgroundColor3 = COL_BG
root.BorderSizePixel = 0
root.Visible = false
root.Parent = gui
local rootCorner = Instance.new("UICorner") rootCorner.CornerRadius = UDim.new(0, 16) rootCorner.Parent = root

-- responsive clamp so it fits small screens
local rootConstraint = Instance.new("UISizeConstraint")
rootConstraint.MaxSize = Vector2.new(900, 560)
rootConstraint.MinSize = Vector2.new(360, 320)
rootConstraint.Parent = root

-- ============================================================
-- HEADER
-- ============================================================
local header = Instance.new("Frame")
header.Size = UDim2.new(1, 0, 0, 56)
header.BackgroundColor3 = COL_HEADER
header.BorderSizePixel = 0
header.Parent = root
local headerCorner = Instance.new("UICorner") headerCorner.CornerRadius = UDim.new(0, 16) headerCorner.Parent = header
-- square off the bottom corners of the header
local headerFix = Instance.new("Frame")
headerFix.Position = UDim2.new(0, 0, 1, -16)
headerFix.Size = UDim2.new(1, 0, 0, 16)
headerFix.BackgroundColor3 = COL_HEADER
headerFix.BorderSizePixel = 0
headerFix.Parent = header

local title = Instance.new("TextLabel")
title.Position = UDim2.new(0, 22, 0, 0)
title.Size = UDim2.new(0, 260, 1, 0)
title.BackgroundTransparency = 1
title.Font = FONT
title.TextSize = 24
title.TextColor3 = COL_TEXT
title.TextXAlignment = Enum.TextXAlignment.Left
title.Text = "Dealership"
title.ZIndex = 2
title.Parent = header

-- money display (top-right)
local moneyPill = Instance.new("Frame")
moneyPill.AnchorPoint = Vector2.new(1, 0.5)
moneyPill.Position = UDim2.new(1, -74, 0.5, 0)
moneyPill.Size = UDim2.new(0, 200, 0, 34)
moneyPill.BackgroundColor3 = COL_PILLBG
moneyPill.BorderSizePixel = 0
moneyPill.ZIndex = 2
moneyPill.Parent = header
local mpc = Instance.new("UICorner") mpc.CornerRadius = UDim.new(1, 0) mpc.Parent = moneyPill

local moneyIcon = Instance.new("TextLabel")
moneyIcon.Position = UDim2.new(0, 12, 0, 0)
moneyIcon.Size = UDim2.new(0, 22, 1, 0)
moneyIcon.BackgroundTransparency = 1
moneyIcon.Font = FONT
moneyIcon.TextSize = 16
moneyIcon.TextColor3 = COL_GREEN
moneyIcon.Text = "$"
moneyIcon.ZIndex = 3
moneyIcon.Parent = moneyPill

local moneyLbl = Instance.new("TextLabel")
moneyLbl.Position = UDim2.new(0, 30, 0, 0)
moneyLbl.Size = UDim2.new(1, -40, 1, 0)
moneyLbl.BackgroundTransparency = 1
moneyLbl.Font = FONT
moneyLbl.TextSize = 16
moneyLbl.TextColor3 = COL_TEXT
moneyLbl.TextXAlignment = Enum.TextXAlignment.Right
moneyLbl.Text = "0"
moneyLbl.ZIndex = 3
moneyLbl.Parent = moneyPill

-- keep money label live
local function hookMoney()
	local ls = player:FindFirstChild("leaderstats")
	local m = ls and ls:FindFirstChild("Money")
	if m then
		moneyLbl.Text = commas(m.Value)
		m:GetPropertyChangedSignal("Value"):Connect(function()
			moneyLbl.Text = commas(m.Value)
		end)
	end
end
task.spawn(function()
	local ls = player:WaitForChild("leaderstats", 30)
	if ls then ls:WaitForChild("Money", 30) end
	hookMoney()
end)

-- Exit (X) top-right
local closeBtn = Instance.new("TextButton")
closeBtn.AnchorPoint = Vector2.new(1, 0.5)
closeBtn.Position = UDim2.new(1, -18, 0.5, 0)
closeBtn.Size = UDim2.new(0, 40, 0, 40)
closeBtn.BackgroundColor3 = Color3.fromRGB(200, 55, 55)
closeBtn.BorderSizePixel = 0
closeBtn.Font = FONT
closeBtn.TextSize = 22
closeBtn.TextColor3 = COL_TEXT
closeBtn.Text = "X"
closeBtn.ZIndex = 2
closeBtn.Parent = header
local xcorner = Instance.new("UICorner") xcorner.CornerRadius = UDim.new(0, 10) xcorner.Parent = closeBtn

-- ============================================================
-- TOP CONTROL BAR: Filters dropdown | Clear filters | Search
-- ============================================================
local controlBar = Instance.new("Frame")
controlBar.Position = UDim2.new(0, 18, 0, 66)
controlBar.Size = UDim2.new(1, -36, 0, 38)
controlBar.BackgroundTransparency = 1
controlBar.ZIndex = 5
controlBar.Parent = root

-- ---- Filters dropdown button ----
local filtersBtn = Instance.new("TextButton")
filtersBtn.Position = UDim2.new(0, 0, 0, 0)
filtersBtn.Size = UDim2.new(0, 130, 1, 0)
filtersBtn.BackgroundColor3 = COL_PILLBG
filtersBtn.BorderSizePixel = 0
filtersBtn.Font = FONT
filtersBtn.TextSize = 14
filtersBtn.TextColor3 = COL_TEXT
filtersBtn.Text = "Filters  v"
filtersBtn.ZIndex = 6
filtersBtn.Parent = controlBar
local fbc = Instance.new("UICorner") fbc.CornerRadius = UDim.new(1, 0) fbc.Parent = filtersBtn

-- ---- Clear filters button ----
local clearBtn = Instance.new("TextButton")
clearBtn.Position = UDim2.new(0, 140, 0, 0)
clearBtn.Size = UDim2.new(0, 140, 1, 0)
clearBtn.BackgroundColor3 = COL_PILLBG
clearBtn.BorderSizePixel = 0
clearBtn.Font = FONT
clearBtn.TextSize = 14
clearBtn.TextColor3 = COL_TEXT
clearBtn.Text = "Clear filters  X"
clearBtn.ZIndex = 6
clearBtn.Parent = controlBar
local cbc = Instance.new("UICorner") cbc.CornerRadius = UDim.new(1, 0) cbc.Parent = clearBtn

-- ---- Search box ----
local searchFrame = Instance.new("Frame")
searchFrame.Position = UDim2.new(0, 290, 0, 0)
searchFrame.Size = UDim2.new(1, -290, 1, 0)
searchFrame.BackgroundColor3 = COL_PILLBG
searchFrame.BorderSizePixel = 0
searchFrame.ZIndex = 6
searchFrame.Parent = controlBar
local sfc = Instance.new("UICorner") sfc.CornerRadius = UDim.new(1, 0) sfc.Parent = searchFrame

local searchBox = Instance.new("TextBox")
searchBox.Position = UDim2.new(0, 16, 0, 0)
searchBox.Size = UDim2.new(1, -50, 1, 0)
searchBox.BackgroundTransparency = 1
searchBox.Font = FONT_REG
searchBox.TextSize = 15
searchBox.TextColor3 = COL_TEXT
searchBox.PlaceholderText = "Search..."
searchBox.PlaceholderColor3 = COL_SUB
searchBox.Text = ""
searchBox.TextXAlignment = Enum.TextXAlignment.Left
searchBox.ClearTextOnFocus = false
searchBox.ZIndex = 7
searchBox.Parent = searchFrame

local searchIcon = Instance.new("TextLabel")
searchIcon.AnchorPoint = Vector2.new(1, 0.5)
searchIcon.Position = UDim2.new(1, -14, 0.5, 0)
searchIcon.Size = UDim2.new(0, 22, 0, 22)
searchIcon.BackgroundTransparency = 1
searchIcon.Font = FONT
searchIcon.TextSize = 16
searchIcon.TextColor3 = COL_SUB
searchIcon.Text = "\u{1F50D}"
searchIcon.ZIndex = 7
searchIcon.Parent = searchFrame

-- ============================================================
-- FILTERS DROPDOWN PANEL (badge/price/age filters live here)
-- ============================================================
local currentFilter = "Limiteds"

local filtersPanel = Instance.new("Frame")
filtersPanel.Position = UDim2.new(0, 18, 0, 106)
filtersPanel.Size = UDim2.new(0, 180, 0, 0)
filtersPanel.AutomaticSize = Enum.AutomaticSize.Y
filtersPanel.BackgroundColor3 = COL_HEADER
filtersPanel.BorderSizePixel = 0
filtersPanel.Visible = false
filtersPanel.ZIndex = 20
filtersPanel.Parent = root
local fpc = Instance.new("UICorner") fpc.CornerRadius = UDim.new(0, 10) fpc.Parent = filtersPanel
local fpPad = Instance.new("UIPadding")
fpPad.PaddingTop = UDim.new(0, 6) fpPad.PaddingBottom = UDim.new(0, 6)
fpPad.PaddingLeft = UDim.new(0, 6) fpPad.PaddingRight = UDim.new(0, 6)
fpPad.Parent = filtersPanel
local fpLayout = Instance.new("UIListLayout")
fpLayout.Padding = UDim.new(0, 4)
fpLayout.Parent = filtersPanel

local filterOptions = {
	{ id = "Limiteds",  label = "Limiteds First" },
	{ id = "PriceLow",  label = "Price: Low" },
	{ id = "PriceHigh", label = "Price: High" },
	{ id = "AgeNew",    label = "Newest" },
	{ id = "AgeOld",    label = "Oldest" },
}
local filterOptButtons = {}
for _, opt in ipairs(filterOptions) do
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1, 0, 0, 30)
	b.BackgroundColor3 = (opt.id == currentFilter) and COL_BUY or COL_CARD2
	b.BorderSizePixel = 0
	b.Font = FONT_REG
	b.TextSize = 13
	b.TextColor3 = COL_TEXT
	b.Text = opt.label
	b.ZIndex = 21
	b.Parent = filtersPanel
	local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, 6) c.Parent = b
	filterOptButtons[opt.id] = b
	b.MouseButton1Click:Connect(function()
		currentFilter = opt.id
		for id, btn in pairs(filterOptButtons) do
			btn.BackgroundColor3 = (id == opt.id) and COL_BUY or COL_CARD2
		end
		filtersPanel.Visible = false
		filtersBtn.Text = "Filters  v"
		DealershipClient_render()
	end)
end

filtersBtn.MouseButton1Click:Connect(function()
	filtersPanel.Visible = not filtersPanel.Visible
	filtersBtn.Text = filtersPanel.Visible and "Filters  ^" or "Filters  v"
end)

-- ============================================================
-- RIGHT-SIDE CAR TYPE DROPDOWN
-- ============================================================
local currentType = "All"   -- "All" or one of CarCatalog.CAR_TYPES

-- side column that holds the type dropdown
local typeCol = Instance.new("Frame")
typeCol.AnchorPoint = Vector2.new(1, 0)
typeCol.Position = UDim2.new(1, -18, 0, 116)
typeCol.Size = UDim2.new(0, 170, 1, -134)
typeCol.BackgroundTransparency = 1
typeCol.ZIndex = 8
typeCol.Parent = root

local typeHeading = Instance.new("TextLabel")
typeHeading.Position = UDim2.new(0, 0, 0, 0)
typeHeading.Size = UDim2.new(1, 0, 0, 20)
typeHeading.BackgroundTransparency = 1
typeHeading.Font = FONT
typeHeading.TextSize = 14
typeHeading.TextColor3 = COL_SUB
typeHeading.TextXAlignment = Enum.TextXAlignment.Left
typeHeading.Text = "CAR TYPE"
typeHeading.ZIndex = 9
typeHeading.Parent = typeCol

-- dropdown button
local typeBtn = Instance.new("TextButton")
typeBtn.Position = UDim2.new(0, 0, 0, 24)
typeBtn.Size = UDim2.new(1, 0, 0, 34)
typeBtn.BackgroundColor3 = COL_PILLBG
typeBtn.BorderSizePixel = 0
typeBtn.Font = FONT
typeBtn.TextSize = 14
typeBtn.TextColor3 = COL_TEXT
typeBtn.TextXAlignment = Enum.TextXAlignment.Left
typeBtn.Text = "  All types  v"
typeBtn.ZIndex = 10
typeBtn.Parent = typeCol
local tbc = Instance.new("UICorner") tbc.CornerRadius = UDim.new(0, 8) tbc.Parent = typeBtn

-- dropdown list (opens under the button)
local typeList = Instance.new("Frame")
typeList.Position = UDim2.new(0, 0, 0, 60)
typeList.Size = UDim2.new(1, 0, 0, 0)
typeList.AutomaticSize = Enum.AutomaticSize.Y
typeList.BackgroundColor3 = COL_HEADER
typeList.BorderSizePixel = 0
typeList.Visible = false
typeList.ClipsDescendants = true
typeList.ZIndex = 25
typeList.Parent = typeCol
local tlc = Instance.new("UICorner") tlc.CornerRadius = UDim.new(0, 8) tlc.Parent = typeList
local tlPad = Instance.new("UIPadding")
tlPad.PaddingTop = UDim.new(0, 5) tlPad.PaddingBottom = UDim.new(0, 5)
tlPad.PaddingLeft = UDim.new(0, 5) tlPad.PaddingRight = UDim.new(0, 5)
tlPad.Parent = typeList
local tlLayout = Instance.new("UIListLayout")
tlLayout.Padding = UDim.new(0, 4)
tlLayout.Parent = typeList

-- build type options: All + each type
local typeOptButtons = {}
local function makeTypeOption(id, label)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1, 0, 0, 30)
	b.BackgroundColor3 = (id == currentType) and COL_BUY or COL_CARD2
	b.BorderSizePixel = 0
	b.Font = FONT_REG
	b.TextSize = 13
	b.TextColor3 = COL_TEXT
	b.Text = label
	b.ZIndex = 26
	b.Parent = typeList
	local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, 6) c.Parent = b
	typeOptButtons[id] = b
	b.MouseButton1Click:Connect(function()
		currentType = id
		for tid, btn in pairs(typeOptButtons) do
			btn.BackgroundColor3 = (tid == id) and COL_BUY or COL_CARD2
		end
		typeBtn.Text = "  " .. (id == "All" and "All types" or label) .. "  v"
		typeList.Visible = false
		DealershipClient_render()
	end)
end
makeTypeOption("All", "All types")
for _, t in ipairs(CarCatalog.CAR_TYPES or {}) do
	makeTypeOption(t, typeLabel(t))
end

typeBtn.MouseButton1Click:Connect(function()
	typeList.Visible = not typeList.Visible
	typeBtn.Text = typeList.Visible
		and ("  " .. (currentType == "All" and "All types" or typeLabel(currentType)) .. "  ^")
		or  ("  " .. (currentType == "All" and "All types" or typeLabel(currentType)) .. "  v")
end)

-- ============================================================
-- GRID SCROLL (leaves room for the right type column)
-- ============================================================
local grid = Instance.new("ScrollingFrame")
grid.Position = UDim2.new(0, 18, 0, 116)
grid.Size = UDim2.new(1, -216, 1, -134)   -- -216 leaves ~180 for the type column + gaps
grid.BackgroundTransparency = 1
grid.BorderSizePixel = 0
grid.ScrollBarThickness = 6
grid.CanvasSize = UDim2.new(0, 0, 0, 0)
grid.AutomaticCanvasSize = Enum.AutomaticSize.Y
grid.ZIndex = 2
grid.Parent = root

local gridLayout = Instance.new("UIGridLayout")
gridLayout.CellSize = UDim2.new(0, 200, 0, 168)
gridLayout.CellPadding = UDim2.new(0, 12, 0, 12)
gridLayout.SortOrder = Enum.SortOrder.LayoutOrder
gridLayout.Parent = grid

-- ============================================================
-- DETAIL PAGE (covers the panel)
-- ============================================================
local detail = Instance.new("Frame")
detail.Size = UDim2.new(1, 0, 1, 0)
detail.BackgroundColor3 = COL_BG
detail.BorderSizePixel = 0
detail.Visible = false
detail.ZIndex = 30
detail.Parent = root
local detCorner = Instance.new("UICorner") detCorner.CornerRadius = UDim.new(0, 16) detCorner.Parent = detail

local detailBack = Instance.new("TextButton")
detailBack.AnchorPoint = Vector2.new(1, 0)
detailBack.Position = UDim2.new(1, -70, 0, 18)
detailBack.Size = UDim2.new(0, 96, 0, 34)
detailBack.BackgroundColor3 = COL_CARD2
detailBack.BorderSizePixel = 0
detailBack.Font = FONT
detailBack.TextSize = 15
detailBack.TextColor3 = COL_TEXT
detailBack.Text = "< Back"
detailBack.ZIndex = 31
detailBack.Parent = detail
local dbc = Instance.new("UICorner") dbc.CornerRadius = UDim.new(0, 8) dbc.Parent = detailBack

local detailClose = Instance.new("TextButton")
detailClose.AnchorPoint = Vector2.new(1, 0)
detailClose.Position = UDim2.new(1, -22, 0, 18)
detailClose.Size = UDim2.new(0, 38, 0, 34)
detailClose.BackgroundColor3 = Color3.fromRGB(200, 55, 55)
detailClose.BorderSizePixel = 0
detailClose.Font = FONT
detailClose.TextSize = 18
detailClose.TextColor3 = COL_TEXT
detailClose.Text = "X"
detailClose.ZIndex = 31
detailClose.Parent = detail
local dcc = Instance.new("UICorner") dcc.CornerRadius = UDim.new(0, 8) dcc.Parent = detailClose

local detailImage = Instance.new("ViewportFrame")
detailImage.Position = UDim2.new(0.06, 0, 0.10, 0)
detailImage.Size = UDim2.new(0.88, 0, 0.44, 0)
detailImage.BackgroundColor3 = Color3.fromRGB(30, 32, 38)
detailImage.BorderSizePixel = 0
detailImage.ZIndex = 31
detailImage.Parent = detail
local dvc = Instance.new("UICorner") dvc.CornerRadius = UDim.new(0, 14) dvc.Parent = detailImage
local detailCam = Instance.new("Camera")
detailImage.CurrentCamera = detailCam

local detailName = Instance.new("TextLabel")
detailName.Position = UDim2.new(0.06, 0, 0.57, 0)
detailName.Size = UDim2.new(0.6, 0, 0, 32)
detailName.BackgroundTransparency = 1
detailName.Font = FONT
detailName.TextSize = 22
detailName.TextColor3 = COL_TEXT
detailName.TextXAlignment = Enum.TextXAlignment.Left
detailName.TextWrapped = true
detailName.ZIndex = 31
detailName.Parent = detail

-- car-type label on the detail page
local detailType = Instance.new("TextLabel")
detailType.Position = UDim2.new(0.06, 0, 0.64, 0)
detailType.Size = UDim2.new(0.6, 0, 0, 20)
detailType.BackgroundTransparency = 1
detailType.Font = FONT_REG
detailType.TextSize = 14
detailType.TextColor3 = COL_SUB
detailType.TextXAlignment = Enum.TextXAlignment.Left
detailType.Text = ""
detailType.ZIndex = 31
detailType.Parent = detail

local modelDropdown = Instance.new("TextButton")
modelDropdown.Position = UDim2.new(0.06, 0, 0.69, 0)
modelDropdown.Size = UDim2.new(0.42, 0, 0, 30)
modelDropdown.BackgroundColor3 = COL_CARD2
modelDropdown.BorderSizePixel = 0
modelDropdown.Font = FONT
modelDropdown.TextSize = 14
modelDropdown.TextColor3 = COL_TEXT
modelDropdown.TextXAlignment = Enum.TextXAlignment.Left
modelDropdown.Text = "  Choose model  v"
modelDropdown.Visible = false
modelDropdown.ZIndex = 32
modelDropdown.Parent = detail
local mdc = Instance.new("UICorner") mdc.CornerRadius = UDim.new(0, 8) mdc.Parent = modelDropdown

local dropdownList = Instance.new("Frame")
dropdownList.Position = UDim2.new(0.06, 0, 0.69, 34)
dropdownList.Size = UDim2.new(0.42, 0, 0, 0)
dropdownList.AutomaticSize = Enum.AutomaticSize.Y
dropdownList.BackgroundColor3 = Color3.fromRGB(24, 26, 32)
dropdownList.BorderSizePixel = 0
dropdownList.Visible = false
dropdownList.ZIndex = 40
dropdownList.Parent = detail
local dlc = Instance.new("UICorner") dlc.CornerRadius = UDim.new(0, 8) dlc.Parent = dropdownList
local dlLayout = Instance.new("UIListLayout") dlLayout.Parent = dropdownList

local detailInfo = Instance.new("TextLabel")
detailInfo.Position = UDim2.new(0.06, 0, 0.77, 0)
detailInfo.Size = UDim2.new(0.6, 0, 0.18, 0)
detailInfo.BackgroundTransparency = 1
detailInfo.Font = FONT_REG
detailInfo.TextSize = 16
detailInfo.TextColor3 = COL_SUB
detailInfo.TextXAlignment = Enum.TextXAlignment.Left
detailInfo.TextYAlignment = Enum.TextYAlignment.Top
detailInfo.TextWrapped = true
detailInfo.ZIndex = 31
detailInfo.Parent = detail

local buyBtn = Instance.new("TextButton")
buyBtn.AnchorPoint = Vector2.new(1, 1)
buyBtn.Position = UDim2.new(0.94, 0, 0.92, 0)
buyBtn.Size = UDim2.new(0.34, 0, 0, 46)
buyBtn.BackgroundColor3 = COL_GREEN
buyBtn.BorderSizePixel = 0
buyBtn.Font = FONT
buyBtn.TextSize = 18
buyBtn.TextColor3 = COL_TEXT
buyBtn.Text = "Buy"
buyBtn.ZIndex = 31
buyBtn.Parent = detail
local bbc = Instance.new("UICorner") bbc.CornerRadius = UDim.new(0, 10) bbc.Parent = buyBtn

-- ============================================================
-- NOTIFICATION TOAST
-- ============================================================
local toastGui = Instance.new("ScreenGui")
toastGui.Name = "DealershipToast"
toastGui.ResetOnSpawn = false
toastGui.IgnoreGuiInset = true
toastGui.DisplayOrder = 60
toastGui.Parent = playerGui

local toast = Instance.new("TextLabel")
toast.AnchorPoint = Vector2.new(0.5, 1)
toast.Position = UDim2.new(0.5, 0, 1, -30)
toast.Size = UDim2.new(0, 420, 0, 46)
toast.BackgroundColor3 = Color3.fromRGB(30, 32, 38)
toast.BackgroundTransparency = 0.05
toast.BorderSizePixel = 0
toast.Font = FONT
toast.TextSize = 18
toast.TextColor3 = COL_TEXT
toast.Text = ""
toast.Visible = false
toast.ZIndex = 60
toast.Parent = toastGui
local toastCorner = Instance.new("UICorner") toastCorner.CornerRadius = UDim.new(0, 10) toastCorner.Parent = toast

local function showToast(msg)
	toast.Text = "  " .. msg .. "  "
	toast.Visible = true
	task.spawn(function()
		task.wait(3)
		toast.Visible = false
	end)
end
notifyEvent.OnClientEvent:Connect(showToast)

-- ============================================================
-- 3/4 ANGLE THUMBNAIL
-- ============================================================
local function renderThumbnail(viewport, cam, carName)
	for _, c in ipairs(viewport:GetChildren()) do
		if c:IsA("Model") then c:Destroy() end
	end
	if not previewCars then return end
	local template = previewCars:FindFirstChild(carName)
	if not template then return end

	local model = template:Clone()
	model.Parent = viewport

	local cf, size = model:GetBoundingBox()
	local center = cf.Position
	local radius = math.max(size.Magnitude / 2, 1)
	local dist = radius / math.tan(math.rad(cam.FieldOfView / 2)) * 1.15

	local dir = Vector3.new(1, 0.55, 1).Unit
	local camPos = center + dir * dist
	cam.CFrame = CFrame.new(camPos, center)
end

-- ============================================================
-- STATE + DATA
-- ============================================================
local catalogData = {}
local ownedData = {}
local sellRefund = 0.75

local function refreshData()
	local res = requestFn:InvokeServer("getdata")
	if res then
		catalogData = res.catalog or {}
		ownedData = res.owned or {}
		sellRefund = res.sellRefund or 0.75
	end
end

-- ============================================================
-- BADGE PILL
-- ============================================================
local function addBadge(parent, badgeId, xOrder)
	local label = CarCatalog.BADGE_LABELS[badgeId] or badgeId
	local baseColor = CarCatalog.BADGE_COLORS[badgeId] or Color3.fromRGB(120,120,120)
	local style = (CarCatalog.BADGE_STYLES and CarCatalog.BADGE_STYLES[badgeId]) or {}

	local pill = Instance.new("TextLabel")
	pill.Size = UDim2.new(0, 0, 0, 18)
	pill.AutomaticSize = Enum.AutomaticSize.X
	pill.BackgroundColor3 = baseColor
	pill.BorderSizePixel = 0
	pill.Font = FONT
	pill.TextSize = 11
	pill.TextColor3 = style.textColor or Color3.fromRGB(20, 20, 20)
	pill.Text = "  " .. label .. "  "
	pill.LayoutOrder = xOrder
	pill.ZIndex = 6
	pill.Parent = parent
	local pc = Instance.new("UICorner") pc.CornerRadius = UDim.new(1, 0) pc.Parent = pill

	if style.gradient then
		local grad = Instance.new("UIGradient")
		grad.Color = ColorSequence.new(style.gradient[1], style.gradient[2])
		grad.Rotation = 25
		grad.Parent = pill
		if style.shimmer then
			task.spawn(function()
				while pill.Parent do
					grad.Offset = Vector2.new(-1, 0)
					local t = TweenService:Create(grad, TweenInfo.new(1.6, Enum.EasingStyle.Sine), { Offset = Vector2.new(1, 0) })
					t:Play() t.Completed:Wait()
					if not pill.Parent then break end
					task.wait(0.6)
				end
			end)
		end
	end
	if style.stroke then
		local uis = Instance.new("UIStroke")
		uis.Color = style.stroke[1]
		uis.Thickness = style.stroke[2] or 1
		uis.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
		uis.Parent = pill
	end
	if style.glow then
		local glow = Instance.new("ImageLabel")
		glow.BackgroundTransparency = 1
		glow.Image = "rbxassetid://5028857084"
		glow.ImageColor3 = style.gradient and style.gradient[1] or baseColor
		glow.ImageTransparency = 0.35
		glow.Size = UDim2.new(1, 20, 1, 20)
		glow.Position = UDim2.new(0, -10, 0, -10)
		glow.ZIndex = 5
		glow.Parent = pill
		task.spawn(function()
			while glow.Parent do
				local t1 = TweenService:Create(glow, TweenInfo.new(1.1, Enum.EasingStyle.Sine), { ImageTransparency = 0.6 })
				t1:Play() t1.Completed:Wait()
				if not glow.Parent then break end
				local t2 = TweenService:Create(glow, TweenInfo.new(1.1, Enum.EasingStyle.Sine), { ImageTransparency = 0.3 })
				t2:Play() t2.Completed:Wait()
			end
		end)
	end
end

-- ============================================================
-- DETAIL PAGE
-- ============================================================
local selectedModel = nil
local currentEntry = nil

local function updateDetailFor(modelName, price, desc, year, status, carType)
	selectedModel = modelName
	renderThumbnail(detailImage, detailCam, modelName)

	detailType.Text = "Type: " .. typeLabel(carType)
	local tcol = CarCatalog.CAR_TYPE_COLORS and CarCatalog.CAR_TYPE_COLORS[carType]
	if tcol then detailType.TextColor3 = tcol else detailType.TextColor3 = COL_SUB end

	local infoLines = {}
	if year then table.insert(infoLines, "Year: " .. year) end
	if price then table.insert(infoLines, "Price: $" .. commas(price)) end
	if desc then table.insert(infoLines, desc) end
	if status == "OffSale" then
		table.insert(infoLines, "\nThis car is Off-Sale and cannot be purchased.")
	end
	detailInfo.Text = table.concat(infoLines, "\n")

	local owned = ownedData[modelName] ~= nil
	if owned then
		buyBtn.Text = "Owned"
		buyBtn.BackgroundColor3 = COL_CARD2
		buyBtn.Active = false
	elseif status == "OffSale" then
		buyBtn.Text = "Off-Sale"
		buyBtn.BackgroundColor3 = Color3.fromRGB(90, 90, 90)
		buyBtn.Active = false
	else
		buyBtn.Text = "Buy  $" .. commas(price or 0)
		buyBtn.BackgroundColor3 = COL_GREEN
		buyBtn.Active = true
	end
end

local function openDetail(entry)
	detail.Visible = true
	currentEntry = entry
	detailName.Text = entry.name
	dropdownList.Visible = false

	if entry.variants and #entry.variants > 0 then
		modelDropdown.Visible = true
		local first = entry.variants[1]
		modelDropdown.Text = "  " .. (first.model or "Choose model") .. "  v"
		updateDetailFor(first.model, first.price, first.desc, first.year, "OnSale", entry.carType)

		for _, c in ipairs(dropdownList:GetChildren()) do
			if c:IsA("TextButton") then c:Destroy() end
		end
		for _, v in ipairs(entry.variants) do
			local opt = Instance.new("TextButton")
			opt.Size = UDim2.new(1, 0, 0, 28)
			opt.BackgroundColor3 = Color3.fromRGB(24, 26, 32)
			opt.BorderSizePixel = 0
			opt.Font = FONT_REG
			opt.TextSize = 13
			opt.TextColor3 = COL_TEXT
			opt.Text = "  " .. v.model
			opt.TextXAlignment = Enum.TextXAlignment.Left
			opt.ZIndex = 41
			opt.Parent = dropdownList
			opt.MouseButton1Click:Connect(function()
				modelDropdown.Text = "  " .. v.model .. "  v"
				dropdownList.Visible = false
				updateDetailFor(v.model, v.price, v.desc, v.year, "OnSale", entry.carType)
			end)
		end
	else
		modelDropdown.Visible = false
		updateDetailFor(entry.name, entry.price, nil, entry.year, entry.status, entry.carType)
	end
end

modelDropdown.MouseButton1Click:Connect(function()
	dropdownList.Visible = not dropdownList.Visible
end)

buyBtn.MouseButton1Click:Connect(function()
	if not buyBtn.Active or not selectedModel then return end
	buyBtn.Active = false
	local res = requestFn:InvokeServer("buy", selectedModel)
	if res then
		showToast(res.msg)
		if res.ok then
			refreshData()
			buyBtn.Text = "Owned"
			buyBtn.BackgroundColor3 = COL_CARD2
		else
			buyBtn.Active = true
		end
	end
end)

detailBack.MouseButton1Click:Connect(function()
	detail.Visible = false
	dropdownList.Visible = false
end)

-- ============================================================
-- GRID RENDER (filters + type filter + search)
-- ============================================================
function DealershipClient_render()
	for _, c in ipairs(grid:GetChildren()) do
		if c:IsA("TextButton") then c:Destroy() end
	end

	local searchText = string.lower(searchBox.Text or "")

	-- copy + apply type filter + search filter
	local list = {}
	for _, e in ipairs(catalogData) do
		local passType = (currentType == "All") or ((e.carType or "Normal") == currentType)
		local passSearch = (searchText == "") or (string.find(string.lower(e.name), searchText, 1, true) ~= nil)
		if passType and passSearch then
			table.insert(list, e)
		end
	end

	local function isLimited(e)
		for _, b in ipairs(e.badges or {}) do
			if b == "Limited" then return true end
		end
		return false
	end

	if currentFilter == "Limiteds" then
		table.sort(list, function(a, b)
			if isLimited(a) ~= isLimited(b) then return isLimited(a) end
			return (a.price or 0) > (b.price or 0)
		end)
	elseif currentFilter == "PriceLow" then
		table.sort(list, function(a, b) return (a.price or math.huge) < (b.price or math.huge) end)
	elseif currentFilter == "PriceHigh" then
		table.sort(list, function(a, b) return (a.price or 0) > (b.price or 0) end)
	elseif currentFilter == "AgeNew" then
		table.sort(list, function(a, b) return (a.year or 0) > (b.year or 0) end)
	elseif currentFilter == "AgeOld" then
		table.sort(list, function(a, b) return (a.year or 9999) < (b.year or 9999) end)
	end

	-- empty-state message
	if #list == 0 then
		local empty = Instance.new("TextButton")
		empty.BackgroundTransparency = 1
		empty.Text = "No cars match your filters."
		empty.Font = FONT_REG
		empty.TextSize = 15
		empty.TextColor3 = COL_SUB
		empty.Size = UDim2.new(0, 200, 0, 168)
		empty.AutoButtonColor = false
		empty.Active = false
		empty.LayoutOrder = 1
		empty.Parent = grid
		return
	end

	for i, entry in ipairs(list) do
		local card = Instance.new("TextButton")
		card.BackgroundColor3 = COL_CARD
		card.BorderSizePixel = 0
		card.Text = ""
		card.AutoButtonColor = true
		card.LayoutOrder = i
		card.Parent = grid
		local cc = Instance.new("UICorner") cc.CornerRadius = UDim.new(0, 10) cc.Parent = card

		local vp = Instance.new("ViewportFrame")
		vp.Position = UDim2.new(0, 8, 0, 8)
		vp.Size = UDim2.new(1, -16, 0, 92)
		vp.BackgroundColor3 = Color3.fromRGB(28, 30, 36)
		vp.BorderSizePixel = 0
		vp.Active = false
		vp.Parent = card
		local vpc = Instance.new("UICorner") vpc.CornerRadius = UDim.new(0, 8) vpc.Parent = vp
		local vpCam = Instance.new("Camera")
		vp.CurrentCamera = vpCam
		renderThumbnail(vp, vpCam, entry.previewModel or entry.name)

		local nameLbl = Instance.new("TextLabel")
		nameLbl.Position = UDim2.new(0, 10, 0, 104)
		nameLbl.Size = UDim2.new(1, -20, 0, 18)
		nameLbl.BackgroundTransparency = 1
		nameLbl.Font = FONT
		nameLbl.TextSize = 13
		nameLbl.TextColor3 = COL_TEXT
		nameLbl.TextXAlignment = Enum.TextXAlignment.Left
		nameLbl.TextTruncate = Enum.TextTruncate.AtEnd
		nameLbl.Text = entry.name
		nameLbl.Parent = card

		-- car TYPE label (like "Classic" / "Sports" in the reference)
		local typeLbl = Instance.new("TextLabel")
		typeLbl.Position = UDim2.new(0, 10, 0, 122)
		typeLbl.Size = UDim2.new(1, -20, 0, 14)
		typeLbl.BackgroundTransparency = 1
		typeLbl.Font = FONT_REG
		typeLbl.TextSize = 12
		typeLbl.TextColor3 = (CarCatalog.CAR_TYPE_COLORS and CarCatalog.CAR_TYPE_COLORS[entry.carType]) or COL_SUB
		typeLbl.TextXAlignment = Enum.TextXAlignment.Left
		typeLbl.Text = typeLabel(entry.carType)
		typeLbl.Parent = card

		-- price / status line
		local priceLbl = Instance.new("TextLabel")
		priceLbl.Position = UDim2.new(0, 10, 0, 136)
		priceLbl.Size = UDim2.new(1, -20, 0, 16)
		priceLbl.BackgroundTransparency = 1
		priceLbl.Font = FONT
		priceLbl.TextSize = 13
		priceLbl.TextColor3 = COL_GREEN
		priceLbl.TextXAlignment = Enum.TextXAlignment.Left
		if entry.status == "OffSale" then
			priceLbl.Text = "Off-Sale"
			priceLbl.TextColor3 = Color3.fromRGB(200, 90, 90)
		elseif entry.variants and #entry.variants > 1 then
			priceLbl.Text = ("From $%s  •  %d models"):format(commas(entry.price or 0), #entry.variants)
		else
			priceLbl.Text = "Starting at $" .. commas(entry.price)
		end
		priceLbl.Parent = card

		-- badges row
		local badgeRow = Instance.new("Frame")
		badgeRow.Position = UDim2.new(0, 10, 0, 150)
		badgeRow.Size = UDim2.new(1, -20, 0, 16)
		badgeRow.BackgroundTransparency = 1
		badgeRow.Parent = card
		local brl = Instance.new("UIListLayout")
		brl.FillDirection = Enum.FillDirection.Horizontal
		brl.Padding = UDim.new(0, 4)
		brl.Parent = badgeRow
		for bi, b in ipairs(entry.badges or {}) do
			addBadge(badgeRow, b, bi)
		end

		card.MouseButton1Click:Connect(function()
			openDetail(entry)
		end)
	end
end

-- ============================================================
-- CLEAR FILTERS + SEARCH HOOKS
-- ============================================================
clearBtn.MouseButton1Click:Connect(function()
	currentFilter = "Limiteds"
	currentType = "All"
	searchBox.Text = ""
	for id, btn in pairs(filterOptButtons) do
		btn.BackgroundColor3 = (id == "Limiteds") and COL_BUY or COL_CARD2
	end
	for id, btn in pairs(typeOptButtons) do
		btn.BackgroundColor3 = (id == "All") and COL_BUY or COL_CARD2
	end
	typeBtn.Text = "  All types  v"
	filtersBtn.Text = "Filters  v"
	filtersPanel.Visible = false
	typeList.Visible = false
	DealershipClient_render()
end)

-- live search as you type
searchBox:GetPropertyChangedSignal("Text"):Connect(function()
	DealershipClient_render()
end)

-- ============================================================
-- OPEN / CLOSE
-- ============================================================
local function openDealership()
	print("[Dealer] open triggered")
	detail.Visible = false
	filtersPanel.Visible = false
	typeList.Visible = false
	dim.Visible = true
	root.Visible = true
	gui.Enabled = true
	local ok, err = pcall(function()
		refreshData()
		DealershipClient_render()
	end)
	if not ok then
		warn("[Dealer] load/render error:", err)
	end
end

local function closeDealership()
	gui.Enabled = false
	root.Visible = false
	dim.Visible = false
	filtersPanel.Visible = false
	typeList.Visible = false
end

openEvent.OnClientEvent:Connect(openDealership)
closeBtn.MouseButton1Click:Connect(closeDealership)
detailClose.MouseButton1Click:Connect(closeDealership)

-- ============================================================
-- GARAGE HOOK
-- ============================================================
_G.SellCar = function(carName)
	local res = requestFn:InvokeServer("sell", carName)
	if res then showToast(res.msg) end
	return res
end
_G.GetOwnedCars = function()
	local res = requestFn:InvokeServer("getdata")
	return res and res.owned or {}
end
_G.GetGarageData = function()
	local res = requestFn:InvokeServer("getdata")
	if not res then return { owned = {}, catalog = {} } end
	return { owned = res.owned or {}, catalog = res.catalog or {} }
end
