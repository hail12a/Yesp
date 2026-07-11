-- ============================================================
-- AdminClient v2  (LocalScript)
-- Place in: StarterPlayer > StarterPlayerScripts
--
-- A packed, ANIMATED admin panel with a LEFT SIDEBAR of categories.
-- Only appears for admins (server confirms via AdminIsAdmin). All
-- actions are validated server-side in AdminServer v2.
--
-- Pages: Money · Players · World/Time · Effects · Announce · Server
--
-- SETUP (no new instances vs v1):
--   ReplicatedStorage > RemoteFunction "AdminRequest"
--   ReplicatedStorage > RemoteEvent    "AdminIsAdmin"
-- Toggle key: F4  (also a small floating button appears for admins)
-- ============================================================

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService  = game:GetService("UserInputService")
local TweenService      = game:GetService("TweenService")
local RunService        = game:GetService("RunService")

local player    = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local adminRequest = ReplicatedStorage:WaitForChild("AdminRequest")
local adminIsAdmin = ReplicatedStorage:WaitForChild("AdminIsAdmin")

local IS_ADMIN = false
local IS_SUPER = false

-- ===== theme =====
local C_BG      = Color3.fromRGB(20, 22, 28)
local C_SIDE    = Color3.fromRGB(14, 15, 20)
local C_CARD    = Color3.fromRGB(32, 35, 44)
local C_CARD2   = Color3.fromRGB(42, 46, 57)
local C_ACCENT  = Color3.fromRGB(90, 130, 245)
local C_ACCENT2 = Color3.fromRGB(150, 90, 245)
local C_GREEN   = Color3.fromRGB(70, 180, 95)
local C_GOLD    = Color3.fromRGB(255, 200, 60)
local C_RED     = Color3.fromRGB(210, 65, 65)
local C_TEXT    = Color3.fromRGB(240, 240, 245)
local C_SUB     = Color3.fromRGB(155, 160, 172)
local FONT      = Enum.Font.GothamBold
local FONT_REG  = Enum.Font.Gotham
local FONT_MED  = Enum.Font.GothamMedium

local EASE      = TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local EASE_POP  = TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out)

local function corner(inst, r)
	local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, r or 8) c.Parent = inst return c
end
local function pad(inst, all)
	local p = Instance.new("UIPadding")
	p.PaddingTop = UDim.new(0, all) p.PaddingBottom = UDim.new(0, all)
	p.PaddingLeft = UDim.new(0, all) p.PaddingRight = UDim.new(0, all)
	p.Parent = inst return p
end

-- ===== root (hidden until admin confirmed) =====
local gui = Instance.new("ScreenGui")
gui.Name = "AdminPanel"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.DisplayOrder = 80
gui.Enabled = false
gui.Parent = playerGui

-- announcement banner (own gui so it always shows on top)
local annGui = Instance.new("ScreenGui")
annGui.Name = "AdminAnnounce"
annGui.ResetOnSpawn = false
annGui.IgnoreGuiInset = true
annGui.DisplayOrder = 95
annGui.Parent = playerGui

-- toast gui (action feedback)
local toastGui = Instance.new("ScreenGui")
toastGui.Name = "AdminToast"
toastGui.ResetOnSpawn = false
toastGui.IgnoreGuiInset = true
toastGui.DisplayOrder = 94
toastGui.Parent = playerGui

local backdrop = Instance.new("Frame")
backdrop.Size = UDim2.new(1,0,1,0)
backdrop.BackgroundColor3 = Color3.fromRGB(0,0,0)
backdrop.BackgroundTransparency = 1
backdrop.Visible = false
backdrop.Parent = gui

local win = Instance.new("Frame")
win.AnchorPoint = Vector2.new(0.5,0.5)
win.Position = UDim2.new(0.5,0,0.5,0)
win.Size = UDim2.new(0, 720, 0, 460)
win.BackgroundColor3 = C_BG
win.BorderSizePixel = 0
win.Parent = backdrop
corner(win, 18)

local winStroke = Instance.new("UIStroke")
winStroke.Color = C_ACCENT
winStroke.Transparency = 0.6
winStroke.Thickness = 1
winStroke.Parent = win

-- ===== animated header =====
local titleBar = Instance.new("Frame")
titleBar.Size = UDim2.new(1,0,0,48)
titleBar.BackgroundColor3 = C_SIDE
titleBar.BorderSizePixel = 0
titleBar.Parent = win
corner(titleBar, 18)

local titleGrad = Instance.new("UIGradient")
titleGrad.Color = ColorSequence.new(C_ACCENT, C_ACCENT2)
titleGrad.Transparency = NumberSequence.new({
	NumberSequenceKeypoint.new(0, 0.82),
	NumberSequenceKeypoint.new(1, 0.9),
})
titleGrad.Rotation = 0
titleGrad.Parent = titleBar
task.spawn(function()
	while titleBar.Parent do
		titleGrad.Rotation = (titleGrad.Rotation + 1) % 360
		RunService.Heartbeat:Wait()
	end
end)

local titleLabel = Instance.new("TextLabel")
titleLabel.Size = UDim2.new(1,-120,1,0)
titleLabel.Position = UDim2.new(0,18,0,0)
titleLabel.BackgroundTransparency = 1
titleLabel.Font = FONT
titleLabel.TextSize = 20
titleLabel.TextColor3 = C_TEXT
titleLabel.TextXAlignment = Enum.TextXAlignment.Left
titleLabel.Text = "⚡ Admin Panel"
titleLabel.Parent = titleBar

local tierBadge = Instance.new("TextLabel")
tierBadge.AnchorPoint = Vector2.new(1,0.5)
tierBadge.Position = UDim2.new(1,-58,0.5,0)
tierBadge.Size = UDim2.new(0,64,0,22)
tierBadge.BackgroundColor3 = C_ACCENT
tierBadge.Font = FONT
tierBadge.TextSize = 11
tierBadge.TextColor3 = C_TEXT
tierBadge.Text = "ADMIN"
tierBadge.Parent = titleBar
corner(tierBadge, 11)

local closeBtn = Instance.new("TextButton")
closeBtn.AnchorPoint = Vector2.new(1,0.5)
closeBtn.Position = UDim2.new(1,-12,0.5,0)
closeBtn.Size = UDim2.new(0,32,0,32)
closeBtn.BackgroundColor3 = C_RED
closeBtn.BorderSizePixel = 0
closeBtn.Font = FONT
closeBtn.TextSize = 18
closeBtn.TextColor3 = C_TEXT
closeBtn.Text = "✕"
closeBtn.Parent = titleBar
corner(closeBtn, 8)

-- ===== LEFT SIDEBAR =====
local sidebar = Instance.new("Frame")
sidebar.Position = UDim2.new(0,0,0,48)
sidebar.Size = UDim2.new(0,158,1,-48)
sidebar.BackgroundColor3 = C_SIDE
sidebar.BorderSizePixel = 0
sidebar.Parent = win

local sideLayout = Instance.new("UIListLayout")
sideLayout.Padding = UDim.new(0,5)
sideLayout.Parent = sidebar
local sidePad = Instance.new("UIPadding")
sidePad.PaddingTop = UDim.new(0,10) sidePad.PaddingLeft = UDim.new(0,10) sidePad.PaddingRight = UDim.new(0,10)
sidePad.Parent = sidebar

-- content area (right of sidebar)
local content = Instance.new("Frame")
content.Position = UDim2.new(0,166,0,56)
content.Size = UDim2.new(1,-178,1,-88)
content.BackgroundTransparency = 1
content.Parent = win

-- pages keyed by name
local pages = {}
local currentPage = nil
local function showPage(name)
	for n, pg in pairs(pages) do
		if n == name then
			pg.Visible = true
			pg.Position = UDim2.new(0, 12, 0, 0)
			TweenService:Create(pg, EASE, {Position = UDim2.new(0,0,0,0)}):Play()
		else
			pg.Visible = false
		end
	end
	currentPage = name
end

local sideButtons = {}
local function makeSideButton(icon, name)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1,0,0,40)
	b.BackgroundColor3 = C_CARD
	b.BackgroundTransparency = 0.35
	b.BorderSizePixel = 0
	b.Font = FONT
	b.TextSize = 14
	b.TextColor3 = C_SUB
	b.TextXAlignment = Enum.TextXAlignment.Left
	b.Text = "   " .. icon .. "   " .. name
	b.AutoButtonColor = false
	b.Parent = sidebar
	corner(b, 9)

	-- accent bar that grows in on select
	local bar = Instance.new("Frame")
	bar.Size = UDim2.new(0,3,0.0,0)
	bar.Position = UDim2.new(0,0,0.5,0)
	bar.AnchorPoint = Vector2.new(0,0.5)
	bar.BackgroundColor3 = C_ACCENT
	bar.BorderSizePixel = 0
	bar.Parent = b
	corner(bar, 2)

	sideButtons[name] = { btn = b, bar = bar }

	b.MouseEnter:Connect(function()
		if currentPage ~= name then
			TweenService:Create(b, EASE, {BackgroundTransparency = 0.15, TextColor3 = C_TEXT}):Play()
		end
	end)
	b.MouseLeave:Connect(function()
		if currentPage ~= name then
			TweenService:Create(b, EASE, {BackgroundTransparency = 0.35, TextColor3 = C_SUB}):Play()
		end
	end)
	b.MouseButton1Click:Connect(function()
		showPage(name)
		for n, sb in pairs(sideButtons) do
			local on = (n == name)
			TweenService:Create(sb.btn, EASE, {
				BackgroundColor3 = on and C_ACCENT or C_CARD,
				BackgroundTransparency = on and 0.05 or 0.35,
				TextColor3 = on and C_TEXT or C_SUB,
			}):Play()
			TweenService:Create(sb.bar, EASE, {Size = UDim2.new(0,3, on and 0.6 or 0.0, 0)}):Play()
		end
	end)
	return b
end

-- ===== reusable builders =====
local function makePage(name)
	local pg = Instance.new("ScrollingFrame")
	pg.Size = UDim2.new(1,0,1,0)
	pg.BackgroundTransparency = 1
	pg.BorderSizePixel = 0
	pg.ScrollBarThickness = 5
	pg.ScrollBarImageColor3 = C_ACCENT
	pg.CanvasSize = UDim2.new(0,0,0,0)
	pg.AutomaticCanvasSize = Enum.AutomaticSize.Y
	pg.Visible = false
	pg.Parent = content
	local lay = Instance.new("UIListLayout")
	lay.Padding = UDim.new(0,9)
	lay.Parent = pg
	local p = Instance.new("UIPadding") p.PaddingRight = UDim.new(0,6) p.PaddingBottom = UDim.new(0,8) p.Parent = pg
	pages[name] = pg
	return pg
end

-- section header with a subtle divider
local function makeHeader(parent, text)
	local holder = Instance.new("Frame")
	holder.Size = UDim2.new(1,0,0,26)
	holder.BackgroundTransparency = 1
	holder.Parent = parent
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(1,0,1,0)
	l.BackgroundTransparency = 1
	l.Font = FONT
	l.TextSize = 15
	l.TextColor3 = C_GOLD
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.Text = text
	l.Parent = holder
	return holder
end

local function makeInput(parent, placeholder)
	local box = Instance.new("TextBox")
	box.Size = UDim2.new(1,0,0,36)
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
	corner(box, 7)
	local p = Instance.new("UIPadding") p.PaddingLeft = UDim.new(0,12) p.Parent = box
	local st = Instance.new("UIStroke") st.Color = C_ACCENT st.Transparency = 1 st.Thickness = 1.5 st.Parent = box
	box.Focused:Connect(function() TweenService:Create(st, EASE, {Transparency = 0.2}):Play() end)
	box.FocusLost:Connect(function() TweenService:Create(st, EASE, {Transparency = 1}):Play() end)
	return box
end

local function makeButton(parent, text, color, height)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1,0,0, height or 38)
	b.BackgroundColor3 = color or C_GREEN
	b.BorderSizePixel = 0
	b.Font = FONT
	b.TextSize = 15
	b.TextColor3 = C_TEXT
	b.Text = text
	b.AutoButtonColor = false
	b.Parent = parent
	corner(b, 8)
	local base = color or C_GREEN
	local hover = base:Lerp(Color3.new(1,1,1), 0.15)
	b.MouseEnter:Connect(function() TweenService:Create(b, EASE, {BackgroundColor3 = hover}):Play() end)
	b.MouseLeave:Connect(function() TweenService:Create(b, EASE, {BackgroundColor3 = base}):Play() end)
	b.MouseButton1Down:Connect(function() TweenService:Create(b, TweenInfo.new(0.08), {Size = UDim2.new(1,-4,0,(height or 38)-3)}):Play() end)
	b.MouseButton1Up:Connect(function() TweenService:Create(b, EASE_POP, {Size = UDim2.new(1,0,0,height or 38)}):Play() end)
	return b
end

-- horizontal row of small buttons; returns the row frame
local function makeButtonRow(parent, defs) -- defs = { {text,color,cb}, ... }
	local row = Instance.new("Frame")
	row.Size = UDim2.new(1,0,0,34)
	row.BackgroundTransparency = 1
	row.Parent = parent
	local lay = Instance.new("UIListLayout")
	lay.FillDirection = Enum.FillDirection.Horizontal
	lay.Padding = UDim.new(0,6)
	lay.Parent = row
	local n = #defs
	for _, d in ipairs(defs) do
		local b = Instance.new("TextButton")
		b.Size = UDim2.new(1/n, -6*(n-1)/n, 1, 0)
		b.BackgroundColor3 = d.color or C_CARD2
		b.BorderSizePixel = 0
		b.Font = FONT
		b.TextSize = 13
		b.TextColor3 = C_TEXT
		b.Text = d.text
		b.AutoButtonColor = false
		b.Parent = row
		corner(b, 7)
		local base = d.color or C_CARD2
		local hover = base:Lerp(Color3.new(1,1,1), 0.15)
		b.MouseEnter:Connect(function() TweenService:Create(b, EASE, {BackgroundColor3 = hover}):Play() end)
		b.MouseLeave:Connect(function() TweenService:Create(b, EASE, {BackgroundColor3 = base}):Play() end)
		b.MouseButton1Click:Connect(d.cb)
	end
	return row
end

-- custom slider; onChange(value) fires live. Returns { set=function(v) }
local function makeSlider(parent, labelText, min, max, default, decimals, onChange)
	local holder = Instance.new("Frame")
	holder.Size = UDim2.new(1,0,0,46)
	holder.BackgroundColor3 = C_CARD
	holder.BackgroundTransparency = 0.4
	holder.BorderSizePixel = 0
	holder.Parent = parent
	corner(holder, 8)

	local lbl = Instance.new("TextLabel")
	lbl.Position = UDim2.new(0,12,0,4)
	lbl.Size = UDim2.new(1,-24,0,18)
	lbl.BackgroundTransparency = 1
	lbl.Font = FONT_MED
	lbl.TextSize = 13
	lbl.TextColor3 = C_SUB
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.Text = labelText
	lbl.Parent = holder

	local valLbl = Instance.new("TextLabel")
	valLbl.AnchorPoint = Vector2.new(1,0)
	valLbl.Position = UDim2.new(1,-12,0,4)
	valLbl.Size = UDim2.new(0,80,0,18)
	valLbl.BackgroundTransparency = 1
	valLbl.Font = FONT
	valLbl.TextSize = 13
	valLbl.TextColor3 = C_GOLD
	valLbl.TextXAlignment = Enum.TextXAlignment.Right
	valLbl.Parent = holder

	local track = Instance.new("Frame")
	track.Position = UDim2.new(0,12,1,-14)
	track.Size = UDim2.new(1,-24,0,6)
	track.BackgroundColor3 = C_SIDE
	track.BorderSizePixel = 0
	track.Parent = holder
	corner(track, 3)

	local fill = Instance.new("Frame")
	fill.Size = UDim2.new(0,0,1,0)
	fill.BackgroundColor3 = C_ACCENT
	fill.BorderSizePixel = 0
	fill.Parent = track
	corner(fill, 3)
	local fillGrad = Instance.new("UIGradient")
	fillGrad.Color = ColorSequence.new(C_ACCENT, C_ACCENT2)
	fillGrad.Parent = fill

	local knob = Instance.new("Frame")
	knob.AnchorPoint = Vector2.new(0.5,0.5)
	knob.Position = UDim2.new(0,0,0.5,0)
	knob.Size = UDim2.new(0,14,0,14)
	knob.BackgroundColor3 = C_TEXT
	knob.BorderSizePixel = 0
	knob.ZIndex = 3
	knob.Parent = track
	corner(knob, 7)

	local value = default
	local function fmt(v)
		if decimals and decimals > 0 then return string.format("%."..decimals.."f", v) end
		return tostring(math.floor(v + 0.5))
	end
	local function apply(v, fire)
		value = math.clamp(v, min, max)
		local a = (value - min) / (max - min)
		fill.Size = UDim2.new(a, 0, 1, 0)
		knob.Position = UDim2.new(a, 0, 0.5, 0)
		valLbl.Text = fmt(value)
		if fire and onChange then onChange(value) end
	end
	apply(default, false)

	local dragging = false
	local function fromX(px)
		local a = math.clamp((px - track.AbsolutePosition.X) / math.max(track.AbsoluteSize.X,1), 0, 1)
		apply(min + a * (max - min), true)
	end
	track.InputBegan:Connect(function(io)
		if io.UserInputType == Enum.UserInputType.MouseButton1 or io.UserInputType == Enum.UserInputType.Touch then
			dragging = true
			TweenService:Create(knob, EASE, {Size = UDim2.new(0,18,0,18)}):Play()
			fromX(io.Position.X)
		end
	end)
	UserInputService.InputChanged:Connect(function(io)
		if dragging and (io.UserInputType == Enum.UserInputType.MouseMovement or io.UserInputType == Enum.UserInputType.Touch) then
			fromX(io.Position.X)
		end
	end)
	UserInputService.InputEnded:Connect(function(io)
		if io.UserInputType == Enum.UserInputType.MouseButton1 or io.UserInputType == Enum.UserInputType.Touch then
			if dragging then TweenService:Create(knob, EASE, {Size = UDim2.new(0,14,0,14)}):Play() end
			dragging = false
		end
	end)

	return { set = function(v) apply(v, false) end, get = function() return value end }
end

-- toggle switch; onChange(bool). Returns { set=function(bool) }
local function makeToggle(parent, labelText, default, onChange)
	local holder = Instance.new("Frame")
	holder.Size = UDim2.new(1,0,0,38)
	holder.BackgroundColor3 = C_CARD
	holder.BackgroundTransparency = 0.4
	holder.BorderSizePixel = 0
	holder.Parent = parent
	corner(holder, 8)

	local lbl = Instance.new("TextLabel")
	lbl.Position = UDim2.new(0,12,0,0)
	lbl.Size = UDim2.new(1,-70,1,0)
	lbl.BackgroundTransparency = 1
	lbl.Font = FONT_MED
	lbl.TextSize = 14
	lbl.TextColor3 = C_TEXT
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.Text = labelText
	lbl.Parent = holder

	local track = Instance.new("TextButton")
	track.AnchorPoint = Vector2.new(1,0.5)
	track.Position = UDim2.new(1,-12,0.5,0)
	track.Size = UDim2.new(0,46,0,24)
	track.BackgroundColor3 = C_SIDE
	track.BorderSizePixel = 0
	track.Text = ""
	track.AutoButtonColor = false
	track.Parent = holder
	corner(track, 12)

	local knob = Instance.new("Frame")
	knob.AnchorPoint = Vector2.new(0,0.5)
	knob.Position = UDim2.new(0,3,0.5,0)
	knob.Size = UDim2.new(0,18,0,18)
	knob.BackgroundColor3 = C_TEXT
	knob.BorderSizePixel = 0
	knob.Parent = track
	corner(knob, 9)

	local state = default or false
	local function apply(s, fire)
		state = s
		TweenService:Create(track, EASE, {BackgroundColor3 = state and C_GREEN or C_SIDE}):Play()
		TweenService:Create(knob, EASE_POP, {Position = state and UDim2.new(1,-21,0.5,0) or UDim2.new(0,3,0.5,0)}):Play()
		if fire and onChange then onChange(state) end
	end
	apply(state, false)
	track.MouseButton1Click:Connect(function() apply(not state, true) end)
	return { set = function(s) apply(s, false) end, get = function() return state end }
end

-- online-player dropdown that refreshes when opened
local onlineDropdowns = {}
local function makeDropdown(parent, placeholder)
	local btn = Instance.new("TextButton")
	btn.Size = UDim2.new(1,0,0,36)
	btn.BackgroundColor3 = C_CARD
	btn.BorderSizePixel = 0
	btn.Font = FONT_REG
	btn.TextSize = 14
	btn.TextColor3 = C_SUB
	btn.TextXAlignment = Enum.TextXAlignment.Left
	btn.Text = "   " .. placeholder
	btn.AutoButtonColor = false
	btn.Parent = parent
	corner(btn, 7)

	local arrow = Instance.new("TextLabel")
	arrow.AnchorPoint = Vector2.new(1,0.5)
	arrow.Position = UDim2.new(1,-10,0.5,0)
	arrow.Size = UDim2.new(0,20,1,0)
	arrow.BackgroundTransparency = 1
	arrow.Font = FONT
	arrow.TextSize = 12
	arrow.TextColor3 = C_SUB
	arrow.Text = "▼"
	arrow.Parent = btn

	local list = Instance.new("Frame")
	list.Position = UDim2.new(0,0,1,4)
	list.Size = UDim2.new(1,0,0,0)
	list.AutomaticSize = Enum.AutomaticSize.Y
	list.BackgroundColor3 = C_SIDE
	list.BorderSizePixel = 0
	list.Visible = false
	list.ZIndex = 50
	list.Parent = btn
	corner(list, 7)
	local ll = Instance.new("UIListLayout") ll.Padding = UDim.new(0,2) ll.Parent = list
	local lp = Instance.new("UIPadding") lp.PaddingTop = UDim.new(0,4) lp.PaddingBottom = UDim.new(0,4)
	lp.PaddingLeft = UDim.new(0,4) lp.PaddingRight = UDim.new(0,4) lp.Parent = list

	local selected = nil
	local api = { get = function() return selected end }

	local function refresh()
		for _, c in ipairs(list:GetChildren()) do if c:IsA("TextButton") then c:Destroy() end end
		for _, p in ipairs(Players:GetPlayers()) do
			local opt = Instance.new("TextButton")
			opt.Size = UDim2.new(1,0,0,30)
			opt.BackgroundColor3 = C_CARD2
			opt.BorderSizePixel = 0
			opt.Font = FONT_REG
			opt.TextSize = 13
			opt.TextColor3 = C_TEXT
			opt.Text = "  " .. p.DisplayName .. "  (@" .. p.Name .. ")"
			opt.TextXAlignment = Enum.TextXAlignment.Left
			opt.ZIndex = 51
			opt.Parent = list
			corner(opt, 6)
			opt.MouseButton1Click:Connect(function()
				selected = p.Name
				btn.Text = "   " .. p.DisplayName
				btn.TextColor3 = C_TEXT
				list.Visible = false
				arrow.Text = "▼"
			end)
		end
	end

	btn.MouseButton1Click:Connect(function()
		-- close others
		for _, d in ipairs(onlineDropdowns) do if d ~= list then d.Visible = false end end
		if not list.Visible then refresh() end
		list.Visible = not list.Visible
		arrow.Text = list.Visible and "▲" or "▼"
	end)
	table.insert(onlineDropdowns, list)
	return api
end

-- RGB color picker row with live swatch + preset chips. Returns { get=function()->Color3 }
local function makeColorPicker(parent, default)
	local col = default or Color3.fromRGB(255, 200, 60)

	local holder = Instance.new("Frame")
	holder.Size = UDim2.new(1,0,0,36)
	holder.BackgroundTransparency = 1
	holder.Parent = parent
	local lay = Instance.new("UIListLayout")
	lay.FillDirection = Enum.FillDirection.Horizontal
	lay.Padding = UDim.new(0,6)
	lay.VerticalAlignment = Enum.VerticalAlignment.Center
	lay.Parent = holder

	local swatch = Instance.new("Frame")
	swatch.Size = UDim2.new(0,36,0,36)
	swatch.BackgroundColor3 = col
	swatch.BorderSizePixel = 0
	swatch.Parent = holder
	corner(swatch, 8)

	local boxes = {}
	local function mkBox(v)
		local b = Instance.new("TextBox")
		b.Size = UDim2.new(0,52,0,36)
		b.BackgroundColor3 = C_CARD
		b.BorderSizePixel = 0
		b.Font = FONT_REG
		b.TextSize = 14
		b.TextColor3 = C_TEXT
		b.Text = tostring(v)
		b.ClearTextOnFocus = false
		b.Parent = holder
		corner(b, 7)
		return b
	end
	boxes.r = mkBox(math.floor(col.R*255))
	boxes.g = mkBox(math.floor(col.G*255))
	boxes.b = mkBox(math.floor(col.B*255))
	local function readCol()
		local r = math.clamp(tonumber(boxes.r.Text) or 255,0,255)
		local g = math.clamp(tonumber(boxes.g.Text) or 200,0,255)
		local b = math.clamp(tonumber(boxes.b.Text) or 60,0,255)
		col = Color3.fromRGB(r,g,b)
		swatch.BackgroundColor3 = col
	end
	for _, b in pairs(boxes) do b.FocusLost:Connect(readCol) end

	-- preset chips
	local presetHolder = Instance.new("Frame")
	presetHolder.Size = UDim2.new(1,0,0,24)
	presetHolder.BackgroundTransparency = 1
	presetHolder.Parent = parent
	local pl = Instance.new("UIListLayout")
	pl.FillDirection = Enum.FillDirection.Horizontal
	pl.Padding = UDim.new(0,6)
	pl.Parent = presetHolder
	local presets = {
		Color3.fromRGB(255,200,60), Color3.fromRGB(90,130,245), Color3.fromRGB(70,180,95),
		Color3.fromRGB(210,65,65), Color3.fromRGB(150,90,245), Color3.fromRGB(255,255,255),
	}
	for _, pc in ipairs(presets) do
		local chip = Instance.new("TextButton")
		chip.Size = UDim2.new(0,24,0,20)
		chip.BackgroundColor3 = pc
		chip.BorderSizePixel = 0
		chip.Text = ""
		chip.Parent = presetHolder
		corner(chip, 5)
		chip.MouseButton1Click:Connect(function()
			col = pc
			swatch.BackgroundColor3 = pc
			boxes.r.Text = tostring(math.floor(pc.R*255))
			boxes.g.Text = tostring(math.floor(pc.G*255))
			boxes.b.Text = tostring(math.floor(pc.B*255))
		end)
	end

	return { get = function() readCol() return col end }
end

-- ===== status line at bottom =====
local status = Instance.new("TextLabel")
status.AnchorPoint = Vector2.new(0,1)
status.Position = UDim2.new(0,166,1,-14)
status.Size = UDim2.new(1,-178,0,22)
status.BackgroundTransparency = 1
status.Font = FONT_MED
status.TextSize = 13
status.TextColor3 = C_SUB
status.TextXAlignment = Enum.TextXAlignment.Left
status.Text = ""
status.Parent = win

local function flashStatus(res)
	local ok = (type(res) == "table") and res.ok
	local msg = (type(res) == "table") and (res.msg or "") or tostring(res)
	status.TextColor3 = ok and C_GREEN or C_RED
	status.Text = (ok and "✓  " or "✕  ") .. msg
	status.TextTransparency = 0
	-- gentle fade
	task.delay(3.5, function()
		TweenService:Create(status, TweenInfo.new(0.8), {TextTransparency = 0.6}):Play()
	end)
end

local function request(action, a, b, c)
	local ok, res = pcall(function() return adminRequest:InvokeServer(action, a, b, c) end)
	if ok then flashStatus(res) else flashStatus({ok=false, msg="Request failed."}) end
	return res
end

-- ============================================================
-- PAGE: MONEY  (advanced)
-- ============================================================
local moneyPage = makePage("Money")
makeHeader(moneyPage, "Give / Set Cash")
local mTarget = makeDropdown(moneyPage, "Select player…")
local mName = makeInput(moneyPage, "…or type a name (blank = selected above)")
local mAmt  = makeInput(moneyPage, "Amount")

-- quick amount chips
makeButtonRow(moneyPage, {
	{ text = "+1K",   color = C_CARD2, cb = function() mAmt.Text = "1000" end },
	{ text = "+10K",  color = C_CARD2, cb = function() mAmt.Text = "10000" end },
	{ text = "+100K", color = C_CARD2, cb = function() mAmt.Text = "100000" end },
	{ text = "+1M",   color = C_CARD2, cb = function() mAmt.Text = "1000000" end },
})

local function moneyTarget() return (mName.Text ~= "" and mName.Text) or mTarget.get() or "" end

makeButtonRow(moneyPage, {
	{ text = "Give",   color = C_GREEN,  cb = function() request("givecash", moneyTarget(), mAmt.Text) end },
	{ text = "Set",    color = C_ACCENT, cb = function() request("setcash",  moneyTarget(), mAmt.Text) end },
	{ text = "Remove", color = C_RED,    cb = function() request("takecash", moneyTarget(), mAmt.Text) end },
})

makeHeader(moneyPage, "Everyone")
makeButtonRow(moneyPage, {
	{ text = "Give All",   color = C_GREEN,  cb = function() request("giveall", mAmt.Text) end },
	{ text = "Set All",    color = C_ACCENT, cb = function() request("setall", mAmt.Text) end },
})
local multBox = makeInput(moneyPage, "Multiplier (e.g. 2 = double everyone's cash)")
makeButton(moneyPage, "Multiply Everyone's Cash", C_ACCENT2)
	.MouseButton1Click:Connect(function() request("multiplyall", multBox.Text) end)

-- ============================================================
-- PAGE: PLAYERS  (advanced)
-- ============================================================
local playerPage = makePage("Players")
makeHeader(playerPage, "Target")
local pTarget = makeDropdown(playerPage, "Select player…")
local pName = makeInput(playerPage, "…or type a name")
local function playerTarget() return (pName.Text ~= "" and pName.Text) or pTarget.get() or "" end

makeHeader(playerPage, "Movement")
makeButtonRow(playerPage, {
	{ text = "Bring",  color = C_ACCENT, cb = function() request("bring", playerTarget()) end },
	{ text = "Goto",   color = C_ACCENT, cb = function() request("goto", playerTarget()) end },
	{ text = "Freeze", color = C_CARD2,  cb = function() request("freeze", playerTarget()) end },
	{ text = "Thaw",   color = C_CARD2,  cb = function() request("thaw", playerTarget()) end },
})
local tpTo = makeInput(playerPage, "Teleport target to whom (name)")
makeButton(playerPage, "Teleport", C_ACCENT)
	.MouseButton1Click:Connect(function() request("teleport", playerTarget(), tpTo.Text) end)

makeHeader(playerPage, "Character")
local speedSlider = makeSlider(playerPage, "WalkSpeed", 0, 200, 16, 0, function() end)
local jumpSlider  = makeSlider(playerPage, "JumpPower", 0, 350, 50, 0, function() end)
makeButtonRow(playerPage, {
	{ text = "Apply Speed", color = C_ACCENT, cb = function() request("speed", playerTarget(), speedSlider.get()) end },
	{ text = "Apply Jump",  color = C_ACCENT, cb = function() request("jump", playerTarget(), jumpSlider.get()) end },
})
makeButtonRow(playerPage, {
	{ text = "Heal",     color = C_GREEN, cb = function() request("heal", playerTarget()) end },
	{ text = "God",      color = C_GOLD,  cb = function() request("god", playerTarget()) end },
	{ text = "Ungod",    color = C_CARD2, cb = function() request("ungod", playerTarget()) end },
})
makeButtonRow(playerPage, {
	{ text = "Respawn",  color = C_ACCENT2, cb = function() request("respawn", playerTarget()) end },
	{ text = "Kill",     color = C_RED,     cb = function() request("kill", playerTarget()) end },
})

makeHeader(playerPage, "Moderation")
makeButtonRow(playerPage, {
	{ text = "Kick", color = C_RED, cb = function() request("kick", playerTarget(), "Kicked by admin") end },
	{ text = "Ban (session)", color = C_RED, cb = function() request("ban", playerTarget(), "Banned by admin") end },
})

-- ============================================================
-- PAGE: WORLD / TIME
-- ============================================================
local worldPage = makePage("World")
makeHeader(worldPage, "Time of Day")
local timeSlider = makeSlider(worldPage, "Clock (hours)", 0, 24, 14, 1, function(v)
	request("settime", v)
end)
makeButtonRow(worldPage, {
	{ text = "Dawn",  color = C_CARD2, cb = function() timeSlider.set(6);  request("settime", 6) end },
	{ text = "Day",   color = C_CARD2, cb = function() timeSlider.set(12); request("settime", 12) end },
	{ text = "Dusk",  color = C_CARD2, cb = function() timeSlider.set(18); request("settime", 18) end },
	{ text = "Night", color = C_CARD2, cb = function() timeSlider.set(0);  request("settime", 0) end },
})
makeToggle(worldPage, "Freeze time (hold clock)", false, function(on)
	request("freezetime", on and 1 or 0)
end)

makeHeader(worldPage, "Atmosphere")
makeSlider(worldPage, "Brightness", 0, 5, 2, 1, function(v) request("brightness", v) end)
makeSlider(worldPage, "Fog distance", 0, 2000, 1000, 0, function(v) request("fog", v) end)
makeSlider(worldPage, "Gravity", 0, 400, 196, 0, function(v) request("gravity", v) end)
makeButtonRow(worldPage, {
	{ text = "Reset Fog",     color = C_CARD2, cb = function() request("fog", 100000) end },
	{ text = "Reset Gravity", color = C_CARD2, cb = function() request("gravity", 196.2) end },
})

-- ============================================================
-- PAGE: EFFECTS  (fun / animated)
-- ============================================================
local fxPage = makePage("Effects")
makeHeader(fxPage, "Target")
local fxTarget = makeDropdown(fxPage, "Select player…")
local fxName = makeInput(fxPage, "…or type a name")
local function fxT() return (fxName.Text ~= "" and fxName.Text) or fxTarget.get() or "" end

makeHeader(fxPage, "Body Effects")
makeButtonRow(fxPage, {
	{ text = "🔥 Fire",     color = C_RED,     cb = function() request("fire", fxT()) end },
	{ text = "✨ Sparkles", color = C_GOLD,    cb = function() request("sparkles", fxT()) end },
	{ text = "💨 Smoke",    color = C_CARD2,   cb = function() request("smoke", fxT()) end },
})
makeButtonRow(fxPage, {
	{ text = "🌈 Neon",     color = C_ACCENT2, cb = function() request("neon", fxT()) end },
	{ text = "Clear FX",    color = C_CARD2,   cb = function() request("clearfx", fxT()) end },
})

makeHeader(fxPage, "Physics")
makeButtonRow(fxPage, {
	{ text = "💥 Explode", color = C_RED,     cb = function() request("explode", fxT()) end },
	{ text = "🚀 Fling",   color = C_ACCENT2, cb = function() request("fling", fxT()) end },
})
local sizeSlider = makeSlider(fxPage, "Body size multiplier", 0.3, 5, 1, 1, function() end)
makeButtonRow(fxPage, {
	{ text = "Apply Size", color = C_ACCENT, cb = function() request("size", fxT(), sizeSlider.get()) end },
	{ text = "Reset Size", color = C_CARD2,  cb = function() request("size", fxT(), 1) end },
})

-- ============================================================
-- PAGE: ANNOUNCE  (advanced, animated)
-- ============================================================
local annPage = makePage("Announce")
makeHeader(annPage, "Broadcast Message")
local annMsg = makeInput(annPage, "Message to everyone…")
makeHeader(annPage, "Color")
local annColor = makeColorPicker(annPage, C_GOLD)
makeHeader(annPage, "Options")
local annDur = makeSlider(annPage, "Duration (seconds)", 2, 20, 6, 0, function() end)

-- style dropdown (simple segmented control)
local annStyle = "Slide"
local styleHolder = Instance.new("Frame")
styleHolder.Size = UDim2.new(1,0,0,34)
styleHolder.BackgroundTransparency = 1
styleHolder.Parent = annPage
local styleLay = Instance.new("UIListLayout")
styleLay.FillDirection = Enum.FillDirection.Horizontal
styleLay.Padding = UDim.new(0,6)
styleLay.Parent = styleHolder
local styleBtns = {}
for _, s in ipairs({"Slide","Fade","Flash"}) do
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1/3,-4,1,0)
	b.BackgroundColor3 = (s == annStyle) and C_ACCENT or C_CARD2
	b.BorderSizePixel = 0
	b.Font = FONT
	b.TextSize = 13
	b.TextColor3 = C_TEXT
	b.Text = s
	b.AutoButtonColor = false
	b.Parent = styleHolder
	corner(b, 7)
	styleBtns[s] = b
	b.MouseButton1Click:Connect(function()
		annStyle = s
		for name, btn in pairs(styleBtns) do
			TweenService:Create(btn, EASE, {BackgroundColor3 = (name == s) and C_ACCENT or C_CARD2}):Play()
		end
	end)
end

makeButton(annPage, "📢  Send Announcement", C_ACCENT, 42)
	.MouseButton1Click:Connect(function()
		local c = annColor.get()
		request("announce", {
			text = annMsg.Text,
			r = math.floor(c.R*255), g = math.floor(c.G*255), b = math.floor(c.B*255),
			duration = annDur.get(),
			style = annStyle,
		})
	end)

-- ============================================================
-- PAGE: SERVER
-- ============================================================
local serverPage = makePage("Server")
makeHeader(serverPage, "Available cars")
local carListLabel = Instance.new("TextLabel")
carListLabel.Size = UDim2.new(1,0,0,0)
carListLabel.AutomaticSize = Enum.AutomaticSize.Y
carListLabel.BackgroundColor3 = C_CARD
carListLabel.BackgroundTransparency = 0.4
carListLabel.Font = FONT_REG
carListLabel.TextSize = 12
carListLabel.TextColor3 = C_SUB
carListLabel.TextXAlignment = Enum.TextXAlignment.Left
carListLabel.TextYAlignment = Enum.TextYAlignment.Top
carListLabel.TextWrapped = true
carListLabel.Text = "(open panel to load)"
carListLabel.Parent = serverPage
corner(carListLabel, 8)
local clp = Instance.new("UIPadding") clp.PaddingTop=UDim.new(0,8) clp.PaddingBottom=UDim.new(0,8)
clp.PaddingLeft=UDim.new(0,10) clp.PaddingRight=UDim.new(0,10) clp.Parent = carListLabel

makeHeader(serverPage, "Give Car")
local gcName = makeInput(serverPage, "Player name")
local gcCar  = makeInput(serverPage, "Car name (exact)")
makeButton(serverPage, "Give Car", C_GREEN)
	.MouseButton1Click:Connect(function() request("givecar", gcName.Text, gcCar.Text) end)

makeHeader(serverPage, "Super-admin")
makeButton(serverPage, "Announce Server Restart Notice", C_GOLD)
	.MouseButton1Click:Connect(function()
		request("announce", { text = "⚠ Server restarting soon — finish up!", r=255,g=200,b=60, duration=8, style="Flash" })
	end)

-- ===== sidebar (order) =====
makeSideButton("💰", "Money")
makeSideButton("👥", "Players")
makeSideButton("🌍", "World")
makeSideButton("✨", "Effects")
makeSideButton("📢", "Announce")
makeSideButton("🛠", "Server")

-- ============================================================
-- OPEN / CLOSE (animated)
-- ============================================================
local isOpen = false
local function refreshCarList()
	local res = request("getlists")
	if res and res.ok and res.cars then
		carListLabel.Text = (#res.cars > 0) and table.concat(res.cars, ", ") or "(none)"
	end
end

local function selectDefaultPage()
	showPage("Money")
	for n, sb in pairs(sideButtons) do
		local on = (n == "Money")
		sb.btn.BackgroundColor3 = on and C_ACCENT or C_CARD
		sb.btn.BackgroundTransparency = on and 0.05 or 0.35
		sb.btn.TextColor3 = on and C_TEXT or C_SUB
		sb.bar.Size = UDim2.new(0,3, on and 0.6 or 0, 0)
	end
end

local function openPanel()
	if not IS_ADMIN then return end
	isOpen = true
	backdrop.Visible = true
	gui.Enabled = true
	selectDefaultPage()
	-- animate
	backdrop.BackgroundTransparency = 1
	win.Size = UDim2.new(0, 720*0.9, 0, 460*0.9)
	winStroke.Transparency = 1
	TweenService:Create(backdrop, EASE, {BackgroundTransparency = 0.45}):Play()
	TweenService:Create(win, EASE_POP, {Size = UDim2.new(0,720,0,460)}):Play()
	TweenService:Create(winStroke, TweenInfo.new(0.4), {Transparency = 0.55}):Play()
	refreshCarList()
end

local function closePanel()
	isOpen = false
	TweenService:Create(backdrop, EASE, {BackgroundTransparency = 1}):Play()
	local t = TweenService:Create(win, EASE, {Size = UDim2.new(0, 720*0.9, 0, 460*0.9)})
	t:Play()
	t.Completed:Wait()
	backdrop.Visible = false
	gui.Enabled = false
end
closeBtn.MouseButton1Click:Connect(function() if isOpen then closePanel() end end)

-- ===== floating toggle button (only for admins) =====
local toggleGui = Instance.new("ScreenGui")
toggleGui.Name = "AdminToggle"
toggleGui.ResetOnSpawn = false
toggleGui.Parent = playerGui
toggleGui.Enabled = false
local toggleBtn = Instance.new("TextButton")
toggleBtn.AnchorPoint = Vector2.new(0,0.5)
toggleBtn.Position = UDim2.new(0, 12, 0.5, 0)
toggleBtn.Size = UDim2.new(0, 46, 0, 46)
toggleBtn.BackgroundColor3 = C_ACCENT
toggleBtn.BorderSizePixel = 0
toggleBtn.Font = FONT
toggleBtn.TextSize = 20
toggleBtn.TextColor3 = C_TEXT
toggleBtn.Text = "⚡"
toggleBtn.AutoButtonColor = false
toggleBtn.Parent = toggleGui
corner(toggleBtn, 12)
local tgGrad = Instance.new("UIGradient")
tgGrad.Color = ColorSequence.new(C_ACCENT, C_ACCENT2)
tgGrad.Rotation = 45
tgGrad.Parent = toggleBtn
-- subtle pulse
task.spawn(function()
	while toggleBtn.Parent do
		TweenService:Create(toggleBtn, TweenInfo.new(1.1, Enum.EasingStyle.Sine), {Size = UDim2.new(0,50,0,50)}):Play()
		task.wait(1.1)
		TweenService:Create(toggleBtn, TweenInfo.new(1.1, Enum.EasingStyle.Sine), {Size = UDim2.new(0,46,0,46)}):Play()
		task.wait(1.1)
	end
end)
toggleBtn.MouseButton1Click:Connect(function()
	if isOpen then closePanel() else openPanel() end
end)

UserInputService.InputBegan:Connect(function(io, processed)
	if processed then return end
	if io.KeyCode == Enum.KeyCode.F4 and IS_ADMIN then
		if isOpen then closePanel() else openPanel() end
	end
end)

-- ============================================================
-- ANNOUNCEMENT RENDERER (rich + animated)
-- ============================================================
local function renderAnnouncement(data)
	local text, col, duration, style
	if type(data) == "table" then
		text = data.text or ""
		col = Color3.fromRGB(data.r or 255, data.g or 200, data.b or 60)
		duration = data.duration or 6
		style = data.style or "Slide"
	else
		text = tostring(data); col = C_GOLD; duration = 6; style = "Slide"
	end

	local frame = Instance.new("Frame")
	frame.AnchorPoint = Vector2.new(0.5, 0)
	frame.Position = UDim2.new(0.5, 0, 0, 16)
	frame.Size = UDim2.new(0, 640, 0, 52)
	frame.BackgroundColor3 = Color3.fromRGB(26, 28, 36)
	frame.BackgroundTransparency = 0.05
	frame.BorderSizePixel = 0
	frame.Parent = annGui
	corner(frame, 12)
	local stroke = Instance.new("UIStroke")
	stroke.Color = col
	stroke.Thickness = 1.5
	stroke.Transparency = 0.2
	stroke.Parent = frame

	local accent = Instance.new("Frame")
	accent.Size = UDim2.new(0, 5, 1, -14)
	accent.Position = UDim2.new(0, 8, 0.5, 0)
	accent.AnchorPoint = Vector2.new(0, 0.5)
	accent.BackgroundColor3 = col
	accent.BorderSizePixel = 0
	accent.Parent = frame
	corner(accent, 3)

	local lbl = Instance.new("TextLabel")
	lbl.Position = UDim2.new(0, 24, 0, 0)
	lbl.Size = UDim2.new(1, -34, 1, 0)
	lbl.BackgroundTransparency = 1
	lbl.Font = FONT
	lbl.TextSize = 18
	lbl.TextColor3 = col
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.TextWrapped = true
	lbl.Text = text
	lbl.Parent = frame

	if style == "Fade" then
		frame.BackgroundTransparency = 1
		lbl.TextTransparency = 1
		stroke.Transparency = 1
		TweenService:Create(frame, TweenInfo.new(0.4), {BackgroundTransparency = 0.05}):Play()
		TweenService:Create(lbl, TweenInfo.new(0.4), {TextTransparency = 0}):Play()
		TweenService:Create(stroke, TweenInfo.new(0.4), {Transparency = 0.2}):Play()
	elseif style == "Flash" then
		task.spawn(function()
			for _ = 1, 4 do
				TweenService:Create(stroke, TweenInfo.new(0.18), {Transparency = 0}):Play()
				accent.BackgroundColor3 = Color3.new(1,1,1)
				task.wait(0.18)
				TweenService:Create(stroke, TweenInfo.new(0.18), {Transparency = 0.5}):Play()
				accent.BackgroundColor3 = col
				task.wait(0.18)
			end
		end)
	else -- Slide
		frame.Position = UDim2.new(0.5, 0, 0, -60)
		TweenService:Create(frame, EASE_POP, {Position = UDim2.new(0.5, 0, 0, 16)}):Play()
	end

	task.delay(duration, function()
		if not frame.Parent then return end
		TweenService:Create(frame, EASE, {Position = UDim2.new(0.5, 0, 0, -70), BackgroundTransparency = 1}):Play()
		TweenService:Create(lbl, EASE, {TextTransparency = 1}):Play()
		TweenService:Create(stroke, EASE, {Transparency = 1}):Play()
		task.wait(0.3)
		frame:Destroy()
	end)
end

-- ===== receive admin status + announcements =====
adminIsAdmin.OnClientEvent:Connect(function(isA, isS, _, announcement)
	if announcement ~= nil then
		renderAnnouncement(announcement)
		return
	end
	if isA ~= nil then
		IS_ADMIN = isA
		IS_SUPER = isS or false
		toggleGui.Enabled = IS_ADMIN
		tierBadge.Text = IS_SUPER and "SUPER" or "ADMIN"
		tierBadge.BackgroundColor3 = IS_SUPER and C_ACCENT2 or C_ACCENT
	end
end)
