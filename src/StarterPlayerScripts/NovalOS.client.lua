-- ============================================================
-- NovalOS  (LocalScript)
-- Place in: StarterPlayer > StarterPlayerScripts
--
-- A phone that pops out while you HOLD a Tool named "NovalOS".
--   - Draggable window, PC + mobile, clamped so it never leaves the screen
--   - Auto-scales to fit any screen size
--   - Home screen with apps -> Browser
--   - Browser -> "Little World Bank": the window FLIPS to a wide landscape
--     ("1080p") banking dashboard (Novalis dark-pink theme)
--   - Banking: Overview · Send Money (5% bank + 5% economy fee) · Savings
--     (4.25% APY) · Stocks (5 global companies) · Transactions
--   - Department of Economy (DOE) panel — only visible to "D2Here4game"
--
-- Backend: ServerScriptService/BankServer (auto-creates its remotes),
--          ReplicatedStorage/StockMarket
-- ============================================================

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService  = game:GetService("UserInputService")
local TweenService      = game:GetService("TweenService")
local RunService        = game:GetService("RunService")

local player    = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local camera    = workspace.CurrentCamera

local StockMarket = require(ReplicatedStorage:WaitForChild("StockMarket"))
local bankRequest = ReplicatedStorage:WaitForChild("BankRequest")
local bankNotify  = ReplicatedStorage:WaitForChild("BankNotify")

-- ============================================================
-- THEME (Novalis)
-- ============================================================
local BG      = Color3.fromRGB(18, 10, 20)
local BG2     = Color3.fromRGB(26, 14, 30)
local PANEL   = Color3.fromRGB(34, 18, 40)
local CARD    = Color3.fromRGB(46, 24, 54)
local CARD2   = Color3.fromRGB(58, 30, 68)
local PINK    = Color3.fromRGB(236, 64, 170)
local PURPLE  = Color3.fromRGB(150, 50, 210)
local TEXT    = Color3.fromRGB(242, 236, 246)
local SUB     = Color3.fromRGB(176, 156, 186)
local GREEN   = Color3.fromRGB(80, 205, 135)
local RED      = Color3.fromRGB(236, 96, 116)
local F        = Enum.Font.GothamBold
local FR       = Enum.Font.Gotham
local FM       = Enum.Font.GothamMedium

local EASE     = TweenInfo.new(0.22, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local EASE_POP = TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out)

-- ============================================================
-- tiny builder helpers
-- ============================================================
local function mk(class, props)
	local o = Instance.new(class)
	for k, v in pairs(props) do
		if k ~= "Parent" then o[k] = v end
	end
	if props.Parent then o.Parent = props.Parent end
	return o
end
local function rc(inst, r)
	local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, r or 8) c.Parent = inst return c
end
local function grad(inst, a, b, rot)
	local g = Instance.new("UIGradient")
	g.Color = ColorSequence.new(a, b)
	g.Rotation = rot or 90
	g.Parent = inst
	return g
end
local function commas(n)
	local neg = n < 0
	local s = tostring(math.floor(math.abs(n)))
	s = s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
	return (neg and "-$" or "$") .. s
end
local function money2(n)  -- with 2 decimals
	local neg = n < 0
	n = math.abs(n)
	local whole = math.floor(n)
	local cents = math.floor((n - whole) * 100 + 0.5)
	local s = tostring(whole):reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
	return string.format("%s$%s.%02d", neg and "-" or "", s, cents)
end

-- ============================================================
-- ROOT GUIs
-- ============================================================
local gui = mk("ScreenGui", {
	Name = "NovalOS", ResetOnSpawn = false, IgnoreGuiInset = true,
	DisplayOrder = 120, ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Enabled = false, Parent = playerGui,
})

local toastGui = mk("ScreenGui", {
	Name = "NovalOSToast", ResetOnSpawn = false, IgnoreGuiInset = true,
	DisplayOrder = 121, Parent = playerGui,
})

-- ============================================================
-- WINDOW (draggable, scalable, fit-to-frame)
-- ============================================================
local phone = mk("Frame", {
	Name = "Window", AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(320, 620),
	BackgroundColor3 = BG, BorderSizePixel = 0, Parent = gui,
})
rc(phone, 26)
local uiScale = mk("UIScale", { Scale = 1, Parent = phone })
local winStroke = mk("UIStroke", { Color = PINK, Thickness = 1.5, Transparency = 0.3, Parent = phone })
grad(phone, BG2, BG, 90)
-- soft pink outer glow
local glow = mk("ImageLabel", {
	BackgroundTransparency = 1, Image = "rbxassetid://5028857084",
	ImageColor3 = PINK, ImageTransparency = 0.55,
	Size = UDim2.new(1, 60, 1, 60), Position = UDim2.new(0, -30, 0, -30),
	ZIndex = 0, Parent = phone,
})

local targetW, targetH = 320, 620
local cx, cy = camera.ViewportSize.X / 2, camera.ViewportSize.Y / 2

local function applyScale()
	local vp = camera.ViewportSize
	uiScale.Scale = math.min(1, (vp.X * 0.94) / targetW, (vp.Y * 0.94) / targetH)
end
local function clampCenter()
	local vp = camera.ViewportSize
	local halfW = targetW * uiScale.Scale / 2
	local halfH = targetH * uiScale.Scale / 2
	cx = math.clamp(cx, halfW, math.max(halfW, vp.X - halfW))
	cy = math.clamp(cy, halfH, math.max(halfH, vp.Y - halfH))
	phone.Position = UDim2.fromOffset(cx, cy)
end
local function setSize(w, h, animate)
	targetW, targetH = w, h
	if animate then
		TweenService:Create(phone, EASE, { Size = UDim2.fromOffset(w, h) }):Play()
	else
		phone.Size = UDim2.fromOffset(w, h)
	end
	applyScale()
	clampCenter()
end
camera:GetPropertyChangedSignal("ViewportSize"):Connect(function()
	applyScale() clampCenter()
end)

-- ===== top drag strip (grabber + home + power) =====
local dragStrip = mk("Frame", {
	Name = "DragStrip", Size = UDim2.new(1, 0, 0, 30), BackgroundColor3 = BG2,
	BackgroundTransparency = 0.15, BorderSizePixel = 0, ZIndex = 20, Parent = phone,
})
rc(dragStrip, 26)
mk("Frame", { Size = UDim2.new(1,0,0,16), Position = UDim2.new(0,0,1,-16), BackgroundColor3 = BG2, BackgroundTransparency = 0.15, BorderSizePixel = 0, ZIndex = 20, Parent = dragStrip })
local grab = mk("Frame", {
	AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.fromOffset(46, 5), BackgroundColor3 = PINK, BackgroundTransparency = 0.2,
	BorderSizePixel = 0, ZIndex = 21, Parent = dragStrip,
})
rc(grab, 3)
local homeBtn = mk("TextButton", {
	AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.new(0, 8, 0.5, 0),
	Size = UDim2.fromOffset(24, 20), BackgroundTransparency = 1, Text = "⌂",
	Font = F, TextSize = 18, TextColor3 = PINK, ZIndex = 22, Parent = dragStrip,
})
local powerBtn = mk("TextButton", {
	AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -8, 0.5, 0),
	Size = UDim2.fromOffset(24, 20), BackgroundTransparency = 1, Text = "⏻",
	Font = F, TextSize = 16, TextColor3 = SUB, ZIndex = 22, Parent = dragStrip,
})

-- drag logic (PC + touch)
do
	local dragging, startPos, startCx, startCy = false, nil, nil, nil
	dragStrip.InputBegan:Connect(function(io)
		if io.UserInputType == Enum.UserInputType.MouseButton1 or io.UserInputType == Enum.UserInputType.Touch then
			dragging = true startPos = io.Position startCx = cx startCy = cy
		end
	end)
	UserInputService.InputChanged:Connect(function(io)
		if dragging and (io.UserInputType == Enum.UserInputType.MouseMovement or io.UserInputType == Enum.UserInputType.Touch) then
			local d = io.Position - startPos
			cx = startCx + d.X cy = startCy + d.Y
			clampCenter()
		end
	end)
	UserInputService.InputEnded:Connect(function(io)
		if io.UserInputType == Enum.UserInputType.MouseButton1 or io.UserInputType == Enum.UserInputType.Touch then
			dragging = false
		end
	end)
end

-- ===== screen area (below drag strip) =====
local screen = mk("Frame", {
	Position = UDim2.new(0, 0, 0, 26), Size = UDim2.new(1, 0, 1, -26),
	BackgroundTransparency = 1, ClipsDescendants = true, Parent = phone,
})

-- ============================================================
-- TOAST
-- ============================================================
local function toast(msg, good)
	local t = mk("Frame", {
		AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, -60),
		Size = UDim2.fromOffset(360, 44), BackgroundColor3 = PANEL, BorderSizePixel = 0, Parent = toastGui,
	})
	rc(t, 12)
	mk("UIStroke", { Color = good and GREEN or PINK, Thickness = 1.5, Transparency = 0.2, Parent = t })
	mk("TextLabel", {
		Size = UDim2.new(1, -24, 1, 0), Position = UDim2.new(0, 12, 0, 0), BackgroundTransparency = 1,
		Font = FM, TextSize = 14, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = true, Text = msg, Parent = t,
	})
	TweenService:Create(t, EASE_POP, { Position = UDim2.new(0.5, 0, 0, 18) }):Play()
	task.delay(3.2, function()
		TweenService:Create(t, EASE, { Position = UDim2.new(0.5, 0, 0, -60) }):Play()
		task.wait(0.25) t:Destroy()
	end)
end
bankNotify.OnClientEvent:Connect(function(msg) toast(msg, true) end)

-- ============================================================
-- request wrapper
-- ============================================================
local state = { snap = nil }
local function bank(action, a, b)
	local ok, res = pcall(function() return bankRequest:InvokeServer(action, a, b) end)
	if not ok then toast("Connection error.") return { ok = false } end
	if res and res.data then state.snap = res.data end
	if res and res.msg then toast(res.msg, res.ok) end
	return res or { ok = false }
end
local function refresh()
	local res = bank("getdata")
	if res and res.ok then state.snap = res end
	return state.snap
end

-- ============================================================
-- PAGES: home / browser / bank
-- ============================================================
local pages = {}
local currentPage = nil

-- ---------- HOME ----------
local home = mk("Frame", { Size = UDim2.new(1,0,1,0), BackgroundColor3 = BG, BorderSizePixel = 0, Parent = screen })
grad(home, Color3.fromRGB(40, 16, 48), Color3.fromRGB(14, 8, 18), 115)
pages.home = home

mk("TextLabel", {
	Position = UDim2.new(0, 0, 0, 26), Size = UDim2.new(1, 0, 0, 46), BackgroundTransparency = 1,
	Font = F, TextSize = 40, TextColor3 = TEXT, Text = "9:41", Parent = home,
})
mk("TextLabel", {
	Position = UDim2.new(0, 0, 0, 72), Size = UDim2.new(1, 0, 0, 20), BackgroundTransparency = 1,
	Font = FM, TextSize = 13, TextColor3 = SUB, Text = "NovalOS", Parent = home,
})

local appGrid = mk("Frame", {
	AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -24),
	Size = UDim2.new(1, -40, 0, 360), BackgroundTransparency = 1, Parent = home,
})
local ag = mk("UIGridLayout", {
	CellSize = UDim2.fromOffset(66, 88), CellPadding = UDim2.fromOffset(18, 16),
	HorizontalAlignment = Enum.HorizontalAlignment.Center, Parent = appGrid,
})

local function makeApp(icon, label, iconColor, onOpen)
	local btn = mk("TextButton", { BackgroundTransparency = 1, Text = "", AutoButtonColor = false, Parent = appGrid })
	local ic = mk("TextButton", {
		Size = UDim2.fromOffset(64, 64), BackgroundColor3 = iconColor or CARD, BorderSizePixel = 0,
		Font = F, TextSize = 30, Text = icon, TextColor3 = TEXT, AutoButtonColor = false, Parent = btn,
	})
	rc(ic, 16)
	grad(ic, (iconColor or CARD):Lerp(Color3.new(1,1,1), 0.12), (iconColor or CARD):Lerp(Color3.new(0,0,0), 0.15), 90)
	mk("TextLabel", {
		Position = UDim2.new(0, 0, 0, 66), Size = UDim2.new(1, 0, 0, 18), BackgroundTransparency = 1,
		Font = FM, TextSize = 12, TextColor3 = TEXT, Text = label, Parent = btn,
	})
	local function press()
		TweenService:Create(ic, TweenInfo.new(0.08), { Size = UDim2.fromOffset(58, 58) }):Play()
		task.wait(0.08)
		TweenService:Create(ic, EASE_POP, { Size = UDim2.fromOffset(64, 64) }):Play()
		onOpen()
	end
	ic.MouseButton1Click:Connect(press)
	btn.MouseButton1Click:Connect(press)
end

-- ---------- BROWSER ----------
local browser = mk("Frame", { Size = UDim2.new(1,0,1,0), BackgroundColor3 = BG2, BorderSizePixel = 0, Visible = false, Parent = screen })
pages.browser = browser

local chrome = mk("Frame", { Size = UDim2.new(1,0,0,44), BackgroundColor3 = PANEL, BorderSizePixel = 0, Parent = browser })
local backBtn = mk("TextButton", {
	Position = UDim2.new(0, 8, 0.5, 0), AnchorPoint = Vector2.new(0, 0.5), Size = UDim2.fromOffset(28, 28),
	BackgroundColor3 = CARD, BorderSizePixel = 0, Font = F, TextSize = 16, Text = "‹", TextColor3 = TEXT, Parent = chrome,
})
rc(backBtn, 8)
local addr = mk("TextBox", {
	Position = UDim2.new(0, 44, 0.5, 0), AnchorPoint = Vector2.new(0, 0.5), Size = UDim2.new(1, -96, 0, 30),
	BackgroundColor3 = BG, BorderSizePixel = 0, Font = FR, TextSize = 13, TextColor3 = TEXT,
	PlaceholderText = "Search or type a site…", PlaceholderColor3 = SUB, Text = "", ClearTextOnFocus = false,
	TextXAlignment = Enum.TextXAlignment.Left, Parent = chrome,
})
rc(addr, 8)
mk("UIPadding", { PaddingLeft = UDim.new(0, 10), Parent = addr })
local goBtn = mk("TextButton", {
	AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -8, 0.5, 0), Size = UDim2.fromOffset(40, 30),
	BackgroundColor3 = PINK, BorderSizePixel = 0, Font = F, TextSize = 13, Text = "Go", TextColor3 = TEXT, Parent = chrome,
})
rc(goBtn, 8)

local startPage = mk("Frame", {
	Position = UDim2.new(0, 0, 0, 44), Size = UDim2.new(1, 0, 1, -44), BackgroundTransparency = 1, Parent = browser,
})
mk("TextLabel", {
	Position = UDim2.new(0, 0, 0, 40), Size = UDim2.new(1, 0, 0, 40), BackgroundTransparency = 1,
	Font = F, TextSize = 30, TextColor3 = PINK, Text = "novalis", Parent = startPage,
})
mk("TextLabel", {
	Position = UDim2.new(0, 0, 0, 80), Size = UDim2.new(1, 0, 0, 18), BackgroundTransparency = 1,
	Font = FM, TextSize = 12, TextColor3 = SUB, Text = "the web, quietly", Parent = startPage,
})
local bmHolder = mk("Frame", {
	AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 130), Size = UDim2.new(1, -40, 0, 200),
	BackgroundTransparency = 1, Parent = startPage,
})
mk("UIListLayout", { Padding = UDim.new(0, 12), HorizontalAlignment = Enum.HorizontalAlignment.Center, Parent = bmHolder })

local openBank  -- fwd decl
local function makeBookmark(icon, title, sub, color, cb)
	local b = mk("TextButton", {
		Size = UDim2.new(1, 0, 0, 60), BackgroundColor3 = CARD, BorderSizePixel = 0, Text = "", AutoButtonColor = false, Parent = bmHolder,
	})
	rc(b, 12)
	local ic = mk("TextLabel", {
		Position = UDim2.new(0, 10, 0.5, 0), AnchorPoint = Vector2.new(0, 0.5), Size = UDim2.fromOffset(40, 40),
		BackgroundColor3 = color, BorderSizePixel = 0, Font = F, TextSize = 22, Text = icon, TextColor3 = TEXT, Parent = b,
	})
	rc(ic, 10)
	mk("TextLabel", {
		Position = UDim2.new(0, 60, 0, 10), Size = UDim2.new(1, -70, 0, 20), BackgroundTransparency = 1,
		Font = F, TextSize = 15, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = title, Parent = b,
	})
	mk("TextLabel", {
		Position = UDim2.new(0, 60, 0, 30), Size = UDim2.new(1, -70, 0, 18), BackgroundTransparency = 1,
		Font = FR, TextSize = 12, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = sub, Parent = b,
	})
	b.MouseButton1Click:Connect(cb)
	b.MouseEnter:Connect(function() TweenService:Create(b, EASE, { BackgroundColor3 = CARD2 }):Play() end)
	b.MouseLeave:Connect(function() TweenService:Create(b, EASE, { BackgroundColor3 = CARD }):Play() end)
	return b
end

local errorPage = mk("TextLabel", {
	Position = UDim2.new(0, 0, 0, 44), Size = UDim2.new(1, 0, 1, -44), BackgroundTransparency = 1,
	Font = FM, TextSize = 14, TextColor3 = SUB, TextWrapped = true, Visible = false,
	Text = "⚠  This site can't be reached.", Parent = browser,
})

local function navigate(url)
	url = string.lower(url or "")
	if url:find("bank") or url:find("little") then
		openBank()
	elseif url == "" then
		startPage.Visible = true errorPage.Visible = false
	else
		startPage.Visible = false errorPage.Visible = true
		errorPage.Text = "⚠  This site can't be reached.\n\n" .. url
	end
end
goBtn.MouseButton1Click:Connect(function() navigate(addr.Text) end)
addr.FocusLost:Connect(function(enter) if enter then navigate(addr.Text) end end)

-- ============================================================
-- BANKING (landscape "1080p")
-- ============================================================
local bankFrame = mk("Frame", { Size = UDim2.new(1,0,1,0), BackgroundColor3 = Color3.fromRGB(16, 9, 20), BorderSizePixel = 0, Visible = false, Parent = screen })
pages.bank = bankFrame

-- sidebar
local sidebar = mk("Frame", { Size = UDim2.new(0, 190, 1, 0), BackgroundColor3 = BG, BorderSizePixel = 0, Parent = bankFrame })
grad(sidebar, Color3.fromRGB(30, 14, 36), Color3.fromRGB(14, 8, 18), 115)
mk("TextLabel", {
	Position = UDim2.new(0, 18, 0, 16), Size = UDim2.new(1, -30, 0, 26), BackgroundTransparency = 1,
	Font = F, TextSize = 18, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "◍ Little World", Parent = sidebar,
})
mk("TextLabel", {
	Position = UDim2.new(0, 18, 0, 40), Size = UDim2.new(1, -30, 0, 16), BackgroundTransparency = 1,
	Font = FR, TextSize = 11, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "Online Banking", Parent = sidebar,
})

local navHolder = mk("Frame", { Position = UDim2.new(0, 10, 0, 74), Size = UDim2.new(1, -20, 1, -120), BackgroundTransparency = 1, Parent = sidebar })
mk("UIListLayout", { Padding = UDim.new(0, 4), Parent = navHolder })

local signOut = mk("TextButton", {
	AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -14), Size = UDim2.new(1, -24, 0, 34),
	BackgroundColor3 = CARD, BorderSizePixel = 0, Font = F, TextSize = 13, Text = "⤶  Sign Out", TextColor3 = TEXT, Parent = sidebar,
})
rc(signOut, 9)

-- top bar
local topbar = mk("Frame", { Position = UDim2.new(0, 190, 0, 0), Size = UDim2.new(1, -190, 0, 54), BackgroundColor3 = Color3.fromRGB(22, 12, 26), BorderSizePixel = 0, Parent = bankFrame })
local welcome = mk("TextLabel", {
	Position = UDim2.new(0, 22, 0, 0), Size = UDim2.new(0.6, 0, 1, 0), BackgroundTransparency = 1,
	Font = F, TextSize = 20, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "Welcome", Parent = topbar,
})
local secureTag = mk("TextLabel", {
	AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -20, 0.5, 0), Size = UDim2.fromOffset(130, 28),
	BackgroundColor3 = CARD, BorderSizePixel = 0, Font = FM, TextSize = 12, TextColor3 = GREEN, Text = "🔒 Secure Session", Parent = topbar,
})
rc(secureTag, 14)

-- content area (bank pages)
local bankContent = mk("Frame", { Position = UDim2.new(0, 190, 0, 54), Size = UDim2.new(1, -190, 1, -54), BackgroundTransparency = 1, Parent = bankFrame })

local bankPages = {}
local currentBankPage
local function showBankPage(name)
	for n, pg in pairs(bankPages) do pg.Visible = (n == name) end
	currentBankPage = name
	if name == "Stocks" or name == "Overview" then end
end

local navButtons = {}
local function makeNav(icon, name, superOnly)
	local b = mk("TextButton", {
		Size = UDim2.new(1, 0, 0, 38), BackgroundColor3 = CARD, BackgroundTransparency = 1, BorderSizePixel = 0,
		Font = FM, TextSize = 14, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left,
		Text = "   " .. icon .. "   " .. name, AutoButtonColor = false, Parent = navHolder,
	})
	rc(b, 9)
	navButtons[name] = b
	b.MouseEnter:Connect(function() if currentBankPage ~= name then TweenService:Create(b, EASE, {BackgroundTransparency = 0.4, TextColor3 = TEXT}):Play() end end)
	b.MouseLeave:Connect(function() if currentBankPage ~= name then TweenService:Create(b, EASE, {BackgroundTransparency = 1, TextColor3 = SUB}):Play() end end)
	b.MouseButton1Click:Connect(function()
		showBankPage(name)
		for n, nb in pairs(navButtons) do
			local on = (n == name)
			TweenService:Create(nb, EASE, { BackgroundColor3 = PINK, BackgroundTransparency = on and 0 or 1, TextColor3 = on and TEXT or SUB }):Play()
		end
	end)
	return b
end

-- ---- helper: a bank sub-page (scrolling) ----
local function bankPage(name)
	local pg = mk("ScrollingFrame", {
		Size = UDim2.new(1, 0, 1, 0), BackgroundTransparency = 1, BorderSizePixel = 0,
		ScrollBarThickness = 5, ScrollBarImageColor3 = PINK, CanvasSize = UDim2.new(0,0,0,0),
		AutomaticCanvasSize = Enum.AutomaticSize.Y, Visible = false, Parent = bankContent,
	})
	mk("UIPadding", { PaddingTop = UDim.new(0,18), PaddingBottom = UDim.new(0,18), PaddingLeft = UDim.new(0,22), PaddingRight = UDim.new(0,22), Parent = pg })
	bankPages[name] = pg
	return pg
end

-- category chip color
local function catColor(cat)
	if cat == "Income" or cat == "Refund" then return GREEN end
	if cat == "Invest" then return PURPLE end
	if cat == "Savings" then return Color3.fromRGB(90, 170, 235) end
	if cat == "Auto" then return Color3.fromRGB(235, 150, 60) end
	if cat == "Transfer" then return PINK end
	return SUB
end

-- transaction table (reused). rows = list of {t,desc,cat,amt,bal}
local function buildTxTable(parent, rows, showBalance)
	local holder = mk("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = CARD, BackgroundTransparency = 0.3, BorderSizePixel = 0, Parent = parent })
	rc(holder, 12)
	local list = mk("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, Parent = holder })
	mk("UIListLayout", { Parent = list })
	-- header row
	local hr = mk("Frame", { Size = UDim2.new(1, 0, 0, 32), BackgroundTransparency = 1, Parent = list })
	local function hcol(txt, x, w, align)
		mk("TextLabel", { Position = UDim2.new(x, 0, 0, 0), Size = UDim2.new(w, 0, 1, 0), BackgroundTransparency = 1,
			Font = F, TextSize = 11, TextColor3 = SUB, TextXAlignment = align or Enum.TextXAlignment.Left,
			Text = txt, Parent = hr })
	end
	hcol("DATE", 0.02, 0.24)
	hcol("DESCRIPTION", 0.27, 0.34)
	hcol("CATEGORY", 0.60, 0.16)
	hcol("AMOUNT", 0.74, 0.13, Enum.TextXAlignment.Right)
	if showBalance then hcol("BALANCE", 0.87, 0.12, Enum.TextXAlignment.Right) end

	if #rows == 0 then
		mk("TextLabel", { Size = UDim2.new(1,0,0,40), BackgroundTransparency = 1, Font = FR, TextSize = 13, TextColor3 = SUB, Text = "No transactions yet.", Parent = list })
	end
	for _, r in ipairs(rows) do
		local row = mk("Frame", { Size = UDim2.new(1, 0, 0, 38), BackgroundTransparency = 1, Parent = list })
		mk("Frame", { Position = UDim2.new(0.02, 0, 1, -1), Size = UDim2.new(0.96, 0, 0, 1), BackgroundColor3 = CARD2, BorderSizePixel = 0, Parent = row })
		mk("TextLabel", { Position = UDim2.new(0.02,0,0,0), Size = UDim2.new(0.24,0,1,0), BackgroundTransparency = 1,
			Font = FR, TextSize = 12, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left,
			Text = os.date("%m/%d/%y %I:%M %p", r.t), Parent = row })
		mk("TextLabel", { Position = UDim2.new(0.27,0,0,0), Size = UDim2.new(0.32,0,1,0), BackgroundTransparency = 1,
			Font = FM, TextSize = 12, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd,
			Text = r.desc, Parent = row })
		local chip = mk("TextLabel", { Position = UDim2.new(0.60,0,0.5,0), AnchorPoint = Vector2.new(0,0.5), Size = UDim2.fromOffset(0, 20),
			AutomaticSize = Enum.AutomaticSize.X, BackgroundColor3 = catColor(r.cat), BackgroundTransparency = 0.75,
			Font = F, TextSize = 10, TextColor3 = catColor(r.cat), Text = "  " .. r.cat .. "  ", Parent = row })
		rc(chip, 10)
		local pos = r.amt >= 0
		mk("TextLabel", { Position = UDim2.new(0.74,0,0,0), Size = UDim2.new(0.13,0,1,0), BackgroundTransparency = 1,
			Font = F, TextSize = 12, TextColor3 = pos and GREEN or RED, TextXAlignment = Enum.TextXAlignment.Right,
			Text = (pos and "+" or "") .. money2(r.amt), Parent = row })
		if showBalance then
			mk("TextLabel", { Position = UDim2.new(0.87,0,0,0), Size = UDim2.new(0.12,0,1,0), BackgroundTransparency = 1,
				Font = FM, TextSize = 12, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Right,
				Text = money2(r.bal), Parent = row })
		end
	end
	return holder
end

-- ============================================================
-- BANK PAGE: OVERVIEW
-- ============================================================
local overviewPage = bankPage("Overview")
local ovCards = mk("Frame", { Size = UDim2.new(1, 0, 0, 110), BackgroundTransparency = 1, Parent = overviewPage })
mk("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 14), Parent = ovCards })
local function bigCard(highlight)
	local c = mk("Frame", { Size = UDim2.new(0.333, -10, 1, 0), BackgroundColor3 = highlight and PINK or CARD, BorderSizePixel = 0, Parent = ovCards })
	rc(c, 14)
	if highlight then grad(c, PINK, PURPLE, 35) end
	local title = mk("TextLabel", { Position = UDim2.new(0, 16, 0, 14), Size = UDim2.new(1, -32, 0, 16), BackgroundTransparency = 1,
		Font = FM, TextSize = 12, TextColor3 = highlight and Color3.fromRGB(255,225,245) or SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "", Parent = c })
	local val = mk("TextLabel", { Position = UDim2.new(0, 16, 0, 34), Size = UDim2.new(1, -32, 0, 34), BackgroundTransparency = 1,
		Font = F, TextSize = 26, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "$0.00", Parent = c })
	local sub = mk("TextLabel", { Position = UDim2.new(0, 16, 0, 72), Size = UDim2.new(1, -32, 0, 16), BackgroundTransparency = 1,
		Font = FR, TextSize = 11, TextColor3 = highlight and Color3.fromRGB(255,220,240) or SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "", Parent = c })
	return { title = title, val = val, sub = sub }
end
local cardChecking = bigCard(true)
local cardSavings  = bigCard(false)
local cardPortfolio = bigCard(false)
cardChecking.title.Text = "Checking Account"   cardChecking.sub.Text = "Available Balance"
cardSavings.title.Text = "Savings Account"      cardSavings.sub.Text = "High-Yield Savings (4.25% APY)"
cardPortfolio.title.Text = "Investments"        cardPortfolio.sub.Text = "Global Stock Portfolio"

mk("TextLabel", { Position = UDim2.new(0,0,0,124), Size = UDim2.new(1,0,0,24), BackgroundTransparency = 1,
	Font = F, TextSize = 15, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "🧾 Recent Transactions", Parent = overviewPage })
local overviewTxHolder = mk("Frame", { Position = UDim2.new(0,0,0,152), Size = UDim2.new(1,0,0,0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, Parent = overviewPage })

-- ============================================================
-- BANK PAGE: SEND MONEY
-- ============================================================
local sendPage = bankPage("Send Money")
mk("TextLabel", { Size = UDim2.new(1,0,0,26), BackgroundTransparency = 1, Font = F, TextSize = 18, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "Send Money", Parent = sendPage })
mk("TextLabel", { Size = UDim2.new(1,0,0,18), BackgroundTransparency = 1, Font = FR, TextSize = 12, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "Transfers carry a 5% bank fee + 5% economy fee (Dept. of Economy).", Parent = sendPage })

mk("TextLabel", { Size = UDim2.new(1,0,0,22), BackgroundTransparency = 1, Font = FM, TextSize = 13, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "Recipient (in this server)", Parent = sendPage })
local recipHolder = mk("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, Parent = sendPage })
local recipList = mk("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, Parent = recipHolder })
mk("UIListLayout", { Padding = UDim.new(0, 6), Parent = recipList })

local sendTarget = nil
local recipButtons = {}
local function refreshRecipients()
	for _, c in ipairs(recipList:GetChildren()) do if c:IsA("TextButton") then c:Destroy() end end
	recipButtons = {}
	for _, p in ipairs(Players:GetPlayers()) do
		if p ~= player then
			local b = mk("TextButton", { Size = UDim2.new(1, 0, 0, 36), BackgroundColor3 = CARD, BorderSizePixel = 0,
				Font = FM, TextSize = 13, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left,
				Text = "   " .. p.DisplayName .. "  (@" .. p.Name .. ")", AutoButtonColor = false, Parent = recipList })
			rc(b, 8)
			recipButtons[p.Name] = b
			b.MouseButton1Click:Connect(function()
				sendTarget = p.Name
				for nm, bb in pairs(recipButtons) do
					TweenService:Create(bb, EASE, { BackgroundColor3 = (nm == p.Name) and PINK or CARD }):Play()
				end
			end)
		end
	end
	if not next(recipButtons) then
		mk("TextLabel", { Size = UDim2.new(1,0,0,34), BackgroundTransparency = 1, Font = FR, TextSize = 13, TextColor3 = SUB, Text = "No other players in this server.", Parent = recipList })
	end
end

mk("TextLabel", { Size = UDim2.new(1,0,0,22), BackgroundTransparency = 1, Font = FM, TextSize = 13, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "Amount", Parent = sendPage })
local sendAmt = mk("TextBox", { Size = UDim2.new(1, 0, 0, 40), BackgroundColor3 = CARD, BorderSizePixel = 0, Font = F, TextSize = 16, TextColor3 = TEXT,
	PlaceholderText = "0", PlaceholderColor3 = SUB, Text = "", ClearTextOnFocus = false, TextXAlignment = Enum.TextXAlignment.Left, Parent = sendPage })
rc(sendAmt, 8)
mk("UIPadding", { PaddingLeft = UDim.new(0, 12), Parent = sendAmt })

local feePreview = mk("TextLabel", { Size = UDim2.new(1,0,0,20), BackgroundTransparency = 1, Font = FM, TextSize = 12, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "Recipient gets $0 · Fees $0", Parent = sendPage })
local function updateFeePreview()
	local amt = math.floor(tonumber(sendAmt.Text) or 0)
	local fb = (state.snap and state.snap.feeBank) or 0.05
	local fd = (state.snap and state.snap.feeDOE) or 0.05
	local feeBank = math.floor(amt * fb)
	local feeDOE = math.floor(amt * fd)
	local got = amt - feeBank - feeDOE
	feePreview.Text = ("Recipient gets %s · Fees %s (5%% bank + 5%% economy)"):format(commas(math.max(0,got)), commas(feeBank + feeDOE))
end
sendAmt:GetPropertyChangedSignal("Text"):Connect(updateFeePreview)

local sendBtn = mk("TextButton", { Size = UDim2.new(1, 0, 0, 44), BackgroundColor3 = PINK, BorderSizePixel = 0, Font = F, TextSize = 15, Text = "Send Money", TextColor3 = TEXT, AutoButtonColor = false, Parent = sendPage })
rc(sendBtn, 10)
grad(sendBtn, PINK, PURPLE, 25)
sendBtn.MouseButton1Click:Connect(function()
	if not sendTarget then toast("Pick a recipient first.") return end
	local res = bank("send", sendTarget, math.floor(tonumber(sendAmt.Text) or 0))
	if res.ok then sendAmt.Text = "" updateFeePreview() renderBank() end
end)

-- ============================================================
-- BANK PAGE: SAVINGS
-- ============================================================
local savingsPage = bankPage("Savings")
mk("TextLabel", { Size = UDim2.new(1,0,0,26), BackgroundTransparency = 1, Font = F, TextSize = 18, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "High-Yield Savings", Parent = savingsPage })
local savCard = mk("Frame", { Size = UDim2.new(1, 0, 0, 92), BackgroundColor3 = CARD, BorderSizePixel = 0, Parent = savingsPage })
rc(savCard, 14) grad(savCard, CARD2, CARD, 90)
local savBalLbl = mk("TextLabel", { Position = UDim2.new(0,18,0,16), Size = UDim2.new(1,-36,0,34), BackgroundTransparency = 1, Font = F, TextSize = 28, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "$0.00", Parent = savCard })
mk("TextLabel", { Position = UDim2.new(0,18,0,54), Size = UDim2.new(1,-36,0,18), BackgroundTransparency = 1, Font = FR, TextSize = 12, TextColor3 = GREEN, TextXAlignment = Enum.TextXAlignment.Left, Text = "Earning 4.25% APY · interest paid automatically", Parent = savCard })

mk("TextLabel", { Size = UDim2.new(1,0,0,22), BackgroundTransparency = 1, Font = FM, TextSize = 13, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "Amount", Parent = savingsPage })
local savAmt = mk("TextBox", { Size = UDim2.new(1, 0, 0, 40), BackgroundColor3 = CARD, BorderSizePixel = 0, Font = F, TextSize = 16, TextColor3 = TEXT,
	PlaceholderText = "0", PlaceholderColor3 = SUB, Text = "", ClearTextOnFocus = false, TextXAlignment = Enum.TextXAlignment.Left, Parent = savingsPage })
rc(savAmt, 8) mk("UIPadding", { PaddingLeft = UDim.new(0, 12), Parent = savAmt })
local savRow = mk("Frame", { Size = UDim2.new(1, 0, 0, 42), BackgroundTransparency = 1, Parent = savingsPage })
mk("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 12), Parent = savRow })
local depBtn = mk("TextButton", { Size = UDim2.new(0.5, -6, 1, 0), BackgroundColor3 = GREEN, BorderSizePixel = 0, Font = F, TextSize = 14, Text = "Deposit ↑", TextColor3 = TEXT, AutoButtonColor = false, Parent = savRow })
rc(depBtn, 9)
local wdBtn = mk("TextButton", { Size = UDim2.new(0.5, -6, 1, 0), BackgroundColor3 = CARD2, BorderSizePixel = 0, Font = F, TextSize = 14, Text = "Withdraw ↓", TextColor3 = TEXT, AutoButtonColor = false, Parent = savRow })
rc(wdBtn, 9)
depBtn.MouseButton1Click:Connect(function() local r = bank("deposit", math.floor(tonumber(savAmt.Text) or 0)) if r.ok then savAmt.Text = "" renderBank() end end)
wdBtn.MouseButton1Click:Connect(function() local r = bank("withdraw", math.floor(tonumber(savAmt.Text) or 0)) if r.ok then savAmt.Text = "" renderBank() end end)

-- ============================================================
-- BANK PAGE: STOCKS
-- ============================================================
local stocksPage = bankPage("Stocks")
mk("TextLabel", { Size = UDim2.new(1,0,0,26), BackgroundTransparency = 1, Font = F, TextSize = 18, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "Global Markets", Parent = stocksPage })
local portfolioLbl = mk("TextLabel", { Size = UDim2.new(1,0,0,20), BackgroundTransparency = 1, Font = FM, TextSize = 13, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "Portfolio value: $0.00", Parent = stocksPage })

local stockRows = {}   -- id -> {priceLbl, changeLbl, holdLbl}
local selectedStock = StockMarket.COMPANIES[1].id
local stockListHolder = mk("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, Parent = stocksPage })
mk("UIListLayout", { Padding = UDim.new(0, 8), Parent = stockListHolder })

local tradePanel  -- fwd
local function selectStock(id)
	selectedStock = id
	for sid, r in pairs(stockRows) do
		TweenService:Create(r.row, EASE, { BackgroundColor3 = (sid == id) and CARD2 or CARD }):Play()
	end
	if tradePanel then tradePanel.update() end
end

for _, c in ipairs(StockMarket.COMPANIES) do
	local row = mk("TextButton", { Size = UDim2.new(1, 0, 0, 56), BackgroundColor3 = CARD, BorderSizePixel = 0, Text = "", AutoButtonColor = false, Parent = stockListHolder })
	rc(row, 12)
	mk("Frame", { Size = UDim2.new(0, 4, 0.6, 0), Position = UDim2.new(0, 0, 0.2, 0), BackgroundColor3 = c.color, BorderSizePixel = 0, Parent = row })
	mk("TextLabel", { Position = UDim2.new(0, 16, 0, 8), Size = UDim2.new(0.5, 0, 0, 20), BackgroundTransparency = 1, Font = F, TextSize = 14, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = c.name, Parent = row })
	mk("TextLabel", { Position = UDim2.new(0, 16, 0, 30), Size = UDim2.new(0.5, 0, 0, 16), BackgroundTransparency = 1, Font = FM, TextSize = 11, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = c.id, Parent = row })
	local priceLbl = mk("TextLabel", { AnchorPoint = Vector2.new(1,0), Position = UDim2.new(1, -16, 0, 8), Size = UDim2.new(0.4, 0, 0, 20), BackgroundTransparency = 1, Font = F, TextSize = 15, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Right, Text = "$0.00", Parent = row })
	local changeLbl = mk("TextLabel", { AnchorPoint = Vector2.new(1,0), Position = UDim2.new(1, -16, 0, 30), Size = UDim2.new(0.4, 0, 0, 16), BackgroundTransparency = 1, Font = FM, TextSize = 12, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Right, Text = "0.00%", Parent = row })
	local holdLbl = mk("TextLabel", { AnchorPoint = Vector2.new(0.5,1), Position = UDim2.new(0.5, 0, 1, -4), Size = UDim2.new(1, -32, 0, 14), BackgroundTransparency = 1, Font = FR, TextSize = 10, TextColor3 = PURPLE, TextXAlignment = Enum.TextXAlignment.Left, Text = "", Parent = row })
	stockRows[c.id] = { row = row, priceLbl = priceLbl, changeLbl = changeLbl, holdLbl = holdLbl }
	row.MouseButton1Click:Connect(function() selectStock(c.id) end)
end

-- trade panel (buy/sell/DRIP for the selected stock)
do
	local panel = mk("Frame", { Size = UDim2.new(1, 0, 0, 176), BackgroundColor3 = PANEL, BorderSizePixel = 0, Parent = stocksPage })
	rc(panel, 12)
	local nameLbl = mk("TextLabel", { Position = UDim2.new(0,16,0,12), Size = UDim2.new(1,-32,0,20), BackgroundTransparency = 1, Font = F, TextSize = 15, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "", Parent = panel })
	local infoLbl = mk("TextLabel", { Position = UDim2.new(0,16,0,32), Size = UDim2.new(1,-32,0,16), BackgroundTransparency = 1, Font = FM, TextSize = 12, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "", Parent = panel })
	local tradeAmt = mk("TextBox", { Position = UDim2.new(0,16,0,56), Size = UDim2.new(1,-32,0,36), BackgroundColor3 = CARD, BorderSizePixel = 0, Font = F, TextSize = 15, TextColor3 = TEXT,
		PlaceholderText = "$ amount to invest", PlaceholderColor3 = SUB, Text = "", ClearTextOnFocus = false, TextXAlignment = Enum.TextXAlignment.Left, Parent = panel })
	rc(tradeAmt, 8) mk("UIPadding", { PaddingLeft = UDim.new(0,12), Parent = tradeAmt })
	local btnRow = mk("Frame", { Position = UDim2.new(0,16,0,100), Size = UDim2.new(1,-32,0,36), BackgroundTransparency = 1, Parent = panel })
	mk("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0,8), Parent = btnRow })
	local buyB = mk("TextButton", { Size = UDim2.new(0.34,-6,1,0), BackgroundColor3 = GREEN, BorderSizePixel = 0, Font = F, TextSize = 13, Text = "Buy", TextColor3 = TEXT, AutoButtonColor = false, Parent = btnRow })
	rc(buyB, 8)
	local sellB = mk("TextButton", { Size = UDim2.new(0.33,-6,1,0), BackgroundColor3 = CARD2, BorderSizePixel = 0, Font = F, TextSize = 13, Text = "Sell $", TextColor3 = TEXT, AutoButtonColor = false, Parent = btnRow })
	rc(sellB, 8)
	local sellAllB = mk("TextButton", { Size = UDim2.new(0.33,-6,1,0), BackgroundColor3 = RED, BorderSizePixel = 0, Font = F, TextSize = 13, Text = "Sell All", TextColor3 = TEXT, AutoButtonColor = false, Parent = btnRow })
	rc(sellAllB, 8)

	-- DRIP toggle (the "option no other invest system has": auto-reinvest dividends)
	local dripHolder = mk("Frame", { Position = UDim2.new(0,16,0,144), Size = UDim2.new(1,-32,0,24), BackgroundTransparency = 1, Parent = panel })
	mk("TextLabel", { Size = UDim2.new(1,-56,1,0), BackgroundTransparency = 1, Font = FM, TextSize = 12, TextColor3 = SUB, TextXAlignment = Enum.TextXAlignment.Left, Text = "Auto-reinvest dividends (DRIP)", Parent = dripHolder })
	local dripTrack = mk("TextButton", { AnchorPoint = Vector2.new(1,0.5), Position = UDim2.new(1,0,0.5,0), Size = UDim2.fromOffset(44,22), BackgroundColor3 = BG, BorderSizePixel = 0, Text = "", AutoButtonColor = false, Parent = dripHolder })
	rc(dripTrack, 11)
	local dripKnob = mk("Frame", { AnchorPoint = Vector2.new(0,0.5), Position = UDim2.new(0,3,0.5,0), Size = UDim2.fromOffset(16,16), BackgroundColor3 = TEXT, BorderSizePixel = 0, Parent = dripTrack })
	rc(dripKnob, 8)

	local function setDrip(on)
		TweenService:Create(dripTrack, EASE, { BackgroundColor3 = on and GREEN or BG }):Play()
		TweenService:Create(dripKnob, EASE_POP, { Position = on and UDim2.new(1,-19,0.5,0) or UDim2.new(0,3,0.5,0) }):Play()
	end
	dripTrack.MouseButton1Click:Connect(function()
		local newState = not (state.snap and state.snap.drip)
		local r = bank("drip", newState and 1 or 0)
		if r.ok then setDrip(newState) end
	end)

	local function update()
		local c = StockMarket.get(selectedStock)
		if not c then return end
		local price = StockMarket.priceNow(c)
		nameLbl.Text = c.name .. "  (" .. c.id .. ")"
		local shares = (state.snap and state.snap.holdings and state.snap.holdings[c.id]) or 0
		infoLbl.Text = ("Price %s · You own %.3f sh (%s)"):format(money2(price), shares, money2(shares * price))
		setDrip(state.snap and state.snap.drip)
	end
	tradePanel = { update = update }

	buyB.MouseButton1Click:Connect(function()
		local r = bank("buystock", selectedStock, math.floor(tonumber(tradeAmt.Text) or 0))
		if r.ok then tradeAmt.Text = "" renderBank() end
	end)
	sellB.MouseButton1Click:Connect(function()
		local r = bank("sellstock", selectedStock, math.floor(tonumber(tradeAmt.Text) or 0))
		if r.ok then tradeAmt.Text = "" renderBank() end
	end)
	sellAllB.MouseButton1Click:Connect(function()
		local r = bank("sellstock", selectedStock, -1)
		if r.ok then tradeAmt.Text = "" renderBank() end
	end)
end

-- ============================================================
-- BANK PAGE: TRANSACTIONS
-- ============================================================
local txPage = bankPage("Transactions")
mk("TextLabel", { Size = UDim2.new(1,0,0,26), BackgroundTransparency = 1, Font = F, TextSize = 18, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "Transactions", Parent = txPage })
local txHolder = mk("Frame", { Size = UDim2.new(1,0,0,0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, Parent = txPage })

-- ============================================================
-- BANK PAGE: DEPARTMENT OF ECONOMY (D2Here4game only)
-- ============================================================
local doePage = bankPage("Dept. of Economy")
local doeNav = makeNav("🏛", "Dept. of Economy")   -- created but hidden unless owner
doeNav.Visible = false
mk("TextLabel", { Size = UDim2.new(1,0,0,26), BackgroundTransparency = 1, Font = F, TextSize = 18, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "🏛 Department of Economy", Parent = doePage })
local doePoolCard = mk("Frame", { Size = UDim2.new(1, 0, 0, 92), BackgroundColor3 = PINK, BorderSizePixel = 0, Parent = doePage })
rc(doePoolCard, 14) grad(doePoolCard, PINK, PURPLE, 35)
mk("TextLabel", { Position = UDim2.new(0,18,0,14), Size = UDim2.new(1,-36,0,16), BackgroundTransparency = 1, Font = FM, TextSize = 12, TextColor3 = Color3.fromRGB(255,225,245), TextXAlignment = Enum.TextXAlignment.Left, Text = "Global Economy Treasury", Parent = doePoolCard })
local doePoolLbl = mk("TextLabel", { Position = UDim2.new(0,18,0,32), Size = UDim2.new(1,-36,0,40), BackgroundTransparency = 1, Font = F, TextSize = 30, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "$0", Parent = doePoolCard })
mk("TextLabel", { Size = UDim2.new(1,0,0,24), BackgroundTransparency = 1, Font = F, TextSize = 15, TextColor3 = TEXT, TextXAlignment = Enum.TextXAlignment.Left, Text = "Economy Ledger (all servers)", Parent = doePage })
local doeLedgerHolder = mk("Frame", { Size = UDim2.new(1,0,0,0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, Parent = doePage })

-- ============================================================
-- RENDER everything from state.snap
-- ============================================================
function renderBank()
	local s = state.snap
	if not s then return end
	welcome.Text = "Welcome, " .. (s.name or "User")
	cardChecking.val.Text = money2(s.checking or 0)
	cardSavings.val.Text  = money2(s.savings or 0)
	cardPortfolio.val.Text = money2(s.portfolio or 0)
	savBalLbl.Text = money2(s.savings or 0)
	portfolioLbl.Text = "Portfolio value: " .. money2(s.portfolio or 0)

	-- overview tx (first 6)
	for _, c in ipairs(overviewTxHolder:GetChildren()) do if not c:IsA("UIListLayout") then c:Destroy() end end
	local recent = {}
	for i = 1, math.min(6, #(s.tx or {})) do recent[i] = s.tx[i] end
	buildTxTable(overviewTxHolder, recent, true)

	-- full tx
	for _, c in ipairs(txHolder:GetChildren()) do if not c:IsA("UIListLayout") then c:Destroy() end end
	buildTxTable(txHolder, s.tx or {}, true)

	-- stocks holdings labels
	for id, r in pairs(stockRows) do
		local shares = (s.holdings and s.holdings[id]) or 0
		if shares and shares > 0.0001 then
			local price = StockMarket.priceNow(StockMarket.get(id))
			r.holdLbl.Text = ("You own %.3f sh · %s"):format(shares, money2(shares * price))
		else
			r.holdLbl.Text = ""
		end
	end
	if tradePanel then tradePanel.update() end

	-- DOE
	if s.isDOE then
		doeNav.Visible = true
		if s.doe then
			doePoolLbl.Text = commas(s.doe.pool or 0)
			for _, c in ipairs(doeLedgerHolder:GetChildren()) do if not c:IsA("UIListLayout") then c:Destroy() end end
			local rows = {}
			for _, e in ipairs(s.doe.tx or {}) do
				table.insert(rows, {
					t = e.t or os.time(),
					desc = ("%s → %s"):format(e.from or "?", e.to or "?"),
					cat = "Transfer",
					amt = (e.bank or 0) + (e.economy or 0),
					bal = 0,
				})
			end
			buildTxTable(doeLedgerHolder, rows, false)
		end
	else
		doeNav.Visible = false
	end
end

-- ============================================================
-- live stock price ticker (only while stocks page visible)
-- ============================================================
RunService.Heartbeat:Connect(function()
	if not gui.Enabled or currentPage ~= "bank" then return end
	if currentBankPage ~= "Stocks" and currentBankPage ~= "Overview" then return end
	for _, c in ipairs(StockMarket.COMPANIES) do
		local r = stockRows[c.id]
		if r then
			local price = StockMarket.priceNow(c)
			local chg = StockMarket.changePct(c, 600)
			r.priceLbl.Text = money2(price)
			r.changeLbl.Text = (chg >= 0 and "▲ " or "▼ ") .. string.format("%.2f%%", math.abs(chg))
			r.changeLbl.TextColor3 = chg >= 0 and GREEN or RED
		end
	end
	if tradePanel and currentBankPage == "Stocks" then tradePanel.update() end
	-- keep portfolio value ticking
	if state.snap then
		local total = 0
		for id, shares in pairs(state.snap.holdings or {}) do
			local c = StockMarket.get(id)
			if c then total = total + shares * StockMarket.priceNow(c) end
		end
		state.snap.portfolio = total
		cardPortfolio.val.Text = money2(total)
		portfolioLbl.Text = "Portfolio value: " .. money2(total)
	end
end)

-- periodic data refresh while bank open
task.spawn(function()
	while true do
		task.wait(8)
		if gui.Enabled and currentPage == "bank" then
			refresh()
			renderBank()
		end
	end
end)

-- ============================================================
-- NAVIGATION
-- ============================================================
local function showPage(name)
	for n, pg in pairs(pages) do pg.Visible = (n == name) end
	currentPage = name
end

local function goHome()
	setSize(320, 620, true)
	showPage("home")
end
local function goBrowser()
	setSize(320, 620, true)
	showPage("browser")
	startPage.Visible = true errorPage.Visible = false
	addr.Text = ""
end
openBank = function()
	setSize(940, 540, true)     -- flip to "1080p" landscape
	showPage("bank")
	refresh()
	refreshRecipients()
	renderBank()
	showBankPage("Overview")
	for n, nb in pairs(navButtons) do
		local on = (n == "Overview")
		nb.BackgroundColor3 = PINK nb.BackgroundTransparency = on and 0 or 1 nb.TextColor3 = on and TEXT or SUB
	end
end
signOut.MouseButton1Click:Connect(goBrowser)

-- build nav (order) — DOE nav already created & hidden; move it before Sign Out visually is fine
-- (navHolder uses list layout; recreate order by re-parenting: create standard ones first then DOE at end)
-- Standard nav buttons:
local navOverview = makeNav("⌂", "Overview")
local navSend     = makeNav("➤", "Send Money")
local navSavings  = makeNav("💰", "Savings")
local navStocks   = makeNav("📈", "Stocks")
local navTx       = makeNav("🧾", "Transactions")
-- keep DOE nav last
doeNav.Parent = nil doeNav.Parent = navHolder
-- fix layout order (list layout uses creation order; set LayoutOrder)
navOverview.LayoutOrder = 1
navSend.LayoutOrder = 2
navSavings.LayoutOrder = 3
navStocks.LayoutOrder = 4
navTx.LayoutOrder = 5
doeNav.LayoutOrder = 6
navHolder:FindFirstChildOfClass("UIListLayout").SortOrder = Enum.SortOrder.LayoutOrder

-- home apps
makeApp("🌐", "Browser", Color3.fromRGB(60, 120, 235), goBrowser)
makeApp("💬", "Messages", Color3.fromRGB(90, 200, 120), function() toast("Messages: no signal.") end)
makeApp("📷", "Camera", Color3.fromRGB(120, 90, 220), function() toast("Camera app coming soon.") end)
makeApp("🎵", "Music", Color3.fromRGB(235, 90, 140), function() toast("Music: nothing playing.") end)
makeApp("⚙", "Settings", Color3.fromRGB(90, 95, 110), function() toast("NovalOS v1.0 · all systems nominal.") end)
makeApp("🏦", "Bank", Color3.fromRGB(236, 64, 170), openBank)

-- browser bookmarks
makeBookmark("🏦", "Little World Bank", "banking · send money · invest", PINK, openBank)
makeBookmark("🏛", "Department of Economy", "global economy portal", PURPLE, function()
	openBank()
	if state.snap and state.snap.isDOE then
		showBankPage("Dept. of Economy")
	else
		toast("Access restricted to authorized personnel.")
	end
end)

homeBtn.MouseButton1Click:Connect(goHome)

-- ============================================================
-- SHOW/HIDE with the NovalOS Tool
-- ============================================================
local inited = false
local function setShown(v)
	if v and not inited then
		cx, cy = camera.ViewportSize.X / 2, camera.ViewportSize.Y / 2
		goHome()
		clampCenter()
		inited = true
	end
	gui.Enabled = v
	if v then
		phone.Size = UDim2.fromOffset(targetW * 0.92, targetH * 0.92)
		applyScale()
		TweenService:Create(phone, EASE_POP, { Size = UDim2.fromOffset(targetW, targetH) }):Play()
	end
end

powerBtn.MouseButton1Click:Connect(function() setShown(false) end)

local function watchChar(char)
	local function isHeld()
		local t = char:FindFirstChild("NovalOS")
		return t and t:IsA("Tool")
	end
	char.ChildAdded:Connect(function(c)
		if c:IsA("Tool") and c.Name == "NovalOS" then setShown(true) end
	end)
	char.ChildRemoved:Connect(function(c)
		if c:IsA("Tool") and c.Name == "NovalOS" then setShown(false) end
	end)
	if isHeld() then setShown(true) end
end
if player.Character then watchChar(player.Character) end
player.CharacterAdded:Connect(watchChar)
