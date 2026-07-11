-- ============================================================
-- HudClient v10  (LocalScript)
-- Place in: StarterPlayer > StarterPlayerScripts
-- ============================================================

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TeamsService      = game:GetService("Teams")
local TweenService      = game:GetService("TweenService")

local player    = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Remotes (Non-blocking)
local spawnEvent  = ReplicatedStorage:FindFirstChild("SpawnCarEvent")
local openDealer  = ReplicatedStorage:FindFirstChild("OpenDealership")
local giveGearEvent = ReplicatedStorage:FindFirstChild("GiveGearEvent")

task.spawn(function()
	if not spawnEvent    then spawnEvent    = ReplicatedStorage:WaitForChild("SpawnCarEvent", 30) end
	if not openDealer    then openDealer    = ReplicatedStorage:WaitForChild("OpenDealership", 30) end
	if not giveGearEvent then giveGearEvent = ReplicatedStorage:WaitForChild("GiveGearEvent", 30) end
end)

-- Previews
local previewCars  = ReplicatedStorage:FindFirstChild("PreviewCars")
local gearPreviews = ReplicatedStorage:FindFirstChild("GearPreviews")
task.spawn(function()
	if not previewCars  then previewCars  = ReplicatedStorage:WaitForChild("PreviewCars", 30) end
	if not gearPreviews then gearPreviews = ReplicatedStorage:WaitForChild("GearPreviews", 30) end
end)

-- Catalog Config
local CarCatalog = nil
pcall(function() CarCatalog = require(ReplicatedStorage:WaitForChild("CarCatalog", 5)) end)

-- ============================================================
-- THEME & SCALING CONFIGURATION (SCALED UP)
-- ============================================================
local BG_DARK   = Color3.fromRGB(18, 18, 20)      -- Dark panel background
local BG_BAR    = Color3.fromRGB(22, 22, 25)      -- Taskbar/Header background
local BG_CARD   = Color3.fromRGB(30, 30, 34)      -- Row card background
local BG_TRANS  = 0.15                            -- Sleek glass transparency
local COL_WHITE = Color3.fromRGB(255, 255, 255)
local COL_SUB   = Color3.fromRGB(160, 160, 168)
local COL_RED   = Color3.fromRGB(220, 70, 70)
local COL_GOLD  = Color3.fromRGB(255, 200, 60)
local FONT      = Enum.Font.GothamBold
local FONT_REG  = Enum.Font.GothamMedium

local TOP_PADDING   = 20
local RIGHT_PADDING = 24
local PILL_HEIGHT   = 42  -- Expanded size for maximized visibility

local function commas(n)
	local s = tostring(math.floor(n or 0))
	return (s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,",""))
end

-- ============================================================
-- ROOT GUI
-- ============================================================
local gui = Instance.new("ScreenGui")
gui.Name           = "GreenvilleHUD_Right"
gui.ResetOnSpawn   = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent         = playerGui

-- ============================================================
-- TOP RIGHT HUD PILLS
-- ============================================================

-- 1. CASH DISPLAY (Far Right)
local moneyFrame = Instance.new("Frame")
moneyFrame.AnchorPoint = Vector2.new(1, 0)
moneyFrame.Position    = UDim2.new(1, -RIGHT_PADDING, 0, TOP_PADDING)
moneyFrame.Size        = UDim2.new(0, 220, 0, PILL_HEIGHT)
moneyFrame.BackgroundColor3 = BG_DARK
moneyFrame.BackgroundTransparency = BG_TRANS
moneyFrame.BorderSizePixel = 0
moneyFrame.Parent = gui
local _mc = Instance.new("UICorner") _mc.CornerRadius = UDim.new(1,0) _mc.Parent = moneyFrame

local cashTag = Instance.new("TextLabel")
cashTag.Size = UDim2.new(0, 60, 1, 0)
cashTag.Position = UDim2.new(0, 16, 0, 0)
cashTag.BackgroundTransparency = 1
cashTag.Font = FONT
cashTag.TextSize = 15
cashTag.TextColor3 = COL_GOLD
cashTag.TextXAlignment = Enum.TextXAlignment.Left
cashTag.Text = "CASH"
cashTag.Parent = moneyFrame

local moneyLabel = Instance.new("TextLabel")
moneyLabel.Size     = UDim2.new(1, -85, 1, 0)
moneyLabel.AnchorPoint = Vector2.new(1, 0)
moneyLabel.Position = UDim2.new(1, -16, 0, 0)
moneyLabel.BackgroundTransparency = 1
moneyLabel.Font = FONT
moneyLabel.TextSize = 18
moneyLabel.TextColor3 = COL_WHITE
moneyLabel.TextXAlignment = Enum.TextXAlignment.Right
moneyLabel.Text = "0"
moneyLabel.Parent = moneyFrame

task.spawn(function()
	local ls = player:WaitForChild("leaderstats", 15)
	if not ls then return end
	local m = ls:WaitForChild("Money", 15)
	if not m then return end
	local function upd() moneyLabel.Text = commas(m.Value) end
	m:GetPropertyChangedSignal("Value"):Connect(upd)
	upd()
end)

-- 2. TIME DISPLAY (Left of Cash)
local clockFrame = Instance.new("Frame")
clockFrame.AnchorPoint = Vector2.new(1, 0)
clockFrame.Position    = UDim2.new(1, -RIGHT_PADDING - 232, 0, TOP_PADDING)
clockFrame.Size        = UDim2.new(0, 130, 0, PILL_HEIGHT)
clockFrame.BackgroundColor3 = BG_DARK
clockFrame.BackgroundTransparency = BG_TRANS
clockFrame.BorderSizePixel = 0
clockFrame.Parent = gui
local _cc = Instance.new("UICorner") _cc.CornerRadius = UDim.new(1,0) _cc.Parent = clockFrame

local clockLabel = Instance.new("TextLabel")
clockLabel.Size = UDim2.new(1, 0, 1, 0)
clockLabel.BackgroundTransparency = 1
clockLabel.Font = FONT
clockLabel.TextSize = 16
clockLabel.TextColor3 = COL_WHITE
clockLabel.Text = "--:-- --"
clockLabel.Parent = clockFrame

task.spawn(function()
	while true do
		clockLabel.Text = os.date("%I:%M %p")
		task.wait(10)
	end
end)

-- 3. INTERFACE TASKBAR (Directly below Cash/Time on the Right)
local taskbar = Instance.new("Frame")
taskbar.AnchorPoint = Vector2.new(1, 0)
taskbar.Position    = UDim2.new(1, -RIGHT_PADDING, 0, TOP_PADDING + PILL_HEIGHT + 10)
taskbar.Size        = UDim2.new(0, 360, 0, PILL_HEIGHT)
taskbar.BackgroundColor3 = BG_BAR
taskbar.BackgroundTransparency = 0.08
taskbar.BorderSizePixel = 0
taskbar.ZIndex = 10
taskbar.Parent = gui
local _tc = Instance.new("UICorner") _tc.CornerRadius = UDim.new(1,0) _tc.Parent = taskbar

local tbLayout = Instance.new("UIListLayout")
tbLayout.FillDirection = Enum.FillDirection.Horizontal
tbLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
tbLayout.VerticalAlignment   = Enum.VerticalAlignment.Center
tbLayout.Padding = UDim.new(0, 16)
tbLayout.SortOrder = Enum.SortOrder.LayoutOrder
tbLayout.Parent = taskbar

local function makeTextBtn(labelName, order)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(0, 52, 0, 28)
	b.BackgroundTransparency = 1
	b.Font = FONT
	b.TextSize = 14
	b.TextColor3 = COL_WHITE
	b.Text = labelName
	b.LayoutOrder = order
	b.ZIndex = 11
	b.Parent = taskbar

	local dot = Instance.new("Frame")
	dot.AnchorPoint = Vector2.new(0.5, 0)
	dot.Position    = UDim2.new(0.5, 0, 1, 4)
	dot.Size        = UDim2.new(0, 5, 0, 5)
	dot.BackgroundColor3 = COL_WHITE
	dot.BackgroundTransparency = 1
	dot.BorderSizePixel = 0
	dot.ZIndex = 12
	dot.Parent = b
	local _dc = Instance.new("UICorner") _dc.CornerRadius = UDim.new(1,0) _dc.Parent = dot

	b.MouseEnter:Connect(function() TweenService:Create(b, TweenInfo.new(0.1), {TextColor3 = COL_GOLD}):Play() end)
	b.MouseLeave:Connect(function() TweenService:Create(b, TweenInfo.new(0.1), {TextColor3 = COL_WHITE}):Play() end)

	return b, dot
end

local teamsBtn,    teamsDot    = makeTextBtn("TEAM", 1)
local garageBtn,   garageDot   = makeTextBtn("CAR", 2)
local shopBtn,     shopDot     = makeTextBtn("SHOP", 3)
local toolsBtn,    toolsDot    = makeTextBtn("TOOL", 4)

taskbar.AutomaticSize = Enum.AutomaticSize.X
local _tbPad = Instance.new("UIPadding")
_tbPad.PaddingLeft = UDim.new(0, 20)
_tbPad.PaddingRight = UDim.new(0, 20)
_tbPad.Parent = taskbar

-- ============================================================
-- DROPDOWN PANEL FACTORY (Spawns directly beneath the Taskbar)
-- ============================================================
local openPanels = {}
local function makeDropdownPanel(widthPx, heightPx, title)
	local panel = Instance.new("Frame")
	panel.AnchorPoint = Vector2.new(1, 0)
	-- Placed cleanly directly underneath the menu bar row
	panel.Position    = UDim2.new(1, -RIGHT_PADDING, 0, TOP_PADDING + (PILL_HEIGHT * 2) + 22)
	panel.Size        = UDim2.new(0, widthPx, 0, heightPx)
	panel.BackgroundColor3 = BG_DARK
	panel.BackgroundTransparency = 0.05
	panel.BorderSizePixel = 0
	panel.Visible = false
	panel.ZIndex  = 30
	panel.Parent  = gui
	local _pc = Instance.new("UICorner") _pc.CornerRadius = UDim.new(0, 14) _pc.Parent = panel

	local hdr = Instance.new("Frame")
	hdr.Size = UDim2.new(1, 0, 0, 46)
	hdr.BackgroundColor3 = BG_BAR
	hdr.BorderSizePixel = 0
	hdr.ZIndex = 31
	hdr.Parent = panel
	local _hc = Instance.new("UICorner") _hc.CornerRadius = UDim.new(0, 14) _hc.Parent = hdr

	local hdrLabel = Instance.new("TextLabel")
	hdrLabel.Size = UDim2.new(1, -50, 1, 0)
	hdrLabel.Position = UDim2.new(0, 18, 0, 0)
	hdrLabel.BackgroundTransparency = 1
	hdrLabel.Font = FONT
	hdrLabel.TextSize = 16
	hdrLabel.TextColor3 = COL_WHITE
	hdrLabel.TextXAlignment = Enum.TextXAlignment.Left
	hdrLabel.Text = title or ""
	hdrLabel.ZIndex = 32
	hdrLabel.Parent = hdr

	local xBtn = Instance.new("TextButton")
	xBtn.AnchorPoint = Vector2.new(1, 0.5)
	xBtn.Position    = UDim2.new(1, -14, 0.5, 0)
	xBtn.Size        = UDim2.new(0, 26, 0, 26)
	xBtn.BackgroundTransparency = 1
	xBtn.Font = FONT
	xBtn.TextSize = 16
	xBtn.TextColor3 = COL_SUB
	xBtn.Text = "X"
	xBtn.ZIndex = 33
	xBtn.Parent = hdr

	local scroll = Instance.new("ScrollingFrame")
	scroll.Position = UDim2.new(0, 0, 0, 46)
	scroll.Size     = UDim2.new(1, 0, 1, -46)
	scroll.BackgroundTransparency = 1
	scroll.BorderSizePixel = 0
	scroll.ScrollBarThickness = 5
	scroll.ScrollBarImageColor3 = Color3.fromRGB(80, 80, 90)
	scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
	scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
	scroll.ZIndex = 31
	scroll.Parent = panel

	return panel, scroll, xBtn
end

local function togglePanel(panel, dot)
	local wasVisible = panel.Visible
	for p, d in pairs(openPanels) do
		p.Visible = false
		if d then d.BackgroundTransparency = 1 end
	end
	if not wasVisible then
		panel.Visible = true
		if dot then dot.BackgroundTransparency = 0 end
	end
end

-- ============================================================
-- ADVANCED V7 LIST-BASED GARAGE SPAWN MENU
-- ============================================================
local garagePanel, garageScroll, garageX = makeDropdownPanel(420, 440, "My Garage")
openPanels[garagePanel] = garageDot

local garageLayout = Instance.new("UIListLayout")
garageLayout.Padding = UDim.new(0, 8)
garageLayout.SortOrder = Enum.SortOrder.LayoutOrder
garageLayout.Parent = garageScroll

local garagePad = Instance.new("UIPadding")
garagePad.PaddingTop    = UDim.new(0, 10)
garagePad.PaddingBottom = UDim.new(0, 10)
garagePad.PaddingLeft   = UDim.new(0, 12)
garagePad.PaddingRight  = UDim.new(0, 12)
garagePad.Parent = garageScroll

local function renderThumb(vp, cam, carName)
	for _, c in ipairs(vp:GetChildren()) do if c:IsA("Model") then c:Destroy() end end
	if not previewCars then return end
	local tmpl = previewCars:FindFirstChild(carName)
	if not tmpl then return end
	local mdl = tmpl:Clone()
	mdl.Parent = vp
	local cf, sz = mdl:GetBoundingBox()
	local center = cf.Position
	local radius = math.max(sz.Magnitude / 2, 1)
	local dist   = radius / math.tan(math.rad(cam.FieldOfView / 2)) * 1.15
	cam.CFrame   = CFrame.new(center + Vector3.new(1, 0.55, 1).Unit * dist, center)
end

local function addGarageBadge(parent, badgeId, order)
	local label = (CarCatalog and CarCatalog.BADGE_LABELS and CarCatalog.BADGE_LABELS[badgeId]) or badgeId
	local color = (CarCatalog and CarCatalog.BADGE_COLORS and CarCatalog.BADGE_COLORS[badgeId]) or Color3.fromRGB(100,100,110)
	local style = (CarCatalog and CarCatalog.BADGE_STYLES and CarCatalog.BADGE_STYLES[badgeId]) or {}

	local pill  = Instance.new("TextLabel")
	pill.Size = UDim2.new(0, 0, 0, 15)
	pill.AutomaticSize = Enum.AutomaticSize.X
	pill.BackgroundColor3 = color
	pill.BorderSizePixel  = 0
	pill.Font      = FONT
	pill.TextSize  = 9
	pill.TextColor3 = style.textColor or Color3.fromRGB(20, 20, 20)
	pill.Text = "  " .. label .. "  "
	pill.LayoutOrder = order
	pill.ZIndex = 36
	pill.Parent = parent
	local _pc = Instance.new("UICorner") _pc.CornerRadius = UDim.new(1,0) _pc.Parent = pill

	if style.gradient then
		local g = Instance.new("UIGradient")
		g.Color    = ColorSequence.new(style.gradient[1], style.gradient[2])
		g.Rotation = 25
		g.Parent   = pill
	end
end

local function refreshGarage()
	for _, c in ipairs(garageScroll:GetChildren()) do if c:IsA("GuiObject") then c:Destroy() end end

	local data = { owned = {}, catalog = {} }
	if _G.GetGarageData then
		local ok, res = pcall(_G.GetGarageData)
		if ok and res then data = res end
	end

	local catByName = {}
	for _, e in ipairs(data.catalog) do catByName[e.name] = e end

	local names = {}
	for n in pairs(data.owned) do table.insert(names, n) end
	table.sort(names)

	if #names == 0 then
		local note = Instance.new("TextLabel")
		note.Size = UDim2.new(1, 0, 0, 60)
		note.BackgroundTransparency = 1
		note.Font = FONT_REG
		note.TextSize = 14
		note.TextColor3 = COL_SUB
		note.Text = "No cars owned yet — visit the Shop!"
		note.Parent = garageScroll
		return
	end

	for _, carName in ipairs(names) do
		local paid    = data.owned[carName]
		local cat     = catByName[carName]
		local badges  = cat and cat.badges or {}
		local status  = cat and cat.status or nil
		local sellVal = math.floor((paid or 0) * 0.75)

		-- ROW (Clicking anywhere on row spawns vehicle)
		local row = Instance.new("TextButton")
		row.Size = UDim2.new(1, 0, 0, 82)
		row.BackgroundColor3 = BG_CARD
		row.BackgroundTransparency = 0.3
		row.BorderSizePixel = 0
		row.Text = ""
		row.AutoButtonColor = false
		row.ZIndex = 32
		row.Parent = garageScroll
		local _rc = Instance.new("UICorner") _rc.CornerRadius = UDim.new(0, 8) _rc.Parent = row

		local vp = Instance.new("ViewportFrame")
		vp.Position = UDim2.new(0, 6, 0, 6)
		vp.Size     = UDim2.new(0, 105, 0, 70)
		vp.BackgroundTransparency = 1
		vp.BorderSizePixel = 0
		vp.Interactable = false
		vp.ZIndex = 33
		vp.Parent = row
		local cam = Instance.new("Camera")
		vp.CurrentCamera = cam
		task.spawn(function() renderThumb(vp, cam, carName) end)

		local nameLbl = Instance.new("TextLabel")
		nameLbl.Position = UDim2.new(0, 120, 0, 12)
		nameLbl.Size     = UDim2.new(1, -165, 0, 20)
		nameLbl.BackgroundTransparency = 1
		nameLbl.Font     = FONT
		nameLbl.TextSize = 14
		nameLbl.TextColor3 = COL_WHITE
		nameLbl.TextXAlignment = Enum.TextXAlignment.Left
		nameLbl.TextTruncate = Enum.TextTruncate.AtEnd
		nameLbl.Text = carName
		nameLbl.ZIndex = 34
		nameLbl.Parent = row

		-- Badge row container
		local badgeRow = Instance.new("Frame")
		badgeRow.Position = UDim2.new(0, 120, 0, 36)
		badgeRow.Size     = UDim2.new(1, -165, 0, 15)
		badgeRow.BackgroundTransparency = 1
		badgeRow.ZIndex = 34
		badgeRow.Parent = row
		local _bl = Instance.new("UIListLayout")
		_bl.FillDirection = Enum.FillDirection.Horizontal
		_bl.Padding = UDim.new(0, 4)
		_bl.Parent = badgeRow

		local displayed = {}
		if badges then for _, b in ipairs(badges) do table.insert(displayed, b) end end
		if status == "OffSale" then table.insert(displayed, "OffSale") end
		for bi, b in ipairs(displayed) do addGarageBadge(badgeRow, b, bi) end

		local valLbl = Instance.new("TextLabel")
		valLbl.Position = UDim2.new(0, 120, 0, 56)
		valLbl.Size     = UDim2.new(1, -165, 0, 14)
		valLbl.BackgroundTransparency = 1
		valLbl.Font     = FONT_REG
		valLbl.TextSize = 11
		valLbl.TextColor3 = COL_SUB
		valLbl.TextXAlignment = Enum.TextXAlignment.Left
		valLbl.Text = ("Paid $%s  •  Sell $%s"):format(commas(paid), commas(sellVal))
		valLbl.ZIndex = 34
		valLbl.Parent = row

		-- Multi-step Safety Sell Button
		local sellBtn = Instance.new("TextButton")
		sellBtn.AnchorPoint = Vector2.new(1, 0.5)
		sellBtn.Position    = UDim2.new(1, -10, 0.5, 0)
		sellBtn.Size        = UDim2.new(0, 28, 0, 28)
		sellBtn.BackgroundColor3 = Color3.fromRGB(50, 50, 58)
		sellBtn.BorderSizePixel = 0
		sellBtn.Font = FONT
		sellBtn.TextSize = 13
		sellBtn.TextColor3 = COL_WHITE
		sellBtn.Text = "X"
		sellBtn.ZIndex = 36
		sellBtn.Parent = row
		local _slc = Instance.new("UICorner") _slc.CornerRadius = UDim.new(0, 6) _slc.Parent = sellBtn

		local counting = false
		local confirmReady = false

		local function resetSell()
			counting = false
			confirmReady = false
			sellBtn.BackgroundColor3 = Color3.fromRGB(50, 50, 58)
			sellBtn.TextColor3 = COL_WHITE
			sellBtn.Text = "X"
			valLbl.Text = ("Paid $%s  •  Sell $%s"):format(commas(paid), commas(sellVal))
			valLbl.TextColor3 = COL_SUB
		end

		row.MouseButton1Click:Connect(function()
			if spawnEvent then
				spawnEvent:FireServer(carName)
				garagePanel.Visible = false
				garageDot.BackgroundTransparency = 1
			end
		end)

		sellBtn.MouseButton1Click:Connect(function()
			if confirmReady then
				confirmReady = false
				if _G.SellCar then
					_G.SellCar(carName)
					task.wait(0.3)
					refreshGarage()
				end
				return
			end
			if counting then resetSell() return end

			counting = true
			sellBtn.BackgroundColor3 = Color3.fromRGB(180, 120, 30)
			task.spawn(function()
				for n = 3, 1, -1 do
					if not counting then return end
					sellBtn.Text = tostring(n)
					valLbl.Text  = "Tap X again to cancel"
					valLbl.TextColor3 = Color3.fromRGB(180, 120, 30)
					task.wait(1)
				end
				if not counting then return end
				sellBtn.BackgroundColor3 = COL_RED
				sellBtn.Text = "!"
				valLbl.Text = "Tap X to confirm"
				valLbl.TextColor3 = COL_RED
				confirmReady = true
				counting = false
				task.delay(4, function() if confirmReady and sellBtn.Parent then resetSell() end end)
			end)
		end)
	end
end

garageBtn.MouseButton1Click:Connect(function()
	if not garagePanel.Visible then refreshGarage() end
	togglePanel(garagePanel, garageDot)
end)
garageX.MouseButton1Click:Connect(function()
	garagePanel.Visible = false
	garageDot.BackgroundTransparency = 1
end)
garagePanel:GetPropertyChangedSignal("Visible"):Connect(function()
	if not garagePanel.Visible then
		for _, c in ipairs(garageScroll:GetChildren()) do if c:IsA("GuiObject") then c:Destroy() end end
	end
end)

-- ============================================================
-- TEAMS DROPDOWN PANEL
-- ============================================================
local teamsPanel, teamsScroll, teamsX = makeDropdownPanel(300, 340, "Select Team")
openPanels[teamsPanel] = teamsDot

local teamListLayout = Instance.new("UIListLayout")
teamListLayout.Padding = UDim.new(0, 6)
teamListLayout.Parent = teamsScroll

local function refreshTeams()
	for _, c in ipairs(teamsScroll:GetChildren()) do if c:IsA("GuiObject") then c:Destroy() end end
	for _, team in ipairs(TeamsService:GetTeams()) do
		local row = Instance.new("TextButton")
		row.Size = UDim2.new(1, 0, 0, 44)
		row.BackgroundColor3 = BG_CARD
		row.BorderSizePixel = 0
		row.Text = ""
		row.Parent = teamsScroll
		local _rc = Instance.new("UICorner") _rc.CornerRadius = UDim.new(0, 6) _rc.Parent = row

		local swatch = Instance.new("Frame")
		swatch.Size     = UDim2.new(0, 6, 0.5, 0)
		swatch.Position = UDim2.new(0, 10, 0.25, 0)
		swatch.BackgroundColor3 = team.TeamColor.Color
		swatch.BorderSizePixel = 0
		swatch.Parent = row

		local nameLbl = Instance.new("TextLabel")
		nameLbl.Size = UDim2.new(1, -34, 1, 0)
		nameLbl.Position = UDim2.new(0, 24, 0, 0)
		nameLbl.BackgroundTransparency = 1
		nameLbl.Font = FONT
		nameLbl.TextSize = 14
		nameLbl.TextColor3 = COL_WHITE
		nameLbl.TextXAlignment = Enum.TextXAlignment.Left
		nameLbl.Text = team.Name
		nameLbl.Parent = row

		row.MouseButton1Click:Connect(function()
			player.Team = team
			player.Neutral = false
			teamsPanel.Visible = false
			teamsDot.BackgroundTransparency = 1
		end)
	end
end

teamsBtn.MouseButton1Click:Connect(function()
	refreshTeams()
	togglePanel(teamsPanel, teamsDot)
end)
teamsX.MouseButton1Click:Connect(function()
	teamsPanel.Visible = false
	teamsDot.BackgroundTransparency = 1
end)

-- ============================================================
-- SHOP TRIGGER
-- ============================================================
shopBtn.MouseButton1Click:Connect(function()
	for p, d in pairs(openPanels) do
		p.Visible = false
		if d then d.BackgroundTransparency = 1 end
	end
	if openDealer then openDealer:FireServer() end
end)

-- ============================================================
-- ADVANCED TWO-COLUMN TOOLS DROPDOWN PANEL
-- ============================================================
local toolsPanel, toolsScroll, toolsX = makeDropdownPanel(440, 340, "Tools")
openPanels[toolsPanel] = toolsDot
toolsScroll.Visible = false

local toolsMenu = Instance.new("Frame")
toolsMenu.Position = UDim2.new(0, 12, 0, 56)
toolsMenu.Size     = UDim2.new(0, 120, 1, -68)
toolsMenu.BackgroundColor3 = Color3.fromRGB(26, 26, 30)
toolsMenu.BackgroundTransparency = 0.2
toolsMenu.BorderSizePixel = 0
toolsMenu.ZIndex = 32
toolsMenu.Parent = toolsPanel
local _tmc = Instance.new("UICorner") _tmc.CornerRadius = UDim.new(0, 10) _tmc.Parent = toolsMenu

local tmLayout = Instance.new("UIListLayout")
tmLayout.Padding = UDim.new(0, 4)
tmLayout.Parent = toolsMenu
local tmPad = Instance.new("UIPadding")
tmPad.PaddingTop = UDim.new(0, 6) tmPad.PaddingLeft = UDim.new(0, 6) tmPad.PaddingRight = UDim.new(0, 6)
tmPad.Parent = toolsMenu

local gearScroll = Instance.new("ScrollingFrame")
gearScroll.Position = UDim2.new(0, 144, 0, 56)
gearScroll.Size     = UDim2.new(1, -156, 1, -68)
gearScroll.BackgroundTransparency = 1
gearScroll.BorderSizePixel = 0
gearScroll.ScrollBarThickness = 5
gearScroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
gearScroll.ZIndex = 32
gearScroll.Parent = toolsPanel

local gearGrid = Instance.new("UIGridLayout")
gearGrid.CellSize = UDim2.new(0, 128, 0, 120)
gearGrid.CellPadding = UDim2.new(0, 10, 0, 10)
gearGrid.SortOrder = Enum.SortOrder.LayoutOrder
gearGrid.Parent = gearScroll

local function renderGearThumb(vp, cam, gearName)
	for _, c in ipairs(vp:GetChildren()) do if c:IsA("Model") then c:Destroy() end end
	if not gearPreviews then return end
	local tmpl = gearPreviews:FindFirstChild(gearName)
	if not tmpl then return end
	local mdl = tmpl:Clone()
	mdl.Parent = vp
	local ok, cf, sz = pcall(function() return mdl:GetBoundingBox() end)
	if not ok then return end
	local center = cf.Position
	local radius = math.max(sz.Magnitude / 2, 0.5)
	local dist = radius / math.tan(math.rad(cam.FieldOfView / 2)) * 1.3
	cam.CFrame = CFrame.new(center + Vector3.new(1, 0.6, 1).Unit * dist, center)
end

local function makeGearCard(gearName)
	local card = Instance.new("TextButton")
	card.BackgroundColor3 = Color3.fromRGB(34, 36, 42)
	card.BackgroundTransparency = 0.15
	card.BorderSizePixel = 0
	card.Text = ""
	card.ZIndex = 33
	card.Parent = gearScroll
	local _cc = Instance.new("UICorner") _cc.CornerRadius = UDim.new(0, 10) _cc.Parent = card

	local vp = Instance.new("ViewportFrame")
	vp.Position = UDim2.new(0, 8, 0, 8)
	vp.Size = UDim2.new(1, -16, 0, 78)
	vp.BackgroundTransparency = 1
	vp.BorderSizePixel = 0
	vp.Active = false
	vp.ZIndex = 34
	vp.Parent = card
	local cam = Instance.new("Camera")
	vp.CurrentCamera = cam
	task.spawn(function() renderGearThumb(vp, cam, gearName) end)

	local nm = Instance.new("TextLabel")
	nm.Position = UDim2.new(0, 4, 1, -30)
	nm.Size = UDim2.new(1, -8, 0, 26)
	nm.BackgroundTransparency = 1
	nm.Font = FONT
	nm.TextSize = 12
	nm.TextColor3 = COL_WHITE
	nm.TextWrapped = true
	nm.Text = gearName
	nm.ZIndex = 34
	nm.Parent = card

	card.MouseButton1Click:Connect(function()
		if giveGearEvent then
			giveGearEvent:FireServer(gearName)
			nm.Text = "Given!"
			task.delay(1, function() if nm.Parent then nm.Text = gearName end end)
		end
	end)
end

local function refreshGears()
	for _, c in ipairs(gearScroll:GetChildren()) do if c:IsA("GuiObject") then c:Destroy() end end
	if not gearPreviews then return end
	local names = {}
	for _, m in ipairs(gearPreviews:GetChildren()) do if m:IsA("Model") then table.insert(names, m.Name) end end
	table.sort(names)

	if #names == 0 then
		local note = Instance.new("TextLabel")
		note.Size = UDim2.new(1, 0, 0, 40)
		note.BackgroundTransparency = 1
		note.Font = FONT_REG
		note.TextSize = 13
		note.TextColor3 = COL_SUB
		note.Text = "No tools available."
		note.Parent = gearScroll
		return
	end
	for _, n in ipairs(names) do makeGearCard(n) end
end

local activeMenuBtn = nil
local function makeMenuOption(label, onClick)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1, 0, 0, 32)
	b.BackgroundColor3 = Color3.fromRGB(40, 42, 50)
	b.BorderSizePixel = 0
	b.Font = FONT
	b.TextSize = 13
	b.TextColor3 = COL_WHITE
	b.Text = label
	b.ZIndex = 33
	b.Parent = toolsMenu
	local _bc = Instance.new("UICorner") _bc.CornerRadius = UDim.new(0, 8) _bc.Parent = b

	b.MouseButton1Click:Connect(function()
		if activeMenuBtn then activeMenuBtn.BackgroundColor3 = Color3.fromRGB(40, 42, 50) end
		b.BackgroundColor3 = COL_GOLD
		activeMenuBtn = b
		onClick()
	end)
	return b
end

local gearsOption = makeMenuOption("Gears", refreshGears)

toolsBtn.MouseButton1Click:Connect(function()
	togglePanel(toolsPanel, toolsDot)
	if toolsPanel.Visible then
		if activeMenuBtn then activeMenuBtn.BackgroundColor3 = Color3.fromRGB(40, 42, 50) end
		gearsOption.BackgroundColor3 = COL_GOLD
		activeMenuBtn = gearsOption
		refreshGears()
	end
end)
toolsX.MouseButton1Click:Connect(function()
	toolsPanel.Visible = false
	toolsDot.BackgroundTransparency = 1
end)
