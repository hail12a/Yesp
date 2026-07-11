-- ============================================================
-- AdminClient  (LocalScript)
-- Place in: StarterPlayer > StarterPlayerScripts
--
-- A packed admin panel with a LEFT SIDEBAR of categories. Only appears
-- for admins (server confirms via AdminIsAdmin). Opens centered/in front.
-- All actions are validated server-side in AdminServer.
--
-- SETUP:
--   ReplicatedStorage > RemoteFunction "AdminRequest"
--   ReplicatedStorage > RemoteEvent "AdminIsAdmin"
-- Toggle key: F4  (also a small button appears for admins)
-- ============================================================

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService  = game:GetService("UserInputService")

local player    = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local adminRequest = ReplicatedStorage:WaitForChild("AdminRequest")
local adminIsAdmin = ReplicatedStorage:WaitForChild("AdminIsAdmin")

local IS_ADMIN = false
local IS_SUPER = false

-- ===== theme =====
local C_BG      = Color3.fromRGB(22, 24, 30)
local C_SIDE    = Color3.fromRGB(16, 17, 22)
local C_CARD    = Color3.fromRGB(34, 37, 46)
local C_ACCENT  = Color3.fromRGB(90, 130, 245)
local C_GREEN   = Color3.fromRGB(70, 170, 90)
local C_RED     = Color3.fromRGB(200, 60, 60)
local C_TEXT    = Color3.fromRGB(240, 240, 245)
local C_SUB     = Color3.fromRGB(160, 165, 175)
local FONT      = Enum.Font.GothamBold
local FONT_REG  = Enum.Font.Gotham

-- ===== root (hidden until admin confirmed) =====
local gui = Instance.new("ScreenGui")
gui.Name = "AdminPanel"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.DisplayOrder = 80
gui.Enabled = false
gui.Parent = playerGui

-- announcement banner (its own gui so it always shows)
local annGui = Instance.new("ScreenGui")
annGui.Name = "AdminAnnounce"
annGui.ResetOnSpawn = false
annGui.IgnoreGuiInset = true
annGui.DisplayOrder = 90
annGui.Parent = playerGui
local annLabel = Instance.new("TextLabel")
annLabel.AnchorPoint = Vector2.new(0.5, 0)
annLabel.Position = UDim2.new(0.5, 0, 0, 12)
annLabel.Size = UDim2.new(0, 600, 0, 44)
annLabel.BackgroundColor3 = Color3.fromRGB(30, 32, 40)
annLabel.BackgroundTransparency = 0.05
annLabel.Font = FONT
annLabel.TextSize = 18
annLabel.TextColor3 = C_TEXT
annLabel.Text = ""
annLabel.Visible = false
annLabel.Parent = annGui
local annCorner = Instance.new("UICorner") annCorner.CornerRadius = UDim.new(0,10) annCorner.Parent = annLabel

local backdrop = Instance.new("Frame")
backdrop.Size = UDim2.new(1,0,1,0)
backdrop.BackgroundColor3 = Color3.fromRGB(0,0,0)
backdrop.BackgroundTransparency = 0.45
backdrop.Visible = false
backdrop.Parent = gui

local win = Instance.new("Frame")
win.AnchorPoint = Vector2.new(0.5,0.5)
win.Position = UDim2.new(0.5,0,0.5,0)
win.Size = UDim2.new(0, 640, 0, 420)
win.BackgroundColor3 = C_BG
win.BorderSizePixel = 0
win.Parent = backdrop
local winCorner = Instance.new("UICorner") winCorner.CornerRadius = UDim.new(0,16) winCorner.Parent = win

-- header
local titleBar = Instance.new("TextLabel")
titleBar.Size = UDim2.new(1,0,0,46)
titleBar.BackgroundColor3 = C_SIDE
titleBar.BorderSizePixel = 0
titleBar.Font = FONT
titleBar.TextSize = 20
titleBar.TextColor3 = C_TEXT
titleBar.Text = "Admin Panel"
titleBar.Parent = win
local tbc = Instance.new("UICorner") tbc.CornerRadius = UDim.new(0,16) tbc.Parent = titleBar

local closeBtn = Instance.new("TextButton")
closeBtn.AnchorPoint = Vector2.new(1,0.5)
closeBtn.Position = UDim2.new(1,-12,0,23)
closeBtn.Size = UDim2.new(0,32,0,32)
closeBtn.BackgroundColor3 = C_RED
closeBtn.BorderSizePixel = 0
closeBtn.Font = FONT
closeBtn.TextSize = 18
closeBtn.TextColor3 = C_TEXT
closeBtn.Text = "X"
closeBtn.Parent = win
local cbc = Instance.new("UICorner") cbc.CornerRadius = UDim.new(0,8) cbc.Parent = closeBtn

-- ===== LEFT SIDEBAR =====
local sidebar = Instance.new("Frame")
sidebar.Position = UDim2.new(0,0,0,46)
sidebar.Size = UDim2.new(0,150,1,-46)
sidebar.BackgroundColor3 = C_SIDE
sidebar.BorderSizePixel = 0
sidebar.Parent = win

local sideLayout = Instance.new("UIListLayout")
sideLayout.Padding = UDim.new(0,4)
sideLayout.Parent = sidebar
local sidePad = Instance.new("UIPadding")
sidePad.PaddingTop = UDim.new(0,8)
sidePad.PaddingLeft = UDim.new(0,8)
sidePad.PaddingRight = UDim.new(0,8)
sidePad.Parent = sidebar

-- content area (right of sidebar)
local content = Instance.new("Frame")
content.Position = UDim2.new(0,158,0,54)
content.Size = UDim2.new(1,-166,1,-62)
content.BackgroundTransparency = 1
content.Parent = win

-- pages keyed by name
local pages = {}
local function showPage(name)
	for n, pg in pairs(pages) do pg.Visible = (n == name) end
end

local sideButtons = {}
local function makeSideButton(icon, name)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1,0,0,38)
	b.BackgroundColor3 = C_CARD
	b.BorderSizePixel = 0
	b.Font = FONT
	b.TextSize = 14
	b.TextColor3 = C_TEXT
	b.TextXAlignment = Enum.TextXAlignment.Left
	b.Text = "  " .. icon .. "  " .. name
	b.Parent = sidebar
	local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0,8) c.Parent = b
	sideButtons[name] = b
	b.MouseButton1Click:Connect(function()
		showPage(name)
		for n, sb in pairs(sideButtons) do
			sb.BackgroundColor3 = (n == name) and C_ACCENT or C_CARD
		end
	end)
	return b
end

-- ===== reusable field/button builders =====
local function makePage(name)
	local pg = Instance.new("ScrollingFrame")
	pg.Size = UDim2.new(1,0,1,0)
	pg.BackgroundTransparency = 1
	pg.BorderSizePixel = 0
	pg.ScrollBarThickness = 5
	pg.CanvasSize = UDim2.new(0,0,0,0)
	pg.AutomaticCanvasSize = Enum.AutomaticSize.Y
	pg.Visible = false
	pg.Parent = content
	local lay = Instance.new("UIListLayout")
	lay.Padding = UDim.new(0,8)
	lay.Parent = pg
	pages[name] = pg
	return pg
end

local function makeLabel(parent, text, size)
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(1,0,0, size or 22)
	l.BackgroundTransparency = 1
	l.Font = FONT
	l.TextSize = 15
	l.TextColor3 = C_TEXT
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.Text = text
	l.Parent = parent
	return l
end

local function makeInput(parent, placeholder)
	local box = Instance.new("TextBox")
	box.Size = UDim2.new(1,0,0,34)
	box.BackgroundColor3 = C_CARD
	box.BorderSizePixel = 0
	box.Font = FONT_REG
	box.TextSize = 14
	box.TextColor3 = C_TEXT
	box.PlaceholderText = placeholder
	box.PlaceholderColor3 = C_SUB
	box.Text = ""
	box.ClearTextOnFocus = false
	box.TextXAlignment = Enum.TextXAlignment.Left
	box.Parent = parent
	local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0,6) c.Parent = box
	local p = Instance.new("UIPadding") p.PaddingLeft = UDim.new(0,10) p.Parent = box
	return box
end

local function makeActionButton(parent, text, color)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1,0,0,36)
	b.BackgroundColor3 = color or C_GREEN
	b.BorderSizePixel = 0
	b.Font = FONT
	b.TextSize = 15
	b.TextColor3 = C_TEXT
	b.Text = text
	b.Parent = parent
	local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0,8) c.Parent = b
	return b
end

-- status line at bottom of window
local status = Instance.new("TextLabel")
status.AnchorPoint = Vector2.new(0.5,1)
status.Position = UDim2.new(0.5,0,1,-6)
status.Size = UDim2.new(1,-166,0,20)
status.BackgroundTransparency = 1
status.Font = FONT_REG
status.TextSize = 13
status.TextColor3 = C_SUB
status.Text = ""
status.Parent = win
local function setStatus(res)
	if type(res) == "table" then
		status.TextColor3 = res.ok and C_GREEN or C_RED
		status.Text = res.msg or ""
	else
		status.Text = tostring(res)
	end
end

local function request(action, a, b)
	local ok, res = pcall(function() return adminRequest:InvokeServer(action, a, b) end)
	if ok then setStatus(res) else setStatus({ok=false, msg="Request failed."}) end
	return res
end

-- ============================================================
-- PAGE: MONEY
-- ============================================================
local moneyPage = makePage("Money")
makeLabel(moneyPage, "Give / Set Cash")
local mName = makeInput(moneyPage, "Player name")
local mAmt  = makeInput(moneyPage, "Amount")
local giveCashBtn = makeActionButton(moneyPage, "Give Cash", C_GREEN)
local setCashBtn  = makeActionButton(moneyPage, "Set Cash", C_ACCENT)
giveCashBtn.MouseButton1Click:Connect(function() request("givecash", mName.Text, mAmt.Text) end)
setCashBtn.MouseButton1Click:Connect(function() request("setcash", mName.Text, mAmt.Text) end)

-- ============================================================
-- PAGE: CARS
-- ============================================================
local carPage = makePage("Cars")
makeLabel(carPage, "Give Car to Player")
local cName = makeInput(carPage, "Player name")
local cCar  = makeInput(carPage, "Car name (exact)")
local giveCarBtn = makeActionButton(carPage, "Give Car", C_GREEN)
giveCarBtn.MouseButton1Click:Connect(function() request("givecar", cName.Text, cCar.Text) end)
makeLabel(carPage, "Available cars:", 20)
local carListLabel = Instance.new("TextLabel")
carListLabel.Size = UDim2.new(1,0,0,0)
carListLabel.AutomaticSize = Enum.AutomaticSize.Y
carListLabel.BackgroundTransparency = 1
carListLabel.Font = FONT_REG
carListLabel.TextSize = 12
carListLabel.TextColor3 = C_SUB
carListLabel.TextXAlignment = Enum.TextXAlignment.Left
carListLabel.TextYAlignment = Enum.TextYAlignment.Top
carListLabel.TextWrapped = true
carListLabel.Text = "(open panel to load)"
carListLabel.Parent = carPage

-- ============================================================
-- PAGE: PLAYERS (teleport / kick / heal)
-- ============================================================
local playerPage = makePage("Players")
makeLabel(playerPage, "Teleport")
local tpFrom = makeInput(playerPage, "Who (name)")
local tpTo   = makeInput(playerPage, "To whom (name)")
local tpBtn  = makeActionButton(playerPage, "Teleport", C_ACCENT)
tpBtn.MouseButton1Click:Connect(function() request("teleport", tpFrom.Text, tpTo.Text) end)
makeLabel(playerPage, "Heal / Kick", 20)
local pName = makeInput(playerPage, "Player name")
local healBtn = makeActionButton(playerPage, "Heal", C_GREEN)
local kickBtn = makeActionButton(playerPage, "Kick", C_RED)
healBtn.MouseButton1Click:Connect(function() request("heal", pName.Text) end)
kickBtn.MouseButton1Click:Connect(function() request("kick", pName.Text, "Kicked by admin") end)

-- ============================================================
-- PAGE: SERVER (announce, super-admin)
-- ============================================================
local serverPage = makePage("Server")
makeLabel(serverPage, "Announce to everyone")
local annBox = makeInput(serverPage, "Message")
local annBtn = makeActionButton(serverPage, "Announce", C_ACCENT)
annBtn.MouseButton1Click:Connect(function() request("announce", annBox.Text) end)
makeLabel(serverPage, "Super-admin", 20)
local banName = makeInput(serverPage, "Player name")
local banBtn = makeActionButton(serverPage, "Ban (session)", C_RED)
banBtn.MouseButton1Click:Connect(function() request("ban", banName.Text, "Banned by admin") end)

-- ===== sidebar buttons (icons via symbols) =====
makeSideButton("$", "Money")
makeSideButton("C", "Cars")
makeSideButton("P", "Players")
makeSideButton("S", "Server")

-- ===== open / close =====
local function refreshLists()
	local res = request("getlists")
	if res and res.ok and res.cars then
		carListLabel.Text = table.concat(res.cars, ", ")
	end
end

local function openPanel()
	if not IS_ADMIN then return end
	backdrop.Visible = true
	gui.Enabled = true
	showPage("Money")
	for n, sb in pairs(sideButtons) do sb.BackgroundColor3 = (n=="Money") and C_ACCENT or C_CARD end
	refreshLists()
end
local function closePanel()
	backdrop.Visible = false
	gui.Enabled = false
end
closeBtn.MouseButton1Click:Connect(closePanel)

-- toggle button (only shown to admins)
local toggleGui = Instance.new("ScreenGui")
toggleGui.Name = "AdminToggle"
toggleGui.ResetOnSpawn = false
toggleGui.Parent = playerGui
toggleGui.Enabled = false
local toggleBtn = Instance.new("TextButton")
toggleBtn.AnchorPoint = Vector2.new(0,0.5)
toggleBtn.Position = UDim2.new(0, 10, 0.5, 0)
toggleBtn.Size = UDim2.new(0, 44, 0, 44)
toggleBtn.BackgroundColor3 = C_ACCENT
toggleBtn.BorderSizePixel = 0
toggleBtn.Font = FONT
toggleBtn.TextSize = 18
toggleBtn.TextColor3 = C_TEXT
toggleBtn.Text = "A"
toggleBtn.Parent = toggleGui
local tgc = Instance.new("UICorner") tgc.CornerRadius = UDim.new(0,10) tgc.Parent = toggleBtn
toggleBtn.MouseButton1Click:Connect(function()
	if gui.Enabled then closePanel() else openPanel() end
end)

UserInputService.InputBegan:Connect(function(io, processed)
	if processed then return end
	if io.KeyCode == Enum.KeyCode.F4 and IS_ADMIN then
		if gui.Enabled then closePanel() else openPanel() end
	end
end)

-- ===== receive admin status + announcements =====
adminIsAdmin.OnClientEvent:Connect(function(isA, isS, _, announcement)
	if announcement ~= nil then
		annLabel.Text = "  " .. announcement .. "  "
		annLabel.Visible = true
		task.delay(6, function() annLabel.Visible = false end)
		return
	end
	if isA ~= nil then
		IS_ADMIN = isA
		IS_SUPER = isS or false
		toggleGui.Enabled = IS_ADMIN
	end
end)
