--[[
	Day/Night Cycle - RDR2 Style (ServerScriptService)
	Full cycle = 20 minutes (day + night combined)
	Whitelisted :time command for d2here4game
	
	Key features:
	- RDR2-STYLE ATMOSPHERIC FOG (volumetric, distant haze)
	- Realistic RDR2-inspired lighting
	- Warm dawn/dusk tones
	- Cool night atmosphere
	- Neutral midday lighting
	- Dynamic fog that changes with time of day
]]

local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

-- CONFIG
local FULL_CYCLE_MINUTES = 20
local WHITELISTED_USERS = { "d2here4game" }

-- In-game hours per real second: 24 hours / (20*60 seconds) = 0.02 hours/sec
local HOURS_PER_SECOND = 24 / (FULL_CYCLE_MINUTES * 60)

-- Ensure atmosphere exists
local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
if not atmosphere then
	atmosphere = Instance.new("Atmosphere")
	atmosphere.Parent = Lighting
end

---------------------------------------------------------------
-- RDR2 LIGHTING PRESETS WITH ATMOSPHERIC FOG
-- Based on Red Dead Redemption 2 realistic color grading
-- Fog simulates RDR2's volumetric atmospheric haze
---------------------------------------------------------------

-- Early Dawn (5:00-6:00) - Dark blue transitioning to orange with misty fog
local DAWN = {
	Ambient = Color3.fromRGB(80, 100, 140),
	Brightness = 0.4,
	ColorShift_Bottom = Color3.fromRGB(60, 45, 30),
	ColorShift_Top = Color3.fromRGB(200, 120, 80),
	EnvironmentDiffuseScale = 0.8,
	EnvironmentSpecularScale = 0.7,
	OutdoorAmbient = Color3.fromRGB(100, 110, 150),
	ShadowSoftness = 0.5,
	GlobalShadows = true,
	AtmosphereDensity = 0.4,
	FogColor = Color3.fromRGB(140, 140, 160),
	FogEnd = 2500,
	ClockTime = 5,
}

-- Sunrise (6:00-7:00) - Golden orange warm light with golden haze
local SUNRISE = {
	Ambient = Color3.fromRGB(180, 150, 110),
	Brightness = 1.2,
	ColorShift_Bottom = Color3.fromRGB(100, 70, 30),
	ColorShift_Top = Color3.fromRGB(255, 180, 80),
	EnvironmentDiffuseScale = 1,
	EnvironmentSpecularScale = 0.6,
	OutdoorAmbient = Color3.fromRGB(200, 160, 120),
	ShadowSoftness = 0.4,
	GlobalShadows = true,
	AtmosphereDensity = 0.35,
	FogColor = Color3.fromRGB(200, 160, 110),
	FogEnd = 3500,
	ClockTime = 6,
}

-- Morning (7:00-10:00) - Warm daylight with light haze
local MORNING = {
	Ambient = Color3.fromRGB(200, 190, 170),
	Brightness = 2.0,
	ColorShift_Bottom = Color3.fromRGB(80, 70, 50),
	ColorShift_Top = Color3.fromRGB(240, 230, 210),
	EnvironmentDiffuseScale = 1,
	EnvironmentSpecularScale = 0.5,
	OutdoorAmbient = Color3.fromRGB(210, 200, 180),
	ShadowSoftness = 0.2,
	GlobalShadows = true,
	AtmosphereDensity = 0.25,
	FogColor = Color3.fromRGB(200, 195, 180),
	FogEnd = 5500,
	ClockTime = 8,
}

-- Midday (10:00-14:00) - Bright neutral daylight with far haze
local MIDDAY = {
	Ambient = Color3.fromRGB(220, 220, 210),
	Brightness = 2.5,
	ColorShift_Bottom = Color3.fromRGB(70, 70, 60),
	ColorShift_Top = Color3.fromRGB(245, 245, 245),
	EnvironmentDiffuseScale = 1.2,
	EnvironmentSpecularScale = 0.4,
	OutdoorAmbient = Color3.fromRGB(230, 230, 220),
	ShadowSoftness = 0.15,
	GlobalShadows = true,
	AtmosphereDensity = 0.2,
	FogColor = Color3.fromRGB(210, 210, 210),
	FogEnd = 8000,
	ClockTime = 12,
}

-- Afternoon (14:00-17:00) - Warm golden light with golden haze
local AFTERNOON = {
	Ambient = Color3.fromRGB(210, 200, 170),
	Brightness = 2.0,
	ColorShift_Bottom = Color3.fromRGB(90, 75, 50),
	ColorShift_Top = Color3.fromRGB(250, 220, 180),
	EnvironmentDiffuseScale = 1,
	EnvironmentSpecularScale = 0.55,
	OutdoorAmbient = Color3.fromRGB(220, 200, 160),
	ShadowSoftness = 0.3,
	GlobalShadows = true,
	AtmosphereDensity = 0.28,
	FogColor = Color3.fromRGB(210, 190, 160),
	FogEnd = 6500,
	ClockTime = 15,
}

-- Sunset (17:00-18:30) - Deep orange/red sky with orange atmospheric fog
local SUNSET = {
	Ambient = Color3.fromRGB(180, 120, 80),
	Brightness = 1.4,
	ColorShift_Bottom = Color3.fromRGB(120, 60, 20),
	ColorShift_Top = Color3.fromRGB(255, 140, 60),
	EnvironmentDiffuseScale = 1,
	EnvironmentSpecularScale = 0.65,
	OutdoorAmbient = Color3.fromRGB(190, 130, 80),
	ShadowSoftness = 0.45,
	GlobalShadows = true,
	AtmosphereDensity = 0.38,
	FogColor = Color3.fromRGB(200, 120, 60),
	FogEnd = 4000,
	ClockTime = 17.5,
}

-- Dusk (18:30-20:00) - Dark blue transitioning to night with purple fog
local DUSK = {
	Ambient = Color3.fromRGB(70, 90, 130),
	Brightness = 0.3,
	ColorShift_Bottom = Color3.fromRGB(40, 35, 50),
	ColorShift_Top = Color3.fromRGB(80, 100, 150),
	EnvironmentDiffuseScale = 0.8,
	EnvironmentSpecularScale = 0.85,
	OutdoorAmbient = Color3.fromRGB(60, 80, 120),
	ShadowSoftness = 0.6,
	GlobalShadows = true,
	AtmosphereDensity = 0.45,
	FogColor = Color3.fromRGB(90, 90, 130),
	FogEnd = 2000,
	ClockTime = 19,
}

-- Night (20:00-5:00) - Deep blue/purple night sky with moody fog
local NIGHT = {
	Ambient = Color3.fromRGB(30, 40, 70),
	Brightness = 0.05,
	ColorShift_Bottom = Color3.fromRGB(20, 20, 40),
	ColorShift_Top = Color3.fromRGB(40, 50, 90),
	EnvironmentDiffuseScale = 0.6,
	EnvironmentSpecularScale = 1,
	OutdoorAmbient = Color3.fromRGB(25, 35, 65),
	ShadowSoftness = 0.8,
	GlobalShadows = true,
	AtmosphereDensity = 0.5,
	FogColor = Color3.fromRGB(40, 45, 80),
	FogEnd = 1500,
	ClockTime = 22,
}

---------------------------------------------------------------
-- UTILITY: lerp helpers
---------------------------------------------------------------
local function lerpNum(a, b, t)
	return a + (b - a) * t
end

local function lerpColor(a, b, t)
	return Color3.new(
		lerpNum(a.R, b.R, t),
		lerpNum(a.G, b.G, t),
		lerpNum(a.B, b.B, t)
	)
end

local function applyPreset(preset)
	Lighting.Ambient = preset.Ambient
	Lighting.Brightness = preset.Brightness
	Lighting.ColorShift_Bottom = preset.ColorShift_Bottom
	Lighting.ColorShift_Top = preset.ColorShift_Top
	Lighting.EnvironmentDiffuseScale = preset.EnvironmentDiffuseScale
	Lighting.EnvironmentSpecularScale = preset.EnvironmentSpecularScale
	Lighting.OutdoorAmbient = preset.OutdoorAmbient
	Lighting.ShadowSoftness = preset.ShadowSoftness
	Lighting.GlobalShadows = preset.GlobalShadows
	atmosphere.Density = preset.AtmosphereDensity
	-- RDR2-style fog
	Lighting.FogColor = preset.FogColor
	Lighting.FogEnd = preset.FogEnd
end

local function lerpPreset(from, to, t)
	t = math.clamp(t, 0, 1)
	Lighting.Ambient = lerpColor(from.Ambient, to.Ambient, t)
	Lighting.Brightness = lerpNum(from.Brightness, to.Brightness, t)
	Lighting.ColorShift_Bottom = lerpColor(from.ColorShift_Bottom, to.ColorShift_Bottom, t)
	Lighting.ColorShift_Top = lerpColor(from.ColorShift_Top, to.ColorShift_Top, t)
	Lighting.EnvironmentDiffuseScale = lerpNum(from.EnvironmentDiffuseScale, to.EnvironmentDiffuseScale, t)
	Lighting.EnvironmentSpecularScale = lerpNum(from.EnvironmentSpecularScale, to.EnvironmentSpecularScale, t)
	Lighting.OutdoorAmbient = lerpColor(from.OutdoorAmbient, to.OutdoorAmbient, t)
	Lighting.ShadowSoftness = lerpNum(from.ShadowSoftness, to.ShadowSoftness, t)
	atmosphere.Density = lerpNum(from.AtmosphereDensity, to.AtmosphereDensity, t)
	-- RDR2-style fog
	Lighting.FogColor = lerpColor(from.FogColor, to.FogColor, t)
	Lighting.FogEnd = lerpNum(from.FogEnd, to.FogEnd, t)

	-- Snap GlobalShadows at midpoint
	if t < 0.5 then
		Lighting.GlobalShadows = from.GlobalShadows
	else
		Lighting.GlobalShadows = to.GlobalShadows
	end
end

---------------------------------------------------------------
-- PHASE LOGIC - RDR2 Accurate Timeline
-- Timeline (in-game hours):
--   5:00 - 6:00  Dawn             (DAWN)
--   6:00 - 7:00  Sunrise          (SUNRISE)
--   7:00 - 10:00 Morning          (MORNING)
--  10:00 - 14:00 Midday peak      (MIDDAY)
--  14:00 - 17:00 Afternoon        (AFTERNOON)
--  17:00 - 18:30 Sunset           (SUNSET)
--  18:30 - 20:00 Dusk             (DUSK)
--  20:00 - 5:00  Full night       (NIGHT)
---------------------------------------------------------------
local function updateLighting(clockTime)
	if clockTime >= 5 and clockTime < 6 then
		-- Dawn transition
		local t = (clockTime - 5) / 1
		lerpPreset(NIGHT, DAWN, t)

	elseif clockTime >= 6 and clockTime < 7 then
		-- Sunrise transition
		local t = (clockTime - 6) / 1
		lerpPreset(DAWN, SUNRISE, t)

	elseif clockTime >= 7 and clockTime < 10 then
		-- Morning transition
		local t = (clockTime - 7) / 3
		lerpPreset(SUNRISE, MORNING, t)

	elseif clockTime >= 10 and clockTime < 14 then
		-- Midday peak
		applyPreset(MIDDAY)

	elseif clockTime >= 14 and clockTime < 17 then
		-- Afternoon transition
		local t = (clockTime - 14) / 3
		lerpPreset(MIDDAY, AFTERNOON, t)

	elseif clockTime >= 17 and clockTime < 18.5 then
		-- Sunset transition
		local t = (clockTime - 17) / 1.5
		lerpPreset(AFTERNOON, SUNSET, t)

	elseif clockTime >= 18.5 and clockTime < 20 then
		-- Dusk transition
		local t = (clockTime - 18.5) / 1.5
		lerpPreset(SUNSET, DUSK, t)

	else
		-- Full night (20:00 → 5:00)
		applyPreset(NIGHT)
	end
end

---------------------------------------------------------------
-- CLOCK LOOP
---------------------------------------------------------------
Lighting.ClockTime = 3 -- start at 3am

RunService.Heartbeat:Connect(function(dt)
	local newTime = Lighting.ClockTime + (HOURS_PER_SECOND * dt)
	if newTime >= 24 then
		newTime = newTime - 24
	end
	Lighting.ClockTime = newTime
	updateLighting(newTime)
end)

---------------------------------------------------------------
-- ADMIN COMMAND: :time day / :time night
---------------------------------------------------------------
local function isWhitelisted(player)
	for _, name in ipairs(WHITELISTED_USERS) do
		if player.Name == name then
			return true
		end
	end
	return false
end

Players.PlayerAdded:Connect(function(player)
	player.Chatted:Connect(function(msg)
		if not isWhitelisted(player) then return end

		local lower = string.lower(msg)

		if lower == ":time day" then
			Lighting.ClockTime = 12
			applyPreset(MIDDAY)
		elseif lower == ":time night" then
			Lighting.ClockTime = 22
			applyPreset(NIGHT)
		end
	end)
end)
