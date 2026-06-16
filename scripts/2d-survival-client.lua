--[[
	2D Survival Game — Client  (StarterPlayerScripts)
	--------------------------------------------------
	Renders the 2D tile world inside a ScreenGui.
	Talks to the companion ServerScript via RemoteEvents.

	Controls:
	  WASD / Arrow Keys  — Move
	  G                  — Gather (chop tree / mine stone within 1 tile)
	  F                  — Attack (damage players within 1 tile, -20 HP)
	  Esc                — Hide/show game overlay

	Tiles:
	  Green  = Grass (walkable)
	  Dark   = Tree  (gather for wood)
	  Gray   = Stone (gather for stone)
	  Blue   = Water (impassable border)
	  Yellow = Food  (walk into to eat, +10 HP)

	You appear as a bright green dot; other players are red.
]]

local Players          = game:GetService("Players")
local UIS              = game:GetService("UserInputService")
local RunService       = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local me = Players.LocalPlayer

-- Wait for server to create events
local evFolder = ReplicatedStorage:WaitForChild("SurvivalEvents", 30)
if not evFolder then warn("[Survival] SurvivalEvents not found — is the Server script running?") return end

local WorldSync    = evFolder:WaitForChild("WorldSync", 10)
local PlayerAction = evFolder:WaitForChild("PlayerAction", 10)
if not WorldSync or not PlayerAction then warn("[Survival] RemoteEvents missing") return end

-- ── Constants ─────────────────────────────────────────────────────────────────

local TILE_PX  = 26   -- pixels per tile
local T = { GRASS=0, TREE=1, STONE=2, WATER=3, FOOD=4 }

local BG_COLOR = {
	[T.GRASS] = Color3.fromRGB( 85, 150,  65),
	[T.TREE]  = Color3.fromRGB( 28,  75,  28),
	[T.STONE] = Color3.fromRGB(110, 110, 115),
	[T.WATER] = Color3.fromRGB( 45, 100, 185),
	[T.FOOD]  = Color3.fromRGB(210, 160,  30),
}
local ICON = { [T.TREE]="T", [T.STONE]="S", [T.FOOD]="F", [T.WATER]="~" }

-- ── State ─────────────────────────────────────────────────────────────────────

local mapData    = {}
local allPlayers = {}
local mapW, mapH = 48, 32
local myState    = { x=1, y=1, health=100, wood=0, stone=0, food=0 }
local hidden     = false

-- ── Build GUI ─────────────────────────────────────────────────────────────────

local gui = Instance.new("ScreenGui")
gui.Name            = "SurvivalGame"
gui.ResetOnSpawn    = false
gui.ZIndexBehavior  = Enum.ZIndexBehavior.Sibling
gui.IgnoreGuiInset  = true
gui.Parent          = me.PlayerGui

local root = Instance.new("Frame")
root.Size                = UDim2.fromScale(1, 1)
root.BackgroundColor3    = Color3.fromRGB(10, 10, 18)
root.BorderSizePixel     = 0
root.Parent              = gui

-- Top bar
local topBar = Instance.new("Frame")
topBar.Size              = UDim2.new(1, 0, 0, 30)
topBar.BackgroundColor3  = Color3.fromRGB(18, 18, 35)
topBar.BorderSizePixel   = 0
topBar.Parent            = root

local topLabel = Instance.new("TextLabel")
topLabel.Size            = UDim2.fromScale(1, 1)
topLabel.BackgroundTransparency = 1
topLabel.TextColor3      = Color3.fromRGB(200, 200, 240)
topLabel.Text            = "⚔  2D SURVIVAL   WASD=Move   G=Gather   F=Attack   Esc=Hide"
topLabel.Font            = Enum.Font.Code
topLabel.TextSize        = 13
topLabel.Parent          = topBar

-- Viewport (tile world)
local vp = Instance.new("Frame")
vp.Name                  = "Viewport"
vp.Size                  = UDim2.new(1, -185, 1, -72)
vp.Position              = UDim2.new(0, 0, 0, 30)
vp.BackgroundColor3      = Color3.fromRGB(18, 28, 18)
vp.ClipsDescendants      = true
vp.BorderSizePixel       = 0
vp.Parent                = root

-- HUD sidebar
local hud = Instance.new("Frame")
hud.Size                 = UDim2.new(0, 180, 1, -72)
hud.Position             = UDim2.new(1, -183, 0, 30)
hud.BackgroundColor3     = Color3.fromRGB(16, 16, 32)
hud.BorderSizePixel      = 0
hud.Parent               = root

-- Status bar
local statusBar = Instance.new("TextLabel")
statusBar.Size           = UDim2.new(1, 0, 0, 38)
statusBar.Position       = UDim2.new(0, 0, 1, -38)
statusBar.BackgroundColor3 = Color3.fromRGB(8, 8, 16)
statusBar.TextColor3     = Color3.fromRGB(150, 200, 150)
statusBar.Text           = "Waiting for world..."
statusBar.Font           = Enum.Font.Code
statusBar.TextSize       = 12
statusBar.BorderSizePixel = 0
statusBar.Parent         = root

-- HUD helpers
local function hudLabel(y, text, color)
	local l = Instance.new("TextLabel")
	l.Size              = UDim2.new(1, -8, 0, 20)
	l.Position          = UDim2.new(0, 4, 0, y)
	l.BackgroundTransparency = 1
	l.TextColor3        = color or Color3.fromRGB(200, 200, 200)
	l.Text              = text
	l.Font              = Enum.Font.Code
	l.TextSize          = 13
	l.TextXAlignment    = Enum.TextXAlignment.Left
	l.Parent            = hud
	return l
end

local lYou    = hudLabel(6,   "── YOU ──",     Color3.fromRGB(160, 160, 255))
local lHp     = hudLabel(30,  "❤ HP: 100",    Color3.fromRGB(255, 110, 110))
local lWood   = hudLabel(54,  "Wood:  0",      Color3.fromRGB(190, 140,  80))
local lStone  = hudLabel(78,  "Stone: 0",      Color3.fromRGB(170, 170, 170))
local lFood   = hudLabel(102, "Food:  0",      Color3.fromRGB(230, 170,  40))
local lSep    = hudLabel(132, "── PLAYERS ──", Color3.fromRGB(160, 255, 160))

local pLabels = {}
for i = 1, 10 do
	pLabels[i] = hudLabel(148 + (i - 1) * 20, "", Color3.fromRGB(180, 220, 180))
end

-- ── Tile / dot pools ──────────────────────────────────────────────────────────

local tileCache = {}   -- [key] = {frame, label}
local dotCache  = {}   -- list of {container, dot, nameTag}
local activeDots = {}

local function makeTile()
	local f = Instance.new("Frame")
	f.Size           = UDim2.fromOffset(TILE_PX, TILE_PX)
	f.BorderSizePixel = 0
	f.Parent         = vp
	local lbl = Instance.new("TextLabel")
	lbl.Size              = UDim2.fromScale(1, 1)
	lbl.BackgroundTransparency = 1
	lbl.TextColor3        = Color3.fromRGB(255, 255, 255)
	lbl.Font              = Enum.Font.GothamBold
	lbl.TextSize          = TILE_PX - 6
	lbl.BorderSizePixel   = 0
	lbl.Parent            = f
	return { frame=f, label=lbl }
end

local function makeDot()
	local c = Instance.new("Frame")
	c.Size               = UDim2.fromOffset(TILE_PX, TILE_PX)
	c.BackgroundTransparency = 1
	c.ZIndex             = 10
	c.Parent             = vp

	local d = Instance.new("Frame")
	d.Size               = UDim2.fromOffset(TILE_PX - 4, TILE_PX - 4)
	d.Position           = UDim2.fromOffset(2, 2)
	d.BackgroundColor3   = Color3.fromRGB(100, 255, 100)
	d.BorderSizePixel    = 0
	d.ZIndex             = 10
	Instance.new("UICorner", d).CornerRadius = UDim.new(1, 0)
	d.Parent             = c

	local n = Instance.new("TextLabel")
	n.Size               = UDim2.new(4, 0, 0, 13)
	n.Position           = UDim2.new(-1.5, 0, -0.65, 0)
	n.BackgroundTransparency = 1
	n.TextColor3         = Color3.fromRGB(255, 255, 255)
	n.Font               = Enum.Font.GothamBold
	n.TextSize           = 11
	n.ZIndex             = 11
	n.Parent             = c

	return { container=c, dot=d, nameTag=n }
end

local function getDot()
	if #dotCache > 0 then
		local d = dotCache[#dotCache]
		dotCache[#dotCache] = nil
		d.container.Visible = true
		return d
	end
	return makeDot()
end

local function recycleDots()
	for _, d in ipairs(activeDots) do
		d.container.Visible = false
		dotCache[#dotCache + 1] = d
	end
	activeDots = {}
end

-- ── Render ────────────────────────────────────────────────────────────────────

local function render()
	if #mapData == 0 then return end

	local vpSize = vp.AbsoluteSize
	local colsV  = math.ceil(vpSize.X / TILE_PX) + 3
	local rowsV  = math.ceil(vpSize.Y / TILE_PX) + 3

	local camX = myState.x - math.floor(colsV / 2)
	local camY = myState.y - math.floor(rowsV / 2)

	-- Draw tiles
	for ry = 0, rowsV - 1 do
		for rx = 0, colsV - 1 do
			local wx = camX + rx
			local wy = camY + ry
			local key = ry * 100 + rx

			if wx >= 1 and wx <= mapW and wy >= 1 and wy <= mapH then
				local idx      = (wy - 1) * mapW + wx
				local tileType = mapData[idx] or T.GRASS

				local entry = tileCache[key]
				if not entry then
					entry = makeTile()
					tileCache[key] = entry
				end
				entry.frame.Visible          = true
				entry.frame.Position         = UDim2.fromOffset(rx * TILE_PX, ry * TILE_PX)
				entry.frame.BackgroundColor3 = BG_COLOR[tileType] or BG_COLOR[T.GRASS]
				entry.label.Text             = ICON[tileType] or ""
			else
				if tileCache[key] then tileCache[key].frame.Visible = false end
			end
		end
	end

	-- Draw player dots
	recycleDots()
	for _, pd in ipairs(allPlayers) do
		local sx = (pd.x - camX) * TILE_PX
		local sy = (pd.y - camY) * TILE_PX
		if sx >= -TILE_PX and sx < vpSize.X + TILE_PX
			and sy >= -TILE_PX and sy < vpSize.Y + TILE_PX then
			local dot = getDot()
			dot.container.Position = UDim2.fromOffset(sx, sy)
			local isMe = (pd.uid == me.UserId)
			dot.dot.BackgroundColor3 = isMe
				and Color3.fromRGB( 80, 255,  80)
				or  Color3.fromRGB(255,  80,  80)
			dot.nameTag.Text = pd.name
			dot.nameTag.TextColor3 = isMe
				and Color3.fromRGB(120, 255, 120)
				or  Color3.fromRGB(255, 160, 160)
			if isMe then
				myState.x      = pd.x
				myState.y      = pd.y
				myState.health = pd.health
				myState.wood   = pd.wood   or myState.wood
				myState.stone  = pd.stone  or myState.stone
				myState.food   = pd.food   or myState.food
			end
			activeDots[#activeDots + 1] = dot
		end
	end

	-- HUD
	lHp.Text    = ("❤ HP: %d"):format(myState.health)
	lWood.Text  = ("Wood:  %d"):format(myState.wood)
	lStone.Text = ("Stone: %d"):format(myState.stone)
	lFood.Text  = ("Food:  %d"):format(myState.food)

	for i = 1, #pLabels do pLabels[i].Text = "" end
	for i, pd in ipairs(allPlayers) do
		if pLabels[i] then
			local isMe = (pd.uid == me.UserId)
			pLabels[i].Text = (isMe and "▶ " or "  ") .. pd.name
				.. " " .. pd.health .. "hp"
			pLabels[i].TextColor3 = isMe
				and Color3.fromRGB( 80, 255,  80)
				or  Color3.fromRGB(190, 210, 190)
		end
	end

	statusBar.Text = ("Pos (%d,%d)   Players: %d   Wood: %d   Stone: %d"):format(
		myState.x, myState.y, #allPlayers, myState.wood, myState.stone
	)
end

-- ── Sync handler ──────────────────────────────────────────────────────────────

WorldSync.OnClientEvent:Connect(function(flat, players, w, h)
	mapData    = flat
	allPlayers = players
	if w then mapW = w end
	if h then mapH = h end
	render()
end)

-- ── Input ─────────────────────────────────────────────────────────────────────

local moveCD = 0

RunService.Heartbeat:Connect(function(dt)
	moveCD = moveCD - dt
	if moveCD > 0 then return end
	if hidden then return end

	local dir
	if UIS:IsKeyDown(Enum.KeyCode.W) or UIS:IsKeyDown(Enum.KeyCode.Up)    then dir = "up"
	elseif UIS:IsKeyDown(Enum.KeyCode.S) or UIS:IsKeyDown(Enum.KeyCode.Down)  then dir = "down"
	elseif UIS:IsKeyDown(Enum.KeyCode.A) or UIS:IsKeyDown(Enum.KeyCode.Left)  then dir = "left"
	elseif UIS:IsKeyDown(Enum.KeyCode.D) or UIS:IsKeyDown(Enum.KeyCode.Right) then dir = "right"
	end

	if dir then
		PlayerAction:FireServer("move", dir)
		moveCD = 0.12   -- 8 tiles/sec max
	end
end)

UIS.InputBegan:Connect(function(input, gp)
	if gp then return end
	if input.KeyCode == Enum.KeyCode.G then
		PlayerAction:FireServer("gather")
	elseif input.KeyCode == Enum.KeyCode.F then
		PlayerAction:FireServer("attack")
	elseif input.KeyCode == Enum.KeyCode.Escape then
		hidden = not hidden
		root.Visible = not hidden
	end
end)
