-- ============================================================
-- 2018-Style Custom Chat + Player List  (LocalScript)
-- Place in: StarterPlayer > StarterPlayerScripts
--
-- SETUP REQUIRED:
--   1. TextChatService.ChatVersion = TextChatService
--   2. TextChatService.CreateDefaultTextChannels = true
--   3. ReplicatedStorage > RemoteEvent named "ChatStyleEvent"
--   4. The matching ServerScript (Chat Style Relay) in ServerScriptService
--
-- THIS VERSION (v8):
--   - FIXED broken overhead bubble (was showing bare diamond + loose text);
--     now a proper rounded 2018-style bubble that wraps text, with fade-out
--   - Rainbow name REMOVED
--   - 20 fonts total (added 10 more) with live previews
--   - "Reset to default" button in Chat Options
--   - Note: Roblox's core menu (ESC / topbar) CANNOT be fully removed.
--   - Player list is its OWN panel, top-right (where Roblox's was)
--   - Premium badge = classic "BC" Builders Club diamond
--   - Dev badge = matching shield
--   - 2018-style chat bubbles above heads (Roblox bubble system, styled)
--   - Options menu + style settings (color / font preview / text size)
-- ============================================================

local Players            = game:GetService("Players")
local TextChatService    = game:GetService("TextChatService")
local UserInputService   = game:GetService("UserInputService")
local ReplicatedStorage  = game:GetService("ReplicatedStorage")
local StarterGui         = game:GetService("StarterGui")

local player    = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local styleEvent = ReplicatedStorage:WaitForChild("ChatStyleEvent")

-- ===== Disable default chat window + player list, KEEP bubbles =====
TextChatService.ChatWindowConfiguration.Enabled = false
TextChatService.ChatInputBarConfiguration.Enabled = false
pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Chat, false)
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)
end)

-- Roblox's built-in bubbles are DISABLED — we draw our own custom bubbles
-- (BillboardGui above heads) further down, styled to match the chat window.
local bubbleCfg = TextChatService:FindFirstChildOfClass("BubbleChatConfiguration")
if bubbleCfg then
	bubbleCfg.Enabled = false
end

local channels = TextChatService:WaitForChild("TextChannels")
local generalChannel = channels:WaitForChild("RBXGeneral")

-- Safety net: make sure THIS player is actually a member of the channel.
-- If CreateDefaultTextChannels didn't add us, messages from others never arrive.
task.spawn(function()
	local mySource = generalChannel:FindFirstChild(tostring(player.UserId))
	if not mySource then
		local ok = pcall(function()
			generalChannel:AddUserAsync(player.UserId)
		end)
		warn("[Chat] Had to manually add self to RBXGeneral. Added ok =", ok)
	end
	print("[Chat] Joined channel:", generalChannel.Name)
end)

-- ============================================================
-- CONFIG
-- ============================================================
local MIN_SIZE = 18
local MAX_SIZE = 36
local FONTS = {
	"SourceSans", "SourceSansBold", "Gotham", "GothamBold",
	"Arcade", "Cartoon", "Fantasy", "Antique", "Michroma", "Highway",
	-- 10 more (all real Roblox fonts):
	"SourceSansLight", "SourceSansItalic", "SourceSansSemibold", "GothamMedium",
	"GothamBlack", "Bangers", "Creepster", "DenkOne", "FredokaOne", "IndieFlower",
}

local CUSTOM_TAGS = {
	["JunkoProblem"] = { text = "Princess", color = "rgb(255,221,0)" },
	["D2Here4game"]  = { text = "DEV",      color = "rgb(85,170,255)" },
}

local PLAYER_ROLES = {
	["JunkoProblem"] = { premium = true, dev = false, tag = "Princess", tagColor = Color3.fromRGB(255,221,0) },
	["D2Here4game"]  = { premium = true, dev = true,  tag = "DEV",      tagColor = Color3.fromRGB(85,170,255) },
	["Killer86668"]  = { premium = true, dev = false,  tag = "ADMIN",      tagColor = Color3.fromRGB(13, 255, 0) },
}

-- ============================================================
-- STATE
-- ============================================================
local myTextSize   = MIN_SIZE
local myColor      = Color3.fromRGB(255, 255, 255)
local myFont       = "SourceSans"
local playerStyles = {}
local showTimestamps = false
local lastMessageText = ""

-- ============================================================
-- BADGES (drawn from frames — no emoji/images)
-- ============================================================
-- Classic "BC" Builders Club diamond
local function makePremiumBadge(parent)
	local holder = Instance.new("Frame")
	holder.Size = UDim2.new(0, 18, 0, 18)
	holder.BackgroundTransparency = 1
	holder.Parent = parent

	local diamond = Instance.new("Frame")
	diamond.Size = UDim2.new(0, 13, 0, 13)
	diamond.Position = UDim2.new(0.5, 0, 0.5, 0)
	diamond.AnchorPoint = Vector2.new(0.5, 0.5)
	diamond.Rotation = 45
	diamond.BackgroundColor3 = Color3.fromRGB(0, 90, 170)  -- BC blue
	diamond.BorderSizePixel = 1
	diamond.BorderColor3 = Color3.fromRGB(255, 255, 255)
	diamond.Parent = holder

	local bc = Instance.new("TextLabel")
	bc.Size = UDim2.new(1, 0, 1, 0)
	bc.BackgroundTransparency = 1
	bc.Text = "BC"
	bc.TextColor3 = Color3.fromRGB(255, 255, 255)
	bc.Font = Enum.Font.SourceSansBold
	bc.TextSize = 10
	bc.ZIndex = 3
	bc.Parent = holder
	return holder
end

-- Dev shield (matching set)
local function makeDevBadge(parent)
	local b = Instance.new("Frame")
	b.Size = UDim2.new(0, 16, 0, 16)
	b.BackgroundColor3 = Color3.fromRGB(45, 110, 220)
	b.BorderSizePixel = 0
	b.Parent = parent
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 3)
	corner.Parent = b
	local point = Instance.new("Frame")
	point.Size = UDim2.new(0, 11, 0, 11)
	point.Position = UDim2.new(0.5, -5.5, 1, -8)
	point.BackgroundColor3 = Color3.fromRGB(45, 110, 220)
	point.BorderSizePixel = 0
	point.Rotation = 45
	point.Parent = b
	local d = Instance.new("TextLabel")
	d.Size = UDim2.new(1, 0, 1, 0)
	d.BackgroundTransparency = 1
	d.Text = "D"
	d.TextColor3 = Color3.fromRGB(255, 255, 255)
	d.Font = Enum.Font.SourceSansBold
	d.TextSize = 11
	d.ZIndex = 3
	d.Parent = b
	return b
end

-- ============================================================
-- CHAT WINDOW (bottom-left)
-- ============================================================
local gui = Instance.new("ScreenGui")
gui.Name = "ClassicChat"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = playerGui

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 400, 0, 200)
frame.Position = UDim2.new(0, 10, 0, 10)  -- top-left
frame.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
frame.BackgroundTransparency = 0.6
frame.BorderSizePixel = 1
frame.BorderColor3 = Color3.fromRGB(27, 42, 53)
frame.Parent = gui

local scroll = Instance.new("ScrollingFrame")
scroll.Size = UDim2.new(1, -8, 1, -36)
scroll.Position = UDim2.new(0, 4, 0, 4)
scroll.BackgroundTransparency = 1
scroll.BorderSizePixel = 0
scroll.ScrollBarThickness = 6
scroll.ScrollBarImageColor3 = Color3.fromRGB(150, 150, 150)
scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.Parent = frame

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 2)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = scroll

local input = Instance.new("TextBox")
input.Size = UDim2.new(1, -8, 0, 24)
input.Position = UDim2.new(0, 4, 1, -28)
input.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
input.BackgroundTransparency = 0.4
input.BorderSizePixel = 1
input.BorderColor3 = Color3.fromRGB(27, 42, 53)
input.Font = Enum.Font.SourceSans
input.TextSize = 18
input.TextColor3 = Color3.fromRGB(255, 255, 255)
input.PlaceholderText = "To chat click here or press \"/\" key"
input.PlaceholderColor3 = Color3.fromRGB(200, 200, 200)
input.Text = ""
input.TextXAlignment = Enum.TextXAlignment.Left
input.ClearTextOnFocus = false
input.Parent = frame

local inputPad = Instance.new("UIPadding")
inputPad.PaddingLeft = UDim.new(0, 6)
inputPad.Parent = input

-- Resize handle
local resizeHandle = Instance.new("TextButton")
resizeHandle.Size = UDim2.new(0, 14, 0, 14)
resizeHandle.Position = UDim2.new(1, -14, 1, -14)
resizeHandle.BackgroundColor3 = Color3.fromRGB(27, 42, 53)
resizeHandle.BackgroundTransparency = 0.3
resizeHandle.BorderSizePixel = 0
resizeHandle.Text = "\u{25E2}"
resizeHandle.TextColor3 = Color3.fromRGB(200, 200, 200)
resizeHandle.TextSize = 12
resizeHandle.Font = Enum.Font.SourceSans
resizeHandle.AutoButtonColor = false
resizeHandle.ZIndex = 5
resizeHandle.Parent = frame

local dragging, dragStart, startSize = false, nil, nil
local MIN_W, MIN_H = 200, 100
resizeHandle.InputBegan:Connect(function(io)
	if io.UserInputType == Enum.UserInputType.MouseButton1 or io.UserInputType == Enum.UserInputType.Touch then
		dragging = true; dragStart = io.Position; startSize = frame.AbsoluteSize
	end
end)
UserInputService.InputChanged:Connect(function(io)
	if dragging and (io.UserInputType == Enum.UserInputType.MouseMovement or io.UserInputType == Enum.UserInputType.Touch) then
		local d = io.Position - dragStart
		frame.Size = UDim2.new(0, math.max(MIN_W, startSize.X + d.X), 0, math.max(MIN_H, startSize.Y + d.Y))
	end
end)
UserInputService.InputEnded:Connect(function(io)
	if io.UserInputType == Enum.UserInputType.MouseButton1 or io.UserInputType == Enum.UserInputType.Touch then
		dragging = false
	end
end)

-- ============================================================
-- PLAYER LIST PANEL (top-right — where Roblox's was)
-- ============================================================
local listFrame = Instance.new("Frame")
listFrame.Size = UDim2.new(0, 200, 0, 260)
listFrame.Position = UDim2.new(1, -210, 0, 10)  -- top-right
listFrame.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
listFrame.BackgroundTransparency = 0.6
listFrame.BorderSizePixel = 1
listFrame.BorderColor3 = Color3.fromRGB(27, 42, 53)
listFrame.Parent = gui

local listHeader = Instance.new("TextLabel")
listHeader.Size = UDim2.new(1, 0, 0, 22)
listHeader.BackgroundColor3 = Color3.fromRGB(27, 42, 53)
listHeader.BackgroundTransparency = 0.2
listHeader.BorderSizePixel = 0
listHeader.Text = "Players"
listHeader.TextColor3 = Color3.fromRGB(255, 255, 255)
listHeader.Font = Enum.Font.SourceSansBold
listHeader.TextSize = 15
listHeader.Parent = listFrame

local playerScroll = Instance.new("ScrollingFrame")
playerScroll.Size = UDim2.new(1, -8, 1, -30)
playerScroll.Position = UDim2.new(0, 4, 0, 26)
playerScroll.BackgroundTransparency = 1
playerScroll.BorderSizePixel = 0
playerScroll.ScrollBarThickness = 6
playerScroll.CanvasSize = UDim2.new(0, 0, 0, 0)
playerScroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
playerScroll.Parent = listFrame

local playerListLayout = Instance.new("UIListLayout")
playerListLayout.Padding = UDim.new(0, 2)
playerListLayout.Parent = playerScroll

-- ============================================================
-- OPTIONS MENU (on chat window)
-- ============================================================
local menuButton = Instance.new("TextButton")
menuButton.Size = UDim2.new(0, 90, 0, 22)          -- wider for the label
menuButton.Position = UDim2.new(1, -94, 0, 4)
menuButton.BackgroundColor3 = Color3.fromRGB(27, 42, 53)
menuButton.BackgroundTransparency = 0.3
menuButton.BorderSizePixel = 0
menuButton.Text = "Chat Options"
menuButton.TextColor3 = Color3.fromRGB(255, 255, 255)
menuButton.TextSize = 14
menuButton.Font = Enum.Font.SourceSansBold
menuButton.ZIndex = 6
menuButton.Parent = frame

local menu = Instance.new("Frame")
menu.Size = UDim2.new(0, 150, 0, 0)
menu.AutomaticSize = Enum.AutomaticSize.Y
menu.Position = UDim2.new(1, -150, 0, 28)
menu.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
menu.BackgroundTransparency = 0.15
menu.BorderSizePixel = 1
menu.BorderColor3 = Color3.fromRGB(27, 42, 53)
menu.Visible = false
menu.ZIndex = 9
menu.Parent = frame

local menuLayout = Instance.new("UIListLayout")
menuLayout.SortOrder = Enum.SortOrder.LayoutOrder
menuLayout.Parent = menu

local function makeMenuItem(label, callback)
	local btn = Instance.new("TextButton")
	btn.Size = UDim2.new(1, 0, 0, 26)
	btn.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	btn.BackgroundTransparency = 1
	btn.BorderSizePixel = 0
	btn.Text = "  " .. label
	btn.TextXAlignment = Enum.TextXAlignment.Left
	btn.TextColor3 = Color3.fromRGB(255, 255, 255)
	btn.TextSize = 15
	btn.Font = Enum.Font.SourceSans
	btn.ZIndex = 10
	btn.Parent = menu
	btn.MouseEnter:Connect(function() btn.BackgroundTransparency = 0.7 end)
	btn.MouseLeave:Connect(function() btn.BackgroundTransparency = 1 end)
	btn.MouseButton1Click:Connect(function()
		callback()
		menu.Visible = false
	end)
	return btn
end

-- ============================================================
-- SETTINGS PANEL
-- ============================================================
local panel = Instance.new("Frame")
panel.Size = UDim2.new(0, 240, 0, 356)
panel.Position = UDim2.new(0, 420, 0, 10)  -- top, just right of the chat window
panel.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
panel.BackgroundTransparency = 0.15
panel.BorderSizePixel = 1
panel.BorderColor3 = Color3.fromRGB(27, 42, 53)
panel.Visible = false
panel.ZIndex = 12
panel.Parent = gui

local pTitle = Instance.new("TextLabel")
pTitle.Size = UDim2.new(1, 0, 0, 24)
pTitle.BackgroundColor3 = Color3.fromRGB(27, 42, 53)
pTitle.BorderSizePixel = 0
pTitle.Text = "Chat Settings"
pTitle.TextColor3 = Color3.fromRGB(255, 255, 255)
pTitle.Font = Enum.Font.SourceSansBold
pTitle.TextSize = 16
pTitle.ZIndex = 13
pTitle.Parent = panel

-- Close (X) button for the settings panel
local closeBtn = Instance.new("TextButton")
closeBtn.Size = UDim2.new(0, 22, 0, 22)
closeBtn.Position = UDim2.new(1, -24, 0, 1)
closeBtn.BackgroundColor3 = Color3.fromRGB(150, 40, 40)
closeBtn.BackgroundTransparency = 0.2
closeBtn.BorderSizePixel = 0
closeBtn.Text = "X"
closeBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
closeBtn.Font = Enum.Font.SourceSansBold
closeBtn.TextSize = 16
closeBtn.ZIndex = 14
closeBtn.Parent = panel
closeBtn.MouseButton1Click:Connect(function()
	panel.Visible = false
end)

local sizeLabel = Instance.new("TextLabel")
sizeLabel.Size = UDim2.new(1, -10, 0, 20)
sizeLabel.Position = UDim2.new(0, 5, 0, 30)
sizeLabel.BackgroundTransparency = 1
sizeLabel.Text = "Text size (your view): " .. myTextSize
sizeLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
sizeLabel.TextXAlignment = Enum.TextXAlignment.Left
sizeLabel.Font = Enum.Font.SourceSans
sizeLabel.TextSize = 14
sizeLabel.ZIndex = 13
sizeLabel.Parent = panel

local function sizeBtn(txt, xOff, delta)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(0, 26, 0, 20)
	b.Position = UDim2.new(0, xOff, 0, 52)
	b.BackgroundColor3 = Color3.fromRGB(27, 42, 53)
	b.BorderSizePixel = 0
	b.Text = txt
	b.TextColor3 = Color3.fromRGB(255, 255, 255)
	b.Font = Enum.Font.SourceSansBold
	b.TextSize = 16
	b.ZIndex = 13
	b.Parent = panel
	b.MouseButton1Click:Connect(function()
		myTextSize = math.clamp(myTextSize + delta, MIN_SIZE, MAX_SIZE)
		sizeLabel.Text = "Text size (your view): " .. myTextSize
	end)
end
sizeBtn("-", 5, -2)
sizeBtn("+", 35, 2)

local colorLabel = Instance.new("TextLabel")
colorLabel.Size = UDim2.new(1, -10, 0, 20)
colorLabel.Position = UDim2.new(0, 5, 0, 80)
colorLabel.BackgroundTransparency = 1
colorLabel.Text = "Name/message color (R,G,B):"
colorLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
colorLabel.TextXAlignment = Enum.TextXAlignment.Left
colorLabel.Font = Enum.Font.SourceSans
colorLabel.TextSize = 14
colorLabel.ZIndex = 13
colorLabel.Parent = panel

local rgbBoxes = {}
local function rgbBox(xOff, default)
	local box = Instance.new("TextBox")
	box.Size = UDim2.new(0, 50, 0, 22)
	box.Position = UDim2.new(0, xOff, 0, 102)
	box.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
	box.BorderColor3 = Color3.fromRGB(27, 42, 53)
	box.Text = tostring(default)
	box.TextColor3 = Color3.fromRGB(255, 255, 255)
	box.Font = Enum.Font.SourceSans
	box.TextSize = 14
	box.ZIndex = 13
	box.Parent = panel
	return box
end
rgbBoxes.r = rgbBox(5, 255)
rgbBoxes.g = rgbBox(60, 255)
rgbBoxes.b = rgbBox(115, 255)

local colorPreview = Instance.new("Frame")
colorPreview.Size = UDim2.new(0, 22, 0, 22)
colorPreview.Position = UDim2.new(0, 175, 0, 102)
colorPreview.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
colorPreview.BorderSizePixel = 0
colorPreview.ZIndex = 13
colorPreview.Parent = panel

local function readColor()
	local r = math.clamp(tonumber(rgbBoxes.r.Text) or 255, 0, 255)
	local g = math.clamp(tonumber(rgbBoxes.g.Text) or 255, 0, 255)
	local b = math.clamp(tonumber(rgbBoxes.b.Text) or 255, 0, 255)
	myColor = Color3.fromRGB(r, g, b)
	colorPreview.BackgroundColor3 = myColor
	return r, g, b
end
for _, box in pairs(rgbBoxes) do
	box.FocusLost:Connect(readColor)
end

local fontLabel = Instance.new("TextLabel")
fontLabel.Size = UDim2.new(1, -10, 0, 20)
fontLabel.Position = UDim2.new(0, 5, 0, 132)
fontLabel.BackgroundTransparency = 1
fontLabel.Text = "Font (click to preview & pick):"
fontLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
fontLabel.TextXAlignment = Enum.TextXAlignment.Left
fontLabel.Font = Enum.Font.SourceSans
fontLabel.TextSize = 14
fontLabel.ZIndex = 13
fontLabel.Parent = panel

local fontScroll = Instance.new("ScrollingFrame")
fontScroll.Size = UDim2.new(1, -10, 0, 110)
fontScroll.Position = UDim2.new(0, 5, 0, 154)
fontScroll.BackgroundColor3 = Color3.fromRGB(15, 15, 15)
fontScroll.BorderColor3 = Color3.fromRGB(27, 42, 53)
fontScroll.ScrollBarThickness = 5
fontScroll.CanvasSize = UDim2.new(0, 0, 0, 0)
fontScroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
fontScroll.ZIndex = 13
fontScroll.Parent = panel

local fontListLayout = Instance.new("UIListLayout")
fontListLayout.Parent = fontScroll

local selectedFontLabel
for _, fontName in ipairs(FONTS) do
	local fb = Instance.new("TextButton")
	fb.Size = UDim2.new(1, 0, 0, 26)
	fb.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	fb.BackgroundTransparency = 1
	fb.BorderSizePixel = 0
	fb.Text = fontName .. " - Preview 123"
	fb.Font = Enum.Font[fontName] or Enum.Font.SourceSans
	fb.TextColor3 = Color3.fromRGB(255, 255, 255)
	fb.TextSize = 16
	fb.TextXAlignment = Enum.TextXAlignment.Left
	fb.ZIndex = 14
	fb.Parent = fontScroll
	fb.MouseButton1Click:Connect(function()
		myFont = fontName
		if selectedFontLabel then selectedFontLabel.BackgroundTransparency = 1 end
		fb.BackgroundColor3 = Color3.fromRGB(27, 42, 53)
		fb.BackgroundTransparency = 0.3
		selectedFontLabel = fb
	end)
end

-- ===== APPLY + RESET buttons =====
local applyBtn = Instance.new("TextButton")
applyBtn.Size = UDim2.new(1, -10, 0, 30)
applyBtn.Position = UDim2.new(0, 5, 0, 278)
applyBtn.BackgroundColor3 = Color3.fromRGB(40, 120, 60)
applyBtn.BorderSizePixel = 0
applyBtn.Text = "Apply (visible to everyone)"
applyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
applyBtn.Font = Enum.Font.SourceSansBold
applyBtn.TextSize = 15
applyBtn.ZIndex = 13
applyBtn.Parent = panel

applyBtn.MouseButton1Click:Connect(function()
	local r, g, b = readColor()
	styleEvent:FireServer(string.format("%d,%d,%d", r, g, b), myFont)
end)

local resetBtn = Instance.new("TextButton")
resetBtn.Size = UDim2.new(1, -10, 0, 26)
resetBtn.Position = UDim2.new(0, 5, 0, 314)
resetBtn.BackgroundColor3 = Color3.fromRGB(90, 90, 90)
resetBtn.BorderSizePixel = 0
resetBtn.Text = "Reset to default"
resetBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
resetBtn.Font = Enum.Font.SourceSansBold
resetBtn.TextSize = 14
resetBtn.ZIndex = 13
resetBtn.Parent = panel

resetBtn.MouseButton1Click:Connect(function()
	-- reset local choices
	myTextSize = MIN_SIZE
	myColor = Color3.fromRGB(255, 255, 255)
	myFont = "SourceSans"
	sizeLabel.Text = "Text size (your view): " .. myTextSize
	rgbBoxes.r.Text = "255"
	rgbBoxes.g.Text = "255"
	rgbBoxes.b.Text = "255"
	colorPreview.BackgroundColor3 = myColor
	if selectedFontLabel then
		selectedFontLabel.BackgroundTransparency = 1
		selectedFontLabel = nil
	end
	-- broadcast the reset so everyone sees default again
	styleEvent:FireServer("255,255,255", "SourceSans")
end)

-- Menu commands
menuButton.MouseButton1Click:Connect(function()
	menu.Visible = not menu.Visible
end)
makeMenuItem("Clear chat", function()
	for _, c in ipairs(scroll:GetChildren()) do
		if c:IsA("TextLabel") then c:Destroy() end
	end
end)
makeMenuItem("Toggle timestamps", function()
	showTimestamps = not showTimestamps
end)
makeMenuItem("Copy last message", function()
	if lastMessageText ~= "" then
		pcall(function() setclipboard(lastMessageText) end)
	end
end)
makeMenuItem("Size: Small", function()
	frame.Size = UDim2.new(0, 300, 0, 150)
end)
makeMenuItem("Size: Large", function()
	frame.Size = UDim2.new(0, 500, 0, 300)
end)
makeMenuItem("Toggle background", function()
	frame.BackgroundTransparency = (frame.BackgroundTransparency > 0.4) and 0.1 or 0.6
end)
makeMenuItem("Chat settings...", function()
	if not panel.Visible then
		-- always reopen next to the chat window, at the top
		panel.Position = UDim2.new(0, frame.AbsolutePosition.X + frame.AbsoluteSize.X + 10, 0, frame.AbsolutePosition.Y)
	end
	panel.Visible = not panel.Visible
end)

-- ============================================================
-- STYLE BROADCASTS
-- ============================================================
styleEvent.OnClientEvent:Connect(function(userId, colorStr, font)
	local r, g, b = string.match(colorStr, "^(%d+),(%d+),(%d+)$")
	if r then
		playerStyles[userId] = {
			color = Color3.fromRGB(tonumber(r), tonumber(g), tonumber(b)),
			font = font,
		}
	end
end)

-- ============================================================
-- CHAT DISPLAY
-- ============================================================
local function toRgbTag(c)
	return string.format("rgb(%d,%d,%d)", math.floor(c.R*255+0.5), math.floor(c.G*255+0.5), math.floor(c.B*255+0.5))
end

local function addMessage(text, senderUserId, senderName, displayName)
	local style = senderUserId and playerStyles[senderUserId]
	local color    = style and style.color or Color3.fromRGB(255, 255, 255)
	local fontName = style and style.font  or "SourceSans"

	local prefix = ""
	if showTimestamps then
		prefix = string.format('<font color="rgb(160,160,160)">[%s] </font>', os.date("%H:%M"))
	end

	local tagPrefix = ""
	if senderName and CUSTOM_TAGS[senderName] then
		local t = CUSTOM_TAGS[senderName]
		tagPrefix = string.format('<font color="%s">[%s]</font> ', t.color, t.text)
	end

	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, -6, 0, 0)
	label.AutomaticSize = Enum.AutomaticSize.Y
	label.BackgroundTransparency = 1
	label.Font = Enum.Font[fontName] or Enum.Font.SourceSans
	label.TextSize = myTextSize
	label.TextColor3 = Color3.fromRGB(255, 255, 255)
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextYAlignment = Enum.TextYAlignment.Top
	label.TextWrapped = true
	label.RichText = true
	if senderName then
		label.Text = string.format('%s%s<font color="%s">[%s]:</font> %s',
			prefix, tagPrefix, toRgbTag(color), displayName, text)
	else
		label.Text = prefix .. text
	end
	label.LayoutOrder = #scroll:GetChildren()
	label.Parent = scroll

	lastMessageText = text
	task.wait()
	scroll.CanvasPosition = Vector2.new(0, scroll.AbsoluteCanvasSize.Y)
end

-- ============================================================
-- CUSTOM OVERHEAD BUBBLES (BillboardGui — fully ours, not Roblox's)
-- ============================================================
local BUBBLE_DURATION = 8      -- seconds a bubble stays up
local BUBBLE_MAX      = 3      -- max stacked bubbles per player

-- Show a custom bubble above a player's character head
local function showBubble(plr, text, bubbleColor)
	bubbleColor = bubbleColor or Color3.fromRGB(30, 30, 30)
	local char = plr.Character
	if not char then return end
	local head = char:FindFirstChild("Head")
	if not head then return end

	-- Container BillboardGui (one per head, reused)
	local billboard = head:FindFirstChild("CustomBubbles")
	if not billboard then
		billboard = Instance.new("BillboardGui")
		billboard.Name = "CustomBubbles"
		billboard.Size = UDim2.new(0, 220, 0, 120)
		billboard.StudsOffset = Vector3.new(0, 3, 0)
		billboard.AlwaysOnTop = true
		billboard.MaxDistance = 100
		billboard.Parent = head

		local stack = Instance.new("UIListLayout")
		stack.HorizontalAlignment = Enum.HorizontalAlignment.Center
		stack.VerticalAlignment = Enum.VerticalAlignment.Bottom
		stack.Padding = UDim.new(0, 4)
		stack.SortOrder = Enum.SortOrder.LayoutOrder
		stack.Parent = billboard
	end

	-- Trim oldest bubbles if too many
	local existing = {}
	for _, c in ipairs(billboard:GetChildren()) do
		if c:IsA("Frame") then table.insert(existing, c) end
	end
	while #existing >= BUBBLE_MAX do
		local oldest = table.remove(existing, 1)
		if oldest then oldest:Destroy() end
	end

	-- Bubble body: auto-sizes to fit the text (X and Y), so it never collapses
	local bubble = Instance.new("Frame")
	bubble.AutomaticSize = Enum.AutomaticSize.XY
	bubble.Size = UDim2.new(0, 0, 0, 0)
	bubble.BackgroundColor3 = Color3.fromRGB(250, 250, 250)
	bubble.BorderSizePixel = 0
	bubble.LayoutOrder = math.floor(os.clock() * 1000)
	bubble.Parent = billboard

	local bCorner = Instance.new("UICorner")
	bCorner.CornerRadius = UDim.new(0, 12)
	bCorner.Parent = bubble

	-- constrain max width so long messages wrap instead of stretching
	local sizeConstraint = Instance.new("UISizeConstraint")
	sizeConstraint.MaxSize = Vector2.new(210, math.huge)
	sizeConstraint.Parent = bubble

	local bPad = Instance.new("UIPadding")
	bPad.PaddingLeft = UDim.new(0, 12)
	bPad.PaddingRight = UDim.new(0, 12)
	bPad.PaddingTop = UDim.new(0, 6)
	bPad.PaddingBottom = UDim.new(0, 6)
	bPad.Parent = bubble

	local msg = Instance.new("TextLabel")
	msg.AutomaticSize = Enum.AutomaticSize.XY
	msg.Size = UDim2.new(0, 0, 0, 0)
	msg.BackgroundTransparency = 1
	msg.Font = Enum.Font.SourceSansSemibold
	msg.TextSize = 17
	msg.TextColor3 = bubbleColor
	msg.TextWrapped = true
	msg.RichText = true
	msg.Text = text
	msg.Parent = bubble

	-- Tail: a small triangle-ish square under the bubble, BEHIND it (lower ZIndex)
	local tail = Instance.new("Frame")
	tail.Size = UDim2.new(0, 12, 0, 12)
	tail.Rotation = 45
	tail.BackgroundColor3 = Color3.fromRGB(250, 250, 250)
	tail.BorderSizePixel = 0
	tail.AnchorPoint = Vector2.new(0.5, 0.5)
	tail.Position = UDim2.new(0.5, 0, 1, -2)
	tail.ZIndex = 0
	tail.Parent = bubble

	-- fade out then remove
	task.delay(BUBBLE_DURATION, function()
		if bubble and bubble.Parent then
			for _, obj in ipairs({bubble, msg, tail}) do
				pcall(function()
					if obj:IsA("TextLabel") then
						game:GetService("TweenService"):Create(obj, TweenInfo.new(0.4), {TextTransparency = 1}):Play()
					else
						game:GetService("TweenService"):Create(obj, TweenInfo.new(0.4), {BackgroundTransparency = 1}):Play()
					end
				end)
			end
			task.wait(0.4)
			if bubble then bubble:Destroy() end
		end
	end)
end

-- Use MessageReceived (an EVENT) instead of OnIncomingMessage (a callback
-- that REQUIRES returning a TextChatMessageProperties instance). The event
-- has no return contract, so rendering here can never break message delivery.
generalChannel.MessageReceived:Connect(function(message)
	local ok, err = pcall(function()
		local displayName, userName, userId = "Player", "", nil
		local senderPlr = nil
		if message.TextSource then
			userId = message.TextSource.UserId
			senderPlr = Players:GetPlayerByUserId(userId)
			if senderPlr then
				userName = senderPlr.Name
				displayName = senderPlr.DisplayName
			end
			addMessage(message.Text, userId, userName, displayName)
			-- custom overhead bubble, colored with the sender's chosen color
			if senderPlr then
				local style = playerStyles[userId]
				local roles = PLAYER_ROLES[userName]
				local bubbleColor = (style and style.color)
					or (roles and roles.tagColor)
					or Color3.fromRGB(20, 20, 20)
				showBubble(senderPlr, message.Text, bubbleColor)
			end
		else
			addMessage(message.Text, nil, nil, nil)
		end
	end)
	if not ok then
		warn("[Chat] render error:", err)
	end
end)

-- ============================================================
-- PLAYER LIST ROWS
-- ============================================================
local function makePlayerRow(plr)
	local row = Instance.new("Frame")
	row.Size = UDim2.new(1, -6, 0, 20)
	row.BackgroundTransparency = 1
	row.Name = plr.Name

	local roles = PLAYER_ROLES[plr.Name]
	local x = 0

	if roles and roles.premium then
		local pb = makePremiumBadge(row)
		pb.Position = UDim2.new(0, x + 1, 0.5, -9)
		x = x + 20
	end
	if roles and roles.dev then
		local db = makeDevBadge(row)
		db.Position = UDim2.new(0, x + 2, 0.5, -8)
		x = x + 20
	end
	if roles and roles.tag then
		local tagLbl = Instance.new("TextLabel")
		tagLbl.Size = UDim2.new(0, 0, 1, 0)
		tagLbl.AutomaticSize = Enum.AutomaticSize.X
		tagLbl.Position = UDim2.new(0, x + 4, 0, 0)
		tagLbl.BackgroundTransparency = 1
		tagLbl.Text = "[" .. roles.tag .. "]"
		tagLbl.TextColor3 = roles.tagColor
		tagLbl.Font = Enum.Font.SourceSansBold
		tagLbl.TextSize = 15
		tagLbl.TextXAlignment = Enum.TextXAlignment.Left
		tagLbl.Parent = row
		x = x + (#roles.tag * 8) + 16
	end

	local nameLbl = Instance.new("TextLabel")
	nameLbl.Size = UDim2.new(1, -(x + 6), 1, 0)
	nameLbl.Position = UDim2.new(0, x + 6, 0, 0)
	nameLbl.BackgroundTransparency = 1
	nameLbl.Text = plr.DisplayName
	nameLbl.TextColor3 = Color3.fromRGB(255, 255, 255)
	nameLbl.Font = Enum.Font.SourceSans
	nameLbl.TextSize = 16
	nameLbl.TextXAlignment = Enum.TextXAlignment.Left
	nameLbl.TextTruncate = Enum.TextTruncate.AtEnd
	nameLbl.Parent = row

	row.Parent = playerScroll
	return row
end

local function refreshPlayerList()
	for _, c in ipairs(playerScroll:GetChildren()) do
		if c:IsA("Frame") then c:Destroy() end
	end
	for _, plr in ipairs(Players:GetPlayers()) do
		makePlayerRow(plr)
	end
end

Players.PlayerAdded:Connect(refreshPlayerList)
Players.PlayerRemoving:Connect(function()
	task.wait(0.1)
	refreshPlayerList()
end)

-- ============================================================
-- SEND + HOTKEY
-- ============================================================
input.FocusLost:Connect(function(enterPressed)
	if enterPressed then
		local text = input.Text
		input.Text = ""
		if text ~= "" and text:gsub("%s", "") ~= "" then
			generalChannel:SendAsync(text)
		end
	end
end)

UserInputService.InputBegan:Connect(function(io, processed)
	if processed then return end
	if io.KeyCode == Enum.KeyCode.Slash then
		task.wait()
		input:CaptureFocus()
	end
end)

-- ============================================================
-- INIT
-- ============================================================
refreshPlayerList()
