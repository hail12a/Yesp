--[[
	2D Survival (.io style) — Client   (StarterPlayerScripts)
	=========================================================
	Renders a moomoo.io / starve.io-style top-down world in a ScreenGui:
	  • smooth camera that follows you
	  • interpolated movement (no teleport-stutter)
	  • round characters with dark outlines, drop shadows, nametags + HP bars
	  • organic resource blobs: leafy trees, rounded stones, berry bushes
	  • flat vibrant palette, soft vignette ground

	Controls
	  WASD / Arrows … move        G … gather (chop / mine / forage)
	  F / Click ……… attack        Esc … hide overlay

	Pair with the companion ServerScript in ServerScriptService.
]]

local Players           = game:GetService("Players")
local UIS               = game:GetService("UserInputService")
local RunService        = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local me = Players.LocalPlayer

local folder = ReplicatedStorage:WaitForChild("SurvivalEvents", 30)
if not folder then warn("[Survival] events missing — is the Server script running?") return end
local WorldInit = folder:WaitForChild("WorldInit")
local Snapshot  = folder:WaitForChild("Snapshot")
local SetInput  = folder:WaitForChild("SetInput")
local DoAction  = folder:WaitForChild("DoAction")

-- ── Palette ─────────────────────────────────────────────────────────────────

local C = {
	grassA   = Color3.fromRGB( 96, 171,  92),
	grassB   = Color3.fromRGB( 78, 150,  76),
	leaf     = Color3.fromRGB( 73, 161,  72),
	leafEdge = Color3.fromRGB( 52, 120,  52),
	trunk    = Color3.fromRGB(120,  82,  48),
	stone    = Color3.fromRGB(150, 153, 160),
	stoneEdge= Color3.fromRGB(104, 107, 115),
	bush     = Color3.fromRGB( 86, 158,  72),
	berry    = Color3.fromRGB(214,  73,  73),
	mePlayer = Color3.fromRGB( 86, 170, 240),
	enemy    = Color3.fromRGB(231, 110,  92),
	outline  = Color3.fromRGB( 38,  44,  52),
	shadow   = Color3.fromRGB(  0,   0,   0),
	hp       = Color3.fromRGB( 96, 210, 110),
	hpBack   = Color3.fromRGB( 32,  38,  44),
}
local KIND = { TREE = 1, STONE = 2, BUSH = 3 }

-- ── State ───────────────────────────────────────────────────────────────────

local WORLD_W, WORLD_H, PLAYER_R = 3600, 2600, 28
local nodeMap   = {}     -- [id] = {k,x,y,r,dead}
local players   = {}     -- latest server snapshot, [uid] = {...}
local renderPos = {}     -- [uid] = {x,y}  eased toward server position
local cam       = { x = WORLD_W/2, y = WORLD_H/2 }
local hidden    = false
local myHud     = { hp = 100, wood = 0, stone = 0, food = 0 }

-- ── GUI scaffold ────────────────────────────────────────────────────────────

local gui = Instance.new("ScreenGui")
gui.Name, gui.ResetOnSpawn, gui.IgnoreGuiInset = "SurvivalGame", false, true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = me:WaitForChild("PlayerGui")

local root = Instance.new("Frame")
root.Size, root.BorderSizePixel = UDim2.fromScale(1,1), 0
root.BackgroundColor3 = C.grassA
root.Parent = gui
do
	local g = Instance.new("UIGradient")
	g.Color = ColorSequence.new(C.grassA, C.grassB)
	g.Rotation = 90
	g.Parent = root
end

-- soft vignette so the edges feel deeper
local vignette = Instance.new("ImageLabel")
vignette.Size = UDim2.fromScale(1,1)
vignette.BackgroundTransparency = 1
vignette.Image = "rbxassetid://5028857084"  -- radial gradient (built-in)
vignette.ImageColor3 = Color3.new(0,0,0)
vignette.ImageTransparency = 0.55
vignette.ScaleType = Enum.ScaleType.Stretch
vignette.ZIndex = 50
vignette.Parent = root

-- world layer (everything game-world sits here)
local worldLayer = Instance.new("Frame")
worldLayer.Size, worldLayer.BackgroundTransparency, worldLayer.BorderSizePixel = UDim2.fromScale(1,1), 1, 0
worldLayer.Parent = root

-- ── Helpers to build round sprites ──────────────────────────────────────────

local function circle(parent, color, zindex)
	local f = Instance.new("Frame")
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.BackgroundColor3 = color
	f.BorderSizePixel = 0
	f.ZIndex = zindex or 1
	Instance.new("UICorner", f).CornerRadius = UDim.new(1, 0)
	f.Parent = parent
	return f
end

local function stroke(inst, color, thick)
	local s = Instance.new("UIStroke")
	s.Color, s.Thickness = color, thick
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = inst
	return s
end

-- ── Node sprite pool ────────────────────────────────────────────────────────

local nodePool, nodeActive = {}, {}

local function buildNodeSprite()
	local c = Instance.new("Frame")
	c.AnchorPoint = Vector2.new(0.5, 0.5)
	c.BackgroundTransparency = 1
	c.ZIndex = 3
	c.Parent = worldLayer

	local shadow = circle(c, C.shadow, 2)
	shadow.BackgroundTransparency = 0.6

	local trunk = Instance.new("Frame")           -- tree trunk
	trunk.AnchorPoint = Vector2.new(0.5, 0)
	trunk.BackgroundColor3 = C.trunk
	trunk.BorderSizePixel = 0
	trunk.ZIndex = 3
	Instance.new("UICorner", trunk).CornerRadius = UDim.new(0.4, 0)
	trunk.Parent = c

	local body = circle(c, C.leaf, 4)
	local bodyStroke = stroke(body, C.leafEdge, 3)

	local berries = {}
	for i = 1, 3 do
		local b = circle(c, C.berry, 5)
		berries[i] = b
	end

	return { c = c, shadow = shadow, trunk = trunk, body = body,
	         bodyStroke = bodyStroke, berries = berries }
end

local function getNodeSprite()
	local s = table.remove(nodePool)
	if not s then s = buildNodeSprite() end
	s.c.Visible = true
	return s
end

local function styleNode(s, n)
	local d  = n.r * 2
	s.c.Size = UDim2.fromOffset(d, d)

	-- shadow under everything
	s.shadow.Size     = UDim2.fromOffset(d * 0.95, d * 0.95)
	s.shadow.Position = UDim2.new(0.5, 0, 0.5, math.floor(n.r * 0.18))

	if n.k == KIND.TREE then
		s.trunk.Visible = true
		s.trunk.Size     = UDim2.fromOffset(math.floor(d*0.22), math.floor(d*0.55))
		s.trunk.Position = UDim2.new(0.5, 0, 0.5, 0)
		s.body.BackgroundColor3 = C.leaf
		s.body.Size = UDim2.fromOffset(d, d)
		s.bodyStroke.Color = C.leafEdge
		for _, b in ipairs(s.berries) do b.Visible = false end

	elseif n.k == KIND.STONE then
		s.trunk.Visible = false
		s.body.BackgroundColor3 = C.stone
		s.body.Size = UDim2.fromOffset(d, d)
		s.bodyStroke.Color = C.stoneEdge
		-- stones read as rounded rocks, not perfect circles
		local uc = s.body:FindFirstChildOfClass("UICorner")
		if uc then uc.CornerRadius = UDim.new(0.35, 0) end
		for _, b in ipairs(s.berries) do b.Visible = false end
		return
	else -- BUSH
		s.trunk.Visible = false
		s.body.BackgroundColor3 = C.bush
		s.body.Size = UDim2.fromOffset(d, d)
		s.bodyStroke.Color = C.leafEdge
		local angles = { -0.7, 0.4, 1.6 }
		for i, b in ipairs(s.berries) do
			b.Visible = true
			b.Size = UDim2.fromOffset(math.floor(d*0.18), math.floor(d*0.18))
			b.Position = UDim2.new(0.5, math.floor(math.cos(angles[i])*n.r*0.5),
			                       0.5, math.floor(math.sin(angles[i])*n.r*0.5))
		end
	end

	-- ensure circular body for tree/bush
	local uc = s.body:FindFirstChildOfClass("UICorner")
	if uc then uc.CornerRadius = UDim.new(1, 0) end
end

-- ── Player sprite pool ──────────────────────────────────────────────────────

local playerPool, playerActive = {}, {}

local function buildPlayerSprite()
	local c = Instance.new("Frame")
	c.AnchorPoint = Vector2.new(0.5, 0.5)
	c.BackgroundTransparency = 1
	c.ZIndex = 8
	c.Parent = worldLayer

	local shadow = circle(c, C.shadow, 7)
	shadow.BackgroundTransparency = 0.6

	local hand1 = circle(c, C.mePlayer, 8)
	local hand2 = circle(c, C.mePlayer, 8)
	stroke(hand1, C.outline, 2)
	stroke(hand2, C.outline, 2)

	local body = circle(c, C.mePlayer, 9)
	stroke(body, C.outline, 3)

	local name = Instance.new("TextLabel")
	name.AnchorPoint = Vector2.new(0.5, 1)
	name.BackgroundTransparency = 1
	name.Font = Enum.Font.GothamBold
	name.TextSize = 14
	name.TextColor3 = Color3.fromRGB(255,255,255)
	name.TextStrokeTransparency = 0.4
	name.ZIndex = 12
	name.Parent = c

	local hpBack = Instance.new("Frame")
	hpBack.AnchorPoint = Vector2.new(0.5, 0)
	hpBack.BackgroundColor3 = C.hpBack
	hpBack.BorderSizePixel = 0
	hpBack.ZIndex = 11
	Instance.new("UICorner", hpBack).CornerRadius = UDim.new(1,0)
	hpBack.Parent = c
	local hpFill = Instance.new("Frame")
	hpFill.BackgroundColor3 = C.hp
	hpFill.BorderSizePixel = 0
	hpFill.Size = UDim2.fromScale(1,1)
	hpFill.ZIndex = 12
	Instance.new("UICorner", hpFill).CornerRadius = UDim.new(1,0)
	hpFill.Parent = hpBack

	return { c=c, shadow=shadow, body=body, hand1=hand1, hand2=hand2,
	         name=name, hpBack=hpBack, hpFill=hpFill }
end

local function getPlayerSprite()
	local s = table.remove(playerPool)
	if not s then s = buildPlayerSprite() end
	s.c.Visible = true
	return s
end

-- ── Networking ──────────────────────────────────────────────────────────────

WorldInit.OnClientEvent:Connect(function(nodeList, w, h, pr)
	WORLD_W, WORLD_H, PLAYER_R = w, h, pr
	nodeMap = {}
	for _, n in ipairs(nodeList) do nodeMap[n.id] = n end
end)

Snapshot.OnClientEvent:Connect(function(snap, changedNodes)
	local byUid = {}
	for _, p in ipairs(snap) do
		byUid[p.uid] = p
		if not renderPos[p.uid] then renderPos[p.uid] = { x = p.x, y = p.y } end
		if p.uid == me.UserId then
			myHud.hp, myHud.wood, myHud.stone, myHud.food = p.hp, p.wood, p.stone, p.food
		end
	end
	players = byUid
	-- drop render entries for players who left
	for uid in pairs(renderPos) do
		if not byUid[uid] then renderPos[uid] = nil end
	end
	if changedNodes then
		for _, n in ipairs(changedNodes) do nodeMap[n.id] = n end
	end
end)

-- ── HUD (corner panel) ──────────────────────────────────────────────────────

local panel = Instance.new("Frame")
panel.Size = UDim2.fromOffset(180, 96)
panel.Position = UDim2.new(0, 14, 0, 14)
panel.BackgroundColor3 = Color3.fromRGB(20, 26, 32)
panel.BackgroundTransparency = 0.15
panel.BorderSizePixel = 0
panel.ZIndex = 60
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 10)
stroke(panel, Color3.fromRGB(0,0,0), 1).Transparency = 0.4
panel.Parent = root

local function stat(y, color)
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(1, -20, 0, 22)
	l.Position = UDim2.new(0, 12, 0, y)
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.GothamBold
	l.TextSize = 15
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextColor3 = color
	l.ZIndex = 61
	l.Parent = panel
	return l
end
local sHp   = stat(8,  C.hp)
local sWood = stat(30, Color3.fromRGB(196,150, 96))
local sStone= stat(52, Color3.fromRGB(186,189,196))
local sFood = stat(74, Color3.fromRGB(225,120,110))

local hint = Instance.new("TextLabel")
hint.Size = UDim2.new(1, 0, 0, 22)
hint.Position = UDim2.new(0, 0, 1, -28)
hint.BackgroundTransparency = 1
hint.Font = Enum.Font.GothamMedium
hint.TextSize = 13
hint.TextColor3 = Color3.fromRGB(235, 240, 245)
hint.TextStrokeTransparency = 0.5
hint.Text = "WASD move   ·   G gather   ·   F / click attack   ·   Esc hide"
hint.ZIndex = 60
hint.Parent = root

-- ── Input → server ──────────────────────────────────────────────────────────

local lastDX, lastDY = 0, 0
local function pollMove()
	if hidden then return end
	local dx, dy = 0, 0
	if UIS:IsKeyDown(Enum.KeyCode.W) or UIS:IsKeyDown(Enum.KeyCode.Up)    then dy -= 1 end
	if UIS:IsKeyDown(Enum.KeyCode.S) or UIS:IsKeyDown(Enum.KeyCode.Down)  then dy += 1 end
	if UIS:IsKeyDown(Enum.KeyCode.A) or UIS:IsKeyDown(Enum.KeyCode.Left)  then dx -= 1 end
	if UIS:IsKeyDown(Enum.KeyCode.D) or UIS:IsKeyDown(Enum.KeyCode.Right) then dx += 1 end
	if dx ~= lastDX or dy ~= lastDY then
		lastDX, lastDY = dx, dy
		SetInput:FireServer(dx, dy)
	end
end

UIS.InputBegan:Connect(function(input, gp)
	if gp then return end
	if input.KeyCode == Enum.KeyCode.G then
		DoAction:FireServer("gather")
	elseif input.KeyCode == Enum.KeyCode.F then
		DoAction:FireServer("attack")
	elseif input.UserInputType == Enum.UserInputType.MouseButton1 then
		DoAction:FireServer("attack")
	elseif input.KeyCode == Enum.KeyCode.Escape then
		hidden = not hidden
		worldLayer.Visible = not hidden
		panel.Visible = not hidden
		if hidden and (lastDX ~= 0 or lastDY ~= 0) then
			lastDX, lastDY = 0, 0
			SetInput:FireServer(0, 0)
		end
	end
end)

-- ── Render loop ─────────────────────────────────────────────────────────────

local handPhase = 0

RunService.RenderStepped:Connect(function(dt)
	pollMove()
	if hidden then return end

	-- ease render positions toward the server truth
	local k = 1 - math.exp(-dt * 16)
	for uid, p in pairs(players) do
		local rp = renderPos[uid]
		if rp then
			rp.x += (p.x - rp.x) * k
			rp.y += (p.y - rp.y) * k
		end
	end

	-- camera follows me (eased)
	local mine = renderPos[me.UserId]
	if mine then
		cam.x += (mine.x - cam.x) * k
		cam.y += (mine.y - cam.y) * k
	end

	local vp = worldLayer.AbsoluteSize
	local cx, cy = vp.X/2, vp.Y/2
	local function toScreen(wx, wy)
		return wx - cam.x + cx, wy - cam.y + cy
	end
	local margin = 120

	-- nodes ---------------------------------------------------------------
	for _, s in ipairs(nodeActive) do s.c.Visible = false; nodePool[#nodePool+1] = s end
	table.clear(nodeActive)
	for _, n in pairs(nodeMap) do
		if not n.dead then
			local sx, sy = toScreen(n.x, n.y)
			if sx > -margin and sx < vp.X + margin and sy > -margin and sy < vp.Y + margin then
				local s = getNodeSprite()
				styleNode(s, n)
				s.c.Position = UDim2.fromOffset(sx, sy)
				nodeActive[#nodeActive+1] = s
			end
		end
	end

	-- players -------------------------------------------------------------
	handPhase += dt * 6
	for _, s in ipairs(playerActive) do s.c.Visible = false; playerPool[#playerPool+1] = s end
	table.clear(playerActive)
	for uid, p in pairs(players) do
		local rp = renderPos[uid]
		if rp then
			local sx, sy = toScreen(rp.x, rp.y)
			if sx > -margin and sx < vp.X + margin and sy > -margin and sy < vp.Y + margin then
				local s = getPlayerSprite()
				local isMe = (uid == me.UserId)
				local col  = isMe and C.mePlayer or C.enemy
				local d    = PLAYER_R * 2

				s.c.Size = UDim2.fromOffset(d, d)
				s.c.Position = UDim2.fromOffset(sx, sy)

				s.shadow.Size = UDim2.fromOffset(d*0.95, d*0.95)
				s.shadow.Position = UDim2.new(0.5, 0, 0.5, math.floor(PLAYER_R*0.18))

				s.body.Size = UDim2.fromOffset(d, d)
				s.body.BackgroundColor3 = col

				-- hands swing slightly toward facing for life
				local f  = p.facing or 0
				local sw = math.sin(handPhase) * 0.25
				local hd = math.floor(PLAYER_R * 0.55)
				for i, hand in ipairs({ s.hand1, s.hand2 }) do
					local a = f + (i == 1 and (0.6 + sw) or (-0.6 - sw))
					hand.Size = UDim2.fromOffset(math.floor(d*0.4), math.floor(d*0.4))
					hand.Position = UDim2.new(0.5, math.floor(math.cos(a)*hd),
					                          0.5, math.floor(math.sin(a)*hd))
					hand.BackgroundColor3 = col
				end

				s.name.Text = p.name
				s.name.Position = UDim2.new(0.5, 0, 0, -10)
				s.name.Size = UDim2.fromOffset(160, 16)
				s.name.TextColor3 = isMe and Color3.fromRGB(210,235,255) or Color3.fromRGB(255,224,220)

				s.hpBack.Size = UDim2.fromOffset(d, 6)
				s.hpBack.Position = UDim2.new(0.5, 0, 1, 6)
				s.hpFill.Size = UDim2.fromScale(math.clamp((p.hp or 0)/100, 0, 1), 1)

				playerActive[#playerActive+1] = s
			end
		end
	end

	-- HUD numbers
	sHp.Text    = ("HP    %d"):format(myHud.hp)
	sWood.Text  = ("Wood  %d"):format(myHud.wood)
	sStone.Text = ("Stone %d"):format(myHud.stone)
	sFood.Text  = ("Food  %d"):format(myHud.food)
end)
