--[[
	BlockCraft Modern - Crafting recipes
]]

local C = core.register_craft

------------------------------------------------------------------
-- Wood processing
------------------------------------------------------------------
C({ output = "bc_core:wood 4", recipe = { { "bc_core:tree" } } })

C({ output = "bc_core:stick 4", recipe = { { "bc_core:wood" }, { "bc_core:wood" } } })

C({
	output = "bc_core:crafting_table",
	recipe = {
		{ "bc_core:wood", "bc_core:wood" },
		{ "bc_core:wood", "bc_core:wood" },
	},
})

C({
	output = "bc_core:chest",
	recipe = {
		{ "bc_core:wood", "bc_core:wood", "bc_core:wood" },
		{ "bc_core:wood", "",             "bc_core:wood" },
		{ "bc_core:wood", "bc_core:wood", "bc_core:wood" },
	},
})

------------------------------------------------------------------
-- Stone processing
------------------------------------------------------------------
C({
	output = "bc_core:furnace",
	recipe = {
		{ "bc_core:cobble", "bc_core:cobble", "bc_core:cobble" },
		{ "bc_core:cobble", "",               "bc_core:cobble" },
		{ "bc_core:cobble", "bc_core:cobble", "bc_core:cobble" },
	},
})

C({
	output = "bc_core:stonebrick 4",
	recipe = {
		{ "bc_core:stone", "bc_core:stone" },
		{ "bc_core:stone", "bc_core:stone" },
	},
})

C({
	output = "bc_core:brick",
	recipe = {
		{ "bc_core:clay_lump", "bc_core:clay_lump" },
		{ "bc_core:clay_lump", "bc_core:clay_lump" },
	},
})

------------------------------------------------------------------
-- Lights
------------------------------------------------------------------
C({
	output = "bc_core:torch 4",
	recipe = {
		{ "bc_core:coal_lump" },
		{ "bc_core:stick" },
	},
})

------------------------------------------------------------------
-- Mineral compression / decompression
------------------------------------------------------------------
local function block_recipes(item, block)
	C({
		output = block,
		recipe = {
			{ item, item, item },
			{ item, item, item },
			{ item, item, item },
		},
	})
	C({ output = item .. " 9", recipe = { { block } } })
end

block_recipes("bc_core:coal_lump", "bc_core:coalblock")
block_recipes("bc_core:steel_ingot", "bc_core:steelblock")
block_recipes("bc_core:gold_ingot", "bc_core:goldblock")
block_recipes("bc_core:diamond", "bc_core:diamondblock")

------------------------------------------------------------------
-- Tools: material x shape
--   pick:   XXX / .S. / .S.
--   axe:    XX / XS / .S
--   shovel: X / S / S
--   sword:  X / X / S
------------------------------------------------------------------
local mat_item = {
	wood    = "bc_core:wood",
	stone   = "bc_core:cobble",
	steel   = "bc_core:steel_ingot",
	gold    = "bc_core:gold_ingot",
	diamond = "bc_core:diamond",
}

for tier, X in pairs(mat_item) do
	local S = "bc_core:stick"
	C({ output = "bc_tools:" .. tier .. "_pick", recipe = {
		{ X, X, X }, { "", S, "" }, { "", S, "" } } })
	C({ output = "bc_tools:" .. tier .. "_axe", recipe = {
		{ X, X }, { X, S }, { "", S } } })
	C({ output = "bc_tools:" .. tier .. "_shovel", recipe = {
		{ X }, { S }, { S } } })
	C({ output = "bc_tools:" .. tier .. "_sword", recipe = {
		{ X }, { X }, { S } } })
end

core.log("action", "[bc_crafting] Recipes registered")
