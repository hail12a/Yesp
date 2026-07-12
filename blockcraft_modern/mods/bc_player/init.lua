--[[
	BlockCraft Modern - Player setup
]]

------------------------------------------------------------------
-- Starting kit (only in survival; creative players get everything)
------------------------------------------------------------------
local STARTER_KIT = {
	"bc_tools:wood_pick",
	"bc_tools:wood_axe",
	"bc_core:torch 8",
}

core.register_on_newplayer(function(player)
	if core.settings:get_bool("creative_mode") then
		return
	end
	local inv = player:get_inventory()
	for _, item in ipairs(STARTER_KIT) do
		inv:add_item("main", item)
	end
end)

------------------------------------------------------------------
-- Player physics, health, and survival privileges
------------------------------------------------------------------
core.register_on_joinplayer(function(player)
	local name = player:get_player_name()

	player:set_properties({ hp_max = 20 })
	player:hud_set_hotbar_itemcount(8)

	-- Baseline Minecraft-like walking speed. Sprinting (bc_sprint) layers
	-- a temporary multiplier on top of this.
	player:set_physics_override({
		speed = 1.0,
		jump = 1.0,
		gravity = 1.0,
	})

	-- Survival realism: strip creative movement so the old "aux key = fly/run"
	-- behaviour is gone. Players keep interact/shout (and, in singleplayer,
	-- can still /grant themselves fly or fast if they want a build session).
	local privs = core.get_player_privs(name)
	privs.fly = nil
	privs.fast = nil
	privs.noclip = nil
	core.set_player_privs(name, privs)
end)

------------------------------------------------------------------
-- Respawn on the surface with a small welcome
------------------------------------------------------------------
core.register_on_respawnplayer(function(player)
	core.chat_send_player(player:get_player_name(), "You respawned. Build back better!")
	return false -- let the engine choose a static spawn point
end)

core.register_on_joinplayer(function(player)
	core.chat_send_player(player:get_player_name(),
		"Welcome to BlockCraft Modern! Punch trees to gather wood, then craft a workbench.")
end)

core.log("action", "[bc_player] Player module loaded")
