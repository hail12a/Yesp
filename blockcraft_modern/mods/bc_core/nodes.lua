--[[
	BlockCraft Modern - node & craftitem registrations
]]

local S = function(s) return s end -- translation stub

------------------------------------------------------------------
-- Craftitems (raw materials & food)
------------------------------------------------------------------
core.register_craftitem("bc_core:stick", {
	description = S("Stick"),
	inventory_image = "bc_stick.png",
	groups = { stick = 1 },
})

core.register_craftitem("bc_core:coal_lump", {
	description = S("Coal Lump"),
	inventory_image = "bc_coal_lump.png",
	groups = { coal = 1 },
})

core.register_craftitem("bc_core:iron_lump", {
	description = S("Iron Lump"),
	inventory_image = "bc_iron_lump.png",
})

core.register_craftitem("bc_core:steel_ingot", {
	description = S("Steel Ingot"),
	inventory_image = "bc_steel_ingot.png",
})

core.register_craftitem("bc_core:gold_lump", {
	description = S("Gold Lump"),
	inventory_image = "bc_gold_lump.png",
})

core.register_craftitem("bc_core:gold_ingot", {
	description = S("Gold Ingot"),
	inventory_image = "bc_gold_ingot.png",
})

core.register_craftitem("bc_core:diamond", {
	description = S("Diamond"),
	inventory_image = "bc_diamond.png",
})

core.register_craftitem("bc_core:clay_lump", {
	description = S("Clay Lump"),
	inventory_image = "bc_clay_lump.png",
})

core.register_craftitem("bc_core:apple", {
	description = S("Apple"),
	inventory_image = "bc_apple.png",
	on_use = core.item_eat(2),
	groups = { food = 2, eatable = 2 },
})

------------------------------------------------------------------
-- Sound helper (uses engine default sound set if present, else nil)
------------------------------------------------------------------
local function sounds(kind)
	-- Returns a table with dig/dug/footstep placeholders; the engine
	-- gracefully handles missing sound files.
	return {
		footstep = { name = "", gain = 0.2 },
		dig = { name = "", gain = 0.4 },
		dug = { name = "", gain = 0.6 },
	}
end

------------------------------------------------------------------
-- Solid terrain nodes
------------------------------------------------------------------
core.register_node("bc_core:stone", {
	description = S("Stone"),
	tiles = { "bc_stone.png" },
	groups = { cracky = 3, stone = 1 },
	drop = "bc_core:cobble",
	sounds = sounds("stone"),
})

core.register_node("bc_core:cobble", {
	description = S("Cobblestone"),
	tiles = { "bc_cobble.png" },
	groups = { cracky = 3, stone = 2 },
	sounds = sounds("stone"),
})

core.register_node("bc_core:stonebrick", {
	description = S("Stone Bricks"),
	tiles = { "bc_cobble.png^[colorize:#000000:40" },
	groups = { cracky = 2, stone = 1 },
	sounds = sounds("stone"),
})

core.register_node("bc_core:dirt", {
	description = S("Dirt"),
	tiles = { "bc_dirt.png" },
	groups = { crumbly = 3, soil = 1 },
	sounds = sounds("dirt"),
})

core.register_node("bc_core:dirt_with_grass", {
	description = S("Grass Block"),
	tiles = {
		"bc_grass_top.png",
		"bc_dirt.png",
		"bc_grass_side.png",
	},
	groups = { crumbly = 3, soil = 1, spreading_soil = 1 },
	drop = "bc_core:dirt",
	sounds = sounds("dirt"),
})

core.register_node("bc_core:dirt_with_snow", {
	description = S("Snowy Grass Block"),
	tiles = {
		"bc_snow.png",
		"bc_dirt.png",
		"bc_dirt_with_snow_side.png",
	},
	groups = { crumbly = 3, soil = 1 },
	drop = "bc_core:dirt",
	sounds = sounds("dirt"),
})

core.register_node("bc_core:permafrost", {
	description = S("Permafrost"),
	tiles = { "bc_permafrost.png" },
	groups = { cracky = 3 },
	sounds = sounds("dirt"),
})

core.register_node("bc_core:sand", {
	description = S("Sand"),
	tiles = { "bc_sand.png" },
	groups = { crumbly = 3, sand = 1, falling_node = 1 },
	sounds = sounds("sand"),
})

core.register_node("bc_core:desert_sand", {
	description = S("Desert Sand"),
	tiles = { "bc_desert_sand.png" },
	groups = { crumbly = 3, sand = 1, falling_node = 1 },
	sounds = sounds("sand"),
})

core.register_node("bc_core:sandstone", {
	description = S("Sandstone"),
	tiles = { "bc_sandstone.png" },
	groups = { crumbly = 2, cracky = 3 },
	sounds = sounds("stone"),
})

core.register_node("bc_core:desert_stone", {
	description = S("Desert Stone"),
	tiles = { "bc_desert_stone.png" },
	groups = { cracky = 3, stone = 1 },
	drop = "bc_core:desert_cobble",
	sounds = sounds("stone"),
})

core.register_node("bc_core:desert_cobble", {
	description = S("Desert Cobblestone"),
	tiles = { "bc_desert_cobble.png" },
	groups = { cracky = 3, stone = 2 },
	sounds = sounds("stone"),
})

core.register_node("bc_core:gravel", {
	description = S("Gravel"),
	tiles = { "bc_gravel.png" },
	groups = { crumbly = 2, falling_node = 1 },
	sounds = sounds("gravel"),
})

core.register_node("bc_core:clay", {
	description = S("Clay"),
	tiles = { "bc_clay.png" },
	groups = { crumbly = 3 },
	drop = "bc_core:clay_lump 4",
	sounds = sounds("dirt"),
})

core.register_node("bc_core:snow", {
	description = S("Snow"),
	tiles = { "bc_snow.png" },
	groups = { crumbly = 3, falling_node = 1, snowy = 1 },
	sounds = sounds("dirt"),
})

core.register_node("bc_core:snowblock", {
	description = S("Snow Block"),
	tiles = { "bc_snowblock.png" },
	groups = { crumbly = 3, snowy = 1 },
	sounds = sounds("dirt"),
})

core.register_node("bc_core:ice", {
	description = S("Ice"),
	tiles = { "bc_ice.png" },
	use_texture_alpha = "blend",
	groups = { cracky = 3, ice = 1 },
	sounds = sounds("stone"),
})

core.register_node("bc_core:bedrock", {
	description = S("Bedrock"),
	tiles = { "bc_bedrock.png" },
	groups = { unbreakable = 1 },
	is_ground_content = false,
	diggable = false,
	sounds = sounds("stone"),
})

------------------------------------------------------------------
-- Wood
------------------------------------------------------------------
core.register_node("bc_core:tree", {
	description = S("Oak Log"),
	tiles = { "bc_tree_top.png", "bc_tree_top.png", "bc_tree.png" },
	paramtype2 = "facedir",
	groups = { choppy = 2, tree = 1, flammable = 2 },
	sounds = sounds("wood"),
	on_place = core.rotate_node,
})

core.register_node("bc_core:wood", {
	description = S("Wooden Planks"),
	tiles = { "bc_wood.png" },
	groups = { choppy = 2, wood = 1, flammable = 3 },
	sounds = sounds("wood"),
})

core.register_node("bc_core:leaves", {
	description = S("Oak Leaves"),
	drawtype = "allfaces_optional",
	waving = 1,
	tiles = { "bc_leaves.png" },
	use_texture_alpha = "clip",
	paramtype = "light",
	groups = { snappy = 3, leaves = 1, flammable = 2 },
	drop = {
		max_items = 1,
		items = {
			{ items = { "bc_core:sapling" }, rarity = 20 },
			{ items = { "bc_core:apple" }, rarity = 30 },
			{ items = { "bc_core:leaves" } },
		},
	},
	sounds = sounds("leaves"),
})

core.register_node("bc_core:sapling", {
	description = S("Sapling"),
	drawtype = "plantlike",
	tiles = { "bc_sapling.png" },
	inventory_image = "bc_sapling.png",
	wield_image = "bc_sapling.png",
	paramtype = "light",
	sunlight_propagates = true,
	walkable = false,
	selection_box = { type = "fixed", fixed = { -0.3, -0.5, -0.3, 0.3, 0.35, 0.3 } },
	groups = { snappy = 3, dig_immediate = 3, sapling = 1, attached_node = 1 },
	sounds = sounds("leaves"),
	on_construct = function(pos)
		core.get_node_timer(pos):start(math.random(120, 300))
	end,
	on_timer = function(pos)
		bc_core.grow_tree(pos)
	end,
})

------------------------------------------------------------------
-- Plants / decoration
------------------------------------------------------------------
core.register_node("bc_core:tallgrass", {
	description = S("Tall Grass"),
	drawtype = "plantlike",
	tiles = { "bc_tallgrass.png" },
	inventory_image = "bc_tallgrass.png",
	wield_image = "bc_tallgrass.png",
	paramtype = "light",
	sunlight_propagates = true,
	walkable = false,
	buildable_to = true,
	selection_box = { type = "fixed", fixed = { -0.4, -0.5, -0.4, 0.4, 0.1, 0.4 } },
	groups = { snappy = 3, dig_immediate = 3, flora = 1, attached_node = 1, flammable = 3 },
	drop = {
		max_items = 1,
		items = { { items = { "bc_core:stick" }, rarity = 8 } },
	},
	sounds = sounds("leaves"),
})

core.register_node("bc_core:glass", {
	description = S("Glass"),
	drawtype = "glasslike",
	tiles = { "bc_glass.png" },
	use_texture_alpha = "blend",
	paramtype = "light",
	sunlight_propagates = true,
	groups = { cracky = 3, oddly_breakable_by_hand = 3 },
	sounds = sounds("glass"),
})

core.register_node("bc_core:brick", {
	description = S("Brick Block"),
	tiles = { "bc_brick.png" },
	groups = { cracky = 3 },
	sounds = sounds("stone"),
})

------------------------------------------------------------------
-- Ores & mineral blocks
------------------------------------------------------------------
core.register_node("bc_core:coal_ore", {
	description = S("Coal Ore"),
	tiles = { "bc_coal_ore.png" },
	groups = { cracky = 3 },
	drop = "bc_core:coal_lump",
	sounds = sounds("stone"),
})

core.register_node("bc_core:iron_ore", {
	description = S("Iron Ore"),
	tiles = { "bc_iron_ore.png" },
	groups = { cracky = 2 },
	drop = "bc_core:iron_lump",
	sounds = sounds("stone"),
})

core.register_node("bc_core:gold_ore", {
	description = S("Gold Ore"),
	tiles = { "bc_gold_ore.png" },
	groups = { cracky = 2 },
	drop = "bc_core:gold_lump",
	sounds = sounds("stone"),
})

core.register_node("bc_core:diamond_ore", {
	description = S("Diamond Ore"),
	tiles = { "bc_diamond_ore.png" },
	groups = { cracky = 1 },
	drop = "bc_core:diamond",
	sounds = sounds("stone"),
})

core.register_node("bc_core:coalblock", {
	description = S("Coal Block"),
	tiles = { "bc_coalblock.png" },
	groups = { cracky = 3 },
	sounds = sounds("stone"),
})

core.register_node("bc_core:steelblock", {
	description = S("Steel Block"),
	tiles = { "bc_steelblock.png" },
	groups = { cracky = 1, level = 2 },
	sounds = sounds("metal"),
})

core.register_node("bc_core:goldblock", {
	description = S("Gold Block"),
	tiles = { "bc_goldblock.png" },
	groups = { cracky = 1 },
	sounds = sounds("metal"),
})

core.register_node("bc_core:diamondblock", {
	description = S("Diamond Block"),
	tiles = { "bc_diamondblock.png" },
	groups = { cracky = 1, level = 3 },
	sounds = sounds("metal"),
})

------------------------------------------------------------------
-- Torch (light source)
------------------------------------------------------------------
core.register_node("bc_core:torch", {
	description = S("Torch"),
	drawtype = "plantlike",
	tiles = { "bc_torch.png" },
	inventory_image = "bc_torch.png",
	wield_image = "bc_torch.png",
	paramtype = "light",
	sunlight_propagates = true,
	walkable = false,
	light_source = 13,
	selection_box = { type = "fixed", fixed = { -0.15, -0.5, -0.15, 0.15, 0.15, 0.15 } },
	groups = { dig_immediate = 3, attached_node = 1, torch = 1 },
	sounds = sounds("wood"),
})

------------------------------------------------------------------
-- Liquids
------------------------------------------------------------------
core.register_node("bc_core:water_source", {
	description = S("Water Source"),
	drawtype = "liquid",
	tiles = { "bc_water.png" },
	special_tiles = { { name = "bc_water.png", backface_culling = false } },
	use_texture_alpha = "blend",
	paramtype = "light",
	walkable = false,
	pointable = false,
	diggable = false,
	buildable_to = true,
	is_ground_content = false,
	drowning = 1,
	liquidtype = "source",
	liquid_alternative_flowing = "bc_core:water_flowing",
	liquid_alternative_source = "bc_core:water_source",
	liquid_viscosity = 1,
	post_effect_color = { a = 90, r = 40, g = 90, b = 170 },
	groups = { water = 3, liquid = 3, cools_lava = 1 },
})

core.register_node("bc_core:water_flowing", {
	description = S("Flowing Water"),
	drawtype = "flowingliquid",
	tiles = { "bc_water.png" },
	special_tiles = {
		{ name = "bc_water.png", backface_culling = false },
		{ name = "bc_water.png", backface_culling = true },
	},
	use_texture_alpha = "blend",
	paramtype = "light",
	paramtype2 = "flowingliquid",
	walkable = false,
	pointable = false,
	diggable = false,
	buildable_to = true,
	is_ground_content = false,
	drowning = 1,
	liquidtype = "flowing",
	liquid_alternative_flowing = "bc_core:water_flowing",
	liquid_alternative_source = "bc_core:water_source",
	liquid_viscosity = 1,
	post_effect_color = { a = 90, r = 40, g = 90, b = 170 },
	groups = { water = 3, liquid = 3, not_in_creative_inventory = 1, cools_lava = 1 },
})

core.register_node("bc_core:lava_source", {
	description = S("Lava Source"),
	drawtype = "liquid",
	tiles = { { name = "bc_lava.png", animation = { type = "vertical_frames", aspect_w = 16, aspect_h = 16, length = 3 } } },
	special_tiles = { { name = "bc_lava.png", backface_culling = false } },
	paramtype = "light",
	light_source = 13,
	walkable = false,
	pointable = false,
	diggable = false,
	buildable_to = true,
	is_ground_content = false,
	drowning = 0,
	damage_per_second = 4,
	liquidtype = "source",
	liquid_alternative_flowing = "bc_core:lava_flowing",
	liquid_alternative_source = "bc_core:lava_source",
	liquid_viscosity = 7,
	liquid_renewable = false,
	post_effect_color = { a = 200, r = 220, g = 90, b = 30 },
	groups = { lava = 3, liquid = 2, igniter = 1 },
})

core.register_node("bc_core:lava_flowing", {
	description = S("Flowing Lava"),
	drawtype = "flowingliquid",
	tiles = { "bc_lava.png" },
	special_tiles = {
		{ name = "bc_lava.png", backface_culling = false },
		{ name = "bc_lava.png", backface_culling = true },
	},
	paramtype = "light",
	paramtype2 = "flowingliquid",
	light_source = 13,
	walkable = false,
	pointable = false,
	diggable = false,
	buildable_to = true,
	is_ground_content = false,
	damage_per_second = 4,
	liquidtype = "flowing",
	liquid_alternative_flowing = "bc_core:lava_flowing",
	liquid_alternative_source = "bc_core:lava_source",
	liquid_viscosity = 7,
	liquid_renewable = false,
	post_effect_color = { a = 200, r = 220, g = 90, b = 30 },
	groups = { lava = 3, liquid = 2, igniter = 1, not_in_creative_inventory = 1 },
})

------------------------------------------------------------------
-- Functional blocks: crafting table, furnace, chest
------------------------------------------------------------------
core.register_node("bc_core:crafting_table", {
	description = S("Crafting Table"),
	tiles = {
		"bc_crafting_table_top.png",
		"bc_wood.png",
		"bc_crafting_table_side.png",
		"bc_crafting_table_side.png",
		"bc_crafting_table_front.png",
		"bc_crafting_table_front.png",
	},
	paramtype2 = "facedir",
	groups = { choppy = 2, wood = 1, flammable = 3 },
	sounds = sounds("wood"),
	on_construct = function(pos)
		local meta = core.get_meta(pos)
		meta:set_string("formspec",
			"size[8,9]" ..
			"list[current_name;craft;2,1;3,3;]" ..
			"list[current_name;craftpreview;6,2;1,1;]" ..
			"list[current_player;main;0,5;8,4;]" ..
			"listring[current_name;craft]" ..
			"listring[current_player;main]")
		meta:set_string("infotext", "Crafting Table")
		local inv = meta:get_inventory()
		inv:set_size("craft", 9)
		inv:set_size("craftpreview", 1)
	end,
	on_metadata_inventory_put = function(pos)
		bc_core.update_crafting_preview(pos)
	end,
	on_metadata_inventory_take = function(pos)
		bc_core.update_crafting_preview(pos)
	end,
	can_dig = function(pos)
		local inv = core.get_meta(pos):get_inventory()
		return inv:is_empty("craft")
	end,
})

-- Live 3x3 craft preview for the crafting table
function bc_core.update_crafting_preview(pos)
	local inv = core.get_meta(pos):get_inventory()
	local grid = inv:get_list("craft")
	local output, _ = core.get_craft_result({
		method = "normal",
		width = 3,
		items = grid,
	})
	inv:set_stack("craftpreview", 1, output.item)
end

core.register_node("bc_core:chest", {
	description = S("Chest"),
	tiles = {
		"bc_chest_top.png", "bc_chest_top.png",
		"bc_chest_side.png", "bc_chest_side.png",
		"bc_chest_side.png", "bc_chest_front.png",
	},
	paramtype2 = "facedir",
	legacy_facedir_simple = true,
	groups = { choppy = 2, wood = 1, flammable = 2 },
	sounds = sounds("wood"),
	on_construct = function(pos)
		local meta = core.get_meta(pos)
		meta:set_string("formspec",
			"size[8,9]" ..
			"list[current_name;main;0,0.3;8,4;]" ..
			"list[current_player;main;0,4.85;8,4;]" ..
			"listring[current_name;main]" ..
			"listring[current_player;main]")
		meta:set_string("infotext", "Chest")
		meta:get_inventory():set_size("main", 8 * 4)
	end,
	can_dig = function(pos)
		return core.get_meta(pos):get_inventory():is_empty("main")
	end,
})

-- Furnace (active + inactive) with real smelting logic
local function furnace_formspec(fuel_pct, item_pct)
	return "size[8,9]" ..
		"list[current_name;src;2.75,0.5;1,1;]" ..
		"list[current_name;fuel;2.75,2.5;1,1;]" ..
		string.format("image[2.75,1.5;1,1;bc_furnace_fire_bg.png^[lowpart:%d:bc_furnace_fire_fg.png]", fuel_pct) ..
		string.format("image[3.75,1.5;1,1;bc_arrow_bg.png^[lowpart:%d:bc_arrow_fg.png^[transformR270]]", item_pct) ..
		"list[current_name;dst;4.75,0.96;2,2;]" ..
		"list[current_player;main;0,5;8,4;]" ..
		"listring[current_name;dst]" ..
		"listring[current_player;main]" ..
		"listring[current_name;src]" ..
		"listring[current_player;main]"
end

local function register_furnace(name, active)
	local front = active and "bc_furnace_front_active.png" or "bc_furnace_front.png"
	core.register_node(name, {
		description = S("Furnace"),
		tiles = {
			"bc_furnace_top.png", "bc_furnace_top.png",
			"bc_furnace_side.png", "bc_furnace_side.png",
			"bc_furnace_side.png", front,
		},
		paramtype2 = "facedir",
		light_source = active and 8 or 0,
		drop = "bc_core:furnace",
		groups = {
			cracky = 2,
			not_in_creative_inventory = active and 1 or nil,
		},
		legacy_facedir_simple = true,
		sounds = sounds("stone"),
		on_construct = function(pos)
			local meta = core.get_meta(pos)
			meta:set_string("formspec", furnace_formspec(0, 0))
			meta:set_string("infotext", "Furnace (inactive)")
			local inv = meta:get_inventory()
			inv:set_size("src", 1)
			inv:set_size("fuel", 1)
			inv:set_size("dst", 4)
		end,
		can_dig = function(pos)
			local inv = core.get_meta(pos):get_inventory()
			return inv:is_empty("src") and inv:is_empty("fuel") and inv:is_empty("dst")
		end,
	})
end

register_furnace("bc_core:furnace", false)
register_furnace("bc_core:furnace_active", true)

-- Furnace tick: consumes fuel to smelt sources into results.
core.register_abm({
	label = "bc_core furnace smelting",
	nodenames = { "bc_core:furnace", "bc_core:furnace_active" },
	interval = 1.0,
	chance = 1,
	action = function(pos, node)
		local meta = core.get_meta(pos)
		local inv = meta:get_inventory()

		local fuel_time = meta:get_float("fuel_time") or 0
		local fuel_totaltime = meta:get_float("fuel_totaltime") or 0
		local src_time = meta:get_float("src_time") or 0

		local cooked, aftercooked = core.get_craft_result({
			method = "cooking", width = 1, items = inv:get_list("src"),
		})
		local has_input = cooked.item and not cooked.item:is_empty()

		if fuel_time < fuel_totaltime then
			-- currently burning
			fuel_time = fuel_time + 1
			if has_input then
				src_time = src_time + 1
				if src_time >= cooked.time then
					if inv:room_for_item("dst", cooked.item) then
						inv:add_item("dst", cooked.item)
						inv:set_stack("src", 1, aftercooked.items[1])
					end
					src_time = 0
				end
			else
				src_time = 0
			end
		else
			-- need new fuel
			if has_input then
				local fuel, afterfuel = core.get_craft_result({
					method = "fuel", width = 1, items = inv:get_list("fuel"),
				})
				if fuel.time > 0 then
					fuel_totaltime = fuel.time
					fuel_time = 0
					inv:set_stack("fuel", 1, afterfuel.items[1])
				end
			end
		end

		local active = fuel_time < fuel_totaltime
		local target = active and "bc_core:furnace_active" or "bc_core:furnace"
		if node.name ~= target then
			core.swap_node(pos, { name = target, param2 = node.param2 })
		end

		local fuel_pct = fuel_totaltime > 0 and (100 - math.floor(fuel_time / fuel_totaltime * 100)) or 0
		local item_pct = (has_input and cooked.time > 0) and math.floor(src_time / cooked.time * 100) or 0
		meta:set_string("formspec", furnace_formspec(fuel_pct, item_pct))
		meta:set_string("infotext", active and "Furnace (active)" or "Furnace (inactive)")
		meta:set_float("fuel_time", fuel_time)
		meta:set_float("fuel_totaltime", fuel_totaltime)
		meta:set_float("src_time", src_time)
	end,
})

------------------------------------------------------------------
-- Fuels
------------------------------------------------------------------
core.register_craft({ type = "fuel", recipe = "bc_core:coal_lump", burntime = 40 })
core.register_craft({ type = "fuel", recipe = "bc_core:coalblock", burntime = 370 })
core.register_craft({ type = "fuel", recipe = "bc_core:tree", burntime = 30 })
core.register_craft({ type = "fuel", recipe = "bc_core:wood", burntime = 7 })
core.register_craft({ type = "fuel", recipe = "bc_core:stick", burntime = 3 })
core.register_craft({ type = "fuel", recipe = "bc_core:sapling", burntime = 3 })
core.register_craft({ type = "fuel", recipe = "bc_core:leaves", burntime = 1 })
core.register_craft({ type = "fuel", recipe = "bc_core:crafting_table", burntime = 15 })

------------------------------------------------------------------
-- Cooking recipes (used by the furnace)
------------------------------------------------------------------
core.register_craft({ type = "cooking", output = "bc_core:steel_ingot", recipe = "bc_core:iron_lump", cooktime = 3 })
core.register_craft({ type = "cooking", output = "bc_core:gold_ingot", recipe = "bc_core:gold_lump", cooktime = 3 })
core.register_craft({ type = "cooking", output = "bc_core:glass", recipe = "bc_core:sand", cooktime = 3 })
core.register_craft({ type = "cooking", output = "bc_core:stone", recipe = "bc_core:cobble", cooktime = 3 })
core.register_craft({ type = "cooking", output = "bc_core:brick", recipe = "bc_core:clay", cooktime = 4 })

------------------------------------------------------------------
-- Falling nodes (sand/gravel/snow) & node liquids
------------------------------------------------------------------
core.register_on_mods_loaded(function()
	-- nothing yet; hook reserved for cross-mod adjustments
end)
