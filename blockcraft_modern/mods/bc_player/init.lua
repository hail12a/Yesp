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
-- Player health & hotbar
--
-- NOTE: We intentionally do NOT override the player's visual/mesh or
-- collisionbox. A custom box model was tried earlier but rendered small and
-- broke movement (the engine's default player size/collision is reliable).
-- Getting a proper animated Minecraft-style character needs a rigged model
-- (a full game like Asuna already ships one). Keep this minimal and stable.
------------------------------------------------------------------
core.register_on_joinplayer(function(player)
	player:set_properties({ hp_max = 20 })
	player:hud_set_hotbar_itemcount(8)
end)

------------------------------------------------------------------
-- Respawn on the surface with a small welcome
------------------------------------------------------------------
core.register_on_respawnplayer(function(player)
	core.chat_send_player(player:get_player_name(), "You respawned. Build back better!")
	return false -- let the engine choose a static spawn point
end)

core.register_on_joinplayer(function(player)
	local name = player:get_player_name()
	core.chat_send_player(name,
		"Welcome to BlockCraft Modern! Punch trees to gather wood, then craft a workbench.")

	-- Loud warning if the world was created in Creative mode: that (not the
	-- game) is what makes blocks break instantly and items not stack. The
	-- fix is a NEW world with Creative unchecked.
	if core.settings:get_bool("creative_mode") then
		core.chat_send_player(name,
			">>> CREATIVE MODE is ON. Blocks break instantly and items won't " ..
			"stack. For real survival, create a NEW world with Creative Mode " ..
			"UNCHECKED (and Enable Damage ON).")
	end
end)

core.log("action", "[bc_player] Player module loaded")
