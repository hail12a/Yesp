--[[
	BlockCraft Modern - Core mod
	Defines all base nodes, craftitems, world generation, ores and biomes.
	Runs on the Luanti (Minetest) engine.
]]

bc_core = {}
local modpath = core.get_modpath("bc_core")

dofile(modpath .. "/nodes.lua")
dofile(modpath .. "/mapgen.lua")

core.log("action", "[bc_core] BlockCraft Modern core loaded")
