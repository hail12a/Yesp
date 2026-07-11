--[[
	BlockCraft Modern - world generation
	Mapgen aliases, ores, biomes, decorations and growth logic.
]]

------------------------------------------------------------------
-- Required mapgen aliases (tell the engine which nodes to use)
------------------------------------------------------------------
core.register_alias("mapgen_stone", "bc_core:stone")
core.register_alias("mapgen_water_source", "bc_core:water_source")
core.register_alias("mapgen_river_water_source", "bc_core:water_source")
core.register_alias("mapgen_lava_source", "bc_core:lava_source")
core.register_alias("mapgen_cobble", "bc_core:cobble")

-- Convenience aliases for legacy "default:" naming so common mods still work
local alias_map = {
	stone = "stone", cobble = "cobble", dirt = "dirt",
	dirt_with_grass = "dirt_with_grass", sand = "sand", gravel = "gravel",
	tree = "tree", wood = "wood", leaves = "leaves", glass = "glass",
	water_source = "water_source", water_flowing = "water_flowing",
	lava_source = "lava_source", lava_flowing = "lava_flowing",
	coal_lump = "coal_lump", steel_ingot = "steel_ingot",
	stick = "stick", apple = "apple",
}
for from, to in pairs(alias_map) do
	core.register_alias("default:" .. from, "bc_core:" .. to)
end

------------------------------------------------------------------
-- Ores
------------------------------------------------------------------
local function reg_ore(node, wherein, clust_scarcity, clust_num, size, y_min, y_max)
	core.register_ore({
		ore_type = "scatter",
		ore = node,
		wherein = wherein,
		clust_scarcity = clust_scarcity,
		clust_num_ores = clust_num,
		clust_size = size,
		y_min = y_min,
		y_max = y_max,
	})
end

-- Underground dirt / gravel blobs
core.register_ore({
	ore_type = "blob", ore = "bc_core:dirt", wherein = "bc_core:stone",
	clust_scarcity = 12 * 12 * 12, clust_size = 5, y_min = -63, y_max = 8,
	noise_params = { offset = 0, scale = 0.5, spread = { x = 20, y = 20, z = 20 }, seed = 766, octaves = 3, persistence = 0.6 },
})
core.register_ore({
	ore_type = "blob", ore = "bc_core:gravel", wherein = "bc_core:stone",
	clust_scarcity = 10 * 10 * 10, clust_size = 5, y_min = -255, y_max = 8,
	noise_params = { offset = 0, scale = 0.5, spread = { x = 20, y = 20, z = 20 }, seed = 2000, octaves = 3, persistence = 0.6 },
})

-- Metal / mineral ores
reg_ore("bc_core:coal_ore", "bc_core:stone", 8 * 8 * 8, 8, 3, -127, 64)
reg_ore("bc_core:iron_ore", "bc_core:stone", 12 * 12 * 12, 5, 3, -255, 20)
reg_ore("bc_core:gold_ore", "bc_core:stone", 18 * 18 * 18, 4, 3, -255, -32)
reg_ore("bc_core:diamond_ore", "bc_core:stone", 24 * 24 * 24, 3, 2, -512, -128)

-- Clay under sand near water
core.register_ore({
	ore_type = "sheet", ore = "bc_core:clay", wherein = { "bc_core:sand" },
	clust_scarcity = 24 * 24 * 24, clust_num_ores = 12, clust_size = 5,
	y_min = -8, y_max = 1,
	noise_threshold = 0.6,
	noise_params = { offset = 0, scale = 1, spread = { x = 15, y = 15, z = 15 }, seed = 40319, octaves = 3, persistence = 0.6 },
})

------------------------------------------------------------------
-- Biomes
------------------------------------------------------------------
core.clear_registered_biomes()

core.register_biome({
	name = "grassland",
	node_top = "bc_core:dirt_with_grass", depth_top = 1,
	node_filler = "bc_core:dirt", depth_filler = 3,
	node_riverbed = "bc_core:sand", depth_riverbed = 2,
	node_cave_liquid = { "bc_core:water_source", "bc_core:lava_source" },
	node_dungeon = "bc_core:cobble",
	y_min = 5, y_max = 31000,
	heat_point = 50, humidity_point = 50,
})

core.register_biome({
	name = "beach",
	node_top = "bc_core:sand", depth_top = 2,
	node_filler = "bc_core:sand", depth_filler = 2,
	node_riverbed = "bc_core:sand", depth_riverbed = 2,
	y_min = -3, y_max = 4,
	heat_point = 55, humidity_point = 50,
})

core.register_biome({
	name = "ocean",
	node_top = "bc_core:sand", depth_top = 1,
	node_filler = "bc_core:sand", depth_filler = 3,
	node_cave_liquid = { "bc_core:water_source", "bc_core:lava_source" },
	y_min = -31000, y_max = -4,
	heat_point = 50, humidity_point = 50,
})

core.register_biome({
	name = "desert",
	node_top = "bc_core:desert_sand", depth_top = 1,
	node_filler = "bc_core:desert_sand", depth_filler = 3,
	node_stone = "bc_core:desert_stone",
	node_riverbed = "bc_core:sand", depth_riverbed = 2,
	node_dungeon = "bc_core:desert_cobble",
	y_min = 4, y_max = 31000,
	heat_point = 88, humidity_point = 20,
})

core.register_biome({
	name = "tundra",
	node_dust = "bc_core:snow",
	node_top = "bc_core:dirt_with_snow", depth_top = 1,
	node_filler = "bc_core:dirt", depth_filler = 2,
	node_stone = "bc_core:permafrost",
	node_water_top = "bc_core:ice", depth_water_top = 3,
	node_riverbed = "bc_core:gravel", depth_riverbed = 2,
	y_min = 3, y_max = 31000,
	heat_point = 10, humidity_point = 40,
})

------------------------------------------------------------------
-- Decorations: trees, grass, plants
------------------------------------------------------------------
-- Oak tree schematic (small): trunk of logs + leaf canopy
local L = "bc_core:leaves"
local T = "bc_core:tree"
local A = "air"
local _ = { name = "air", prob = 0 } -- keep existing nodes

local function leaf(prob) return { name = L, prob = prob } end

local oak = {
	size = { x = 5, y = 6, z = 5 },
	data = {},
}
-- Build layers programmatically for clarity
do
	local d = oak.data
	local function set(x, y, z, name, prob)
		local idx = z * 5 * 6 + y * 5 + x + 1
		d[idx] = { name = name, prob = prob }
	end
	-- fill all with "air, keep" placeholder
	for i = 1, 5 * 6 * 5 do d[i] = { name = "air", prob = 0 } end
	-- trunk (center column x=2,z=2) y=0..4
	for y = 0, 4 do set(2, y, 2, T, 255) end
	-- canopy layers at y=3,4 (5x5 leaves) and y=5 (3x3 cross)
	for y = 3, 4 do
		for x = 0, 4 do
			for z = 0, 4 do
				if not (x == 2 and z == 2 and y == 4) then
					set(x, y, z, L, 200)
				end
			end
		end
	end
	for x = 1, 3 do
		for z = 1, 3 do
			set(x, 5, z, L, 180)
		end
	end
	set(2, 5, 2, L, 255)
end

core.register_decoration({
	name = "bc_core:oak_tree",
	deco_type = "schematic",
	place_on = { "bc_core:dirt_with_grass" },
	sidelen = 16,
	fill_ratio = 0.008,
	biomes = { "grassland" },
	schematic = oak,
	flags = "place_center_x, place_center_z",
	rotation = "random",
})

core.register_decoration({
	name = "bc_core:tallgrass",
	deco_type = "simple",
	place_on = { "bc_core:dirt_with_grass" },
	sidelen = 16,
	fill_ratio = 0.12,
	biomes = { "grassland" },
	decoration = "bc_core:tallgrass",
})

------------------------------------------------------------------
-- Tree growth from saplings
------------------------------------------------------------------
function bc_core.grow_tree(pos)
	local node = core.get_node(pos)
	if node.name ~= "bc_core:sapling" then
		return
	end
	-- need space & light
	local light = core.get_node_light(pos)
	if light == nil or light < 8 then
		core.get_node_timer(pos):start(math.random(120, 240))
		return
	end
	core.remove_node(pos)
	core.place_schematic(
		{ x = pos.x - 2, y = pos.y, z = pos.z - 2 },
		oak, "random", nil, false
	)
end

------------------------------------------------------------------
-- Grass spread / decay (dirt <-> grass block)
------------------------------------------------------------------
core.register_abm({
	label = "bc_core grass spread",
	nodenames = { "bc_core:dirt" },
	neighbors = { "bc_core:dirt_with_grass", "bc_core:dirt_with_snow" },
	interval = 8,
	chance = 40,
	catch_up = false,
	action = function(pos)
		local above = { x = pos.x, y = pos.y + 1, z = pos.z }
		local n = core.get_node(above)
		local def = core.registered_nodes[n.name]
		if not def then return end
		-- only spread if there's light and the node above is transparent/walkable-through
		if (def.sunlight_propagates or def.paramtype == "light") and
			core.get_node_light(above) and core.get_node_light(above) >= 8 then
			core.set_node(pos, { name = "bc_core:dirt_with_grass" })
		end
	end,
})

core.register_abm({
	label = "bc_core grass decay",
	nodenames = { "bc_core:dirt_with_grass" },
	interval = 8,
	chance = 40,
	catch_up = false,
	action = function(pos)
		local above = { x = pos.x, y = pos.y + 1, z = pos.z }
		local n = core.get_node(above)
		local def = core.registered_nodes[n.name]
		if def and not def.sunlight_propagates and def.paramtype ~= "light"
			and n.name ~= "air" then
			core.set_node(pos, { name = "bc_core:dirt" })
		end
	end,
})

------------------------------------------------------------------
-- Sapling can only be placed on soil
------------------------------------------------------------------
core.override_item("bc_core:sapling", {
	on_place = function(itemstack, placer, pointed_thing)
		if pointed_thing.type ~= "node" then
			return itemstack
		end
		local under = core.get_node(pointed_thing.under)
		if core.get_item_group(under.name, "soil") == 0 then
			return core.item_place(itemstack, placer, pointed_thing)
		end
		return core.item_place(itemstack, placer, pointed_thing)
	end,
})
