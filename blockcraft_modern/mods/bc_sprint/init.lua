--[[
	BlockCraft Modern - Sprinting (Minecraft-style)

	Sprint by either:
	  * double-tapping the forward key (W), or
	  * holding the sprint key (aux1 / bound to Ctrl in the shipped config).

	While sprinting the player moves faster and the FOV widens slightly, then
	eases back when they stop — just like Minecraft. Sprinting stops when the
	forward key is released, the player sneaks, or they stand still.
]]

local SPRINT_SPEED = 1.6      -- movement multiplier while sprinting
local SPRINT_FOV = 1.12       -- FOV multiplier while sprinting
local DOUBLE_TAP = 0.30       -- max seconds between taps to count as double-tap
local FOV_EASE = 0.15         -- FOV transition time (seconds)

local state = {}

local function now()
	return core.get_us_time() / 1000000
end

local function start_sprint(player, st)
	if st.sprinting then return end
	st.sprinting = true
	player:set_physics_override({ speed = SPRINT_SPEED })
	player:set_fov(SPRINT_FOV, true, FOV_EASE)
end

local function stop_sprint(player, st)
	if not st.sprinting then return end
	st.sprinting = false
	player:set_physics_override({ speed = 1.0 })
	player:set_fov(0, false, FOV_EASE)   -- 0 = reset to the client's FOV
end

core.register_on_joinplayer(function(player)
	state[player:get_player_name()] = { last_tap = 0, was_up = false, sprinting = false }
end)

core.register_on_leaveplayer(function(player)
	state[player:get_player_name()] = nil
end)

core.register_globalstep(function()
	local t = now()
	for _, player in ipairs(core.get_connected_players()) do
		local st = state[player:get_player_name()]
		if st then
			local c = player:get_player_control()

			-- rising edge of forward key => check for double-tap
			if c.up and not st.was_up then
				if (t - st.last_tap) < DOUBLE_TAP then
					st.want_sprint = true
				end
				st.last_tap = t
			end
			st.was_up = c.up

			-- holding the sprint key also sprints (Minecraft: Ctrl)
			local holding = c.aux1

			local should = (st.want_sprint or holding)
				and c.up and not c.sneak

			if should then
				start_sprint(player, st)
			else
				stop_sprint(player, st)
				st.want_sprint = false
			end
		end
	end
end)

core.log("action", "[bc_sprint] sprint enabled (double-tap forward / hold sprint key)")
