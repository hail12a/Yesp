--[[
	BlockCraft Modern - Sprinting (Minecraft-style, double-tap forward)

	Double-tap the forward key to sprint; movement speeds up until you stop
	moving forward or start sneaking. Physics is only changed on the moments
	sprint turns on/off (not every frame), so it stays smooth and reliable.
]]

local SPRINT_SPEED = 1.4
local DOUBLE_TAP = 0.30   -- seconds between taps to count as a double-tap

local st = {}

local function now() return core.get_us_time() / 1000000 end

core.register_on_joinplayer(function(p)
	st[p:get_player_name()] = { last = 0, was = false, on = false, want = false }
end)

core.register_on_leaveplayer(function(p)
	st[p:get_player_name()] = nil
end)

core.register_globalstep(function()
	local t = now()
	for _, p in ipairs(core.get_connected_players()) do
		local s = st[p:get_player_name()]
		if s then
			local c = p:get_player_control()

			-- rising edge of forward => maybe a double-tap
			if c.up and not s.was then
				if (t - s.last) < DOUBLE_TAP then s.want = true end
				s.last = t
			end
			s.was = c.up
			if not c.up then s.want = false end

			local run = s.want and c.up and not c.sneak
			if run and not s.on then
				s.on = true
				p:set_physics_override({ speed = SPRINT_SPEED })
			elseif not run and s.on then
				s.on = false
				p:set_physics_override({ speed = 1.0 })
			end
		end
	end
end)

core.log("action", "[bc_sprint] double-tap-forward sprint enabled")
