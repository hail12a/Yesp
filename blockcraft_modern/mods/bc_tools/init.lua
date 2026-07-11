--[[
	BlockCraft Modern - Tools
	Five material tiers (wood, stone, steel, gold, diamond) x
	four tool types (pickaxe, axe, shovel, sword).

	Digging groups used by bc_core nodes:
	  cracky   -> pickaxe   (stone, ores, metal)
	  choppy   -> axe       (wood, trees)
	  crumbly  -> shovel    (dirt, sand, gravel)
	  snappy   -> sword     (leaves, plants; also combat)
]]

-- Per-tier balance. Higher tier = faster digging, higher max drop level,
-- more uses (uses), and stronger swords (damage).
local tiers = {
	wood    = { times = 3.0, level = 1, uses = 60,   dmg = 2, full_punch = 1.0 },
	stone   = { times = 2.0, level = 1, uses = 132,  dmg = 4, full_punch = 1.0 },
	steel   = { times = 1.5, level = 2, uses = 251,  dmg = 5, full_punch = 0.9 },
	gold    = { times = 0.9, level = 2, uses = 33,   dmg = 4, full_punch = 0.7 },
	diamond = { times = 1.0, level = 3, uses = 1562, dmg = 6, full_punch = 0.8 },
}

-- Build a groupcaps table for a dig group at a given tier speed/level/uses.
local function groupcaps(group, t)
	return {
		[group] = {
			maxlevel = t.level,
			uses = t.uses,
			times = {
				[1] = t.times * 1.60,
				[2] = t.times * 1.20,
				[3] = t.times * 0.80,
			},
		},
	}
end

local function reg_tool(tier, kind, group, def)
	local t = tiers[tier]
	local name = "bc_tools:" .. tier .. "_" .. kind
	local capitalize = kind:sub(1, 1):upper() .. kind:sub(2)
	local tier_cap = tier:sub(1, 1):upper() .. tier:sub(2)
	core.register_tool(name, {
		description = tier_cap .. " " .. capitalize,
		inventory_image = "bc_" .. tier .. "_" .. kind .. ".png",
		tool_capabilities = def,
		groups = { ["tool_" .. kind] = 1, ["tier_" .. tier] = 1 },
	})
	return name
end

for tier, t in pairs(tiers) do
	-- Pickaxe: digs cracky
	reg_tool(tier, "pick", "cracky", {
		full_punch_interval = t.full_punch,
		max_drop_level = t.level,
		groupcaps = groupcaps("cracky", t),
		damage_groups = { fleshy = t.dmg - 1 },
	})

	-- Axe: digs choppy
	reg_tool(tier, "axe", "choppy", {
		full_punch_interval = t.full_punch,
		max_drop_level = t.level,
		groupcaps = groupcaps("choppy", t),
		damage_groups = { fleshy = t.dmg },
	})

	-- Shovel: digs crumbly
	reg_tool(tier, "shovel", "crumbly", {
		full_punch_interval = t.full_punch,
		max_drop_level = t.level,
		groupcaps = groupcaps("crumbly", t),
		damage_groups = { fleshy = t.dmg - 1 },
	})

	-- Sword: digs snappy fast, strong in combat
	reg_tool(tier, "sword", "snappy", {
		full_punch_interval = t.full_punch * 0.8,
		max_drop_level = t.level,
		groupcaps = {
			snappy = { maxlevel = t.level, uses = t.uses, times = { [1] = t.times * 0.8, [2] = t.times * 0.5, [3] = t.times * 0.3 } },
		},
		damage_groups = { fleshy = t.dmg + 2 },
	})
end

------------------------------------------------------------------
-- Bare-hand capabilities (slow, low level)
------------------------------------------------------------------
core.register_item(":", {
	type = "none",
	wield_scale = { x = 1, y = 1, z = 2.5 },
	tool_capabilities = {
		full_punch_interval = 0.9,
		max_drop_level = 0,
		groupcaps = {
			crumbly = { maxlevel = 0, uses = 0, times = { [2] = 3.0, [3] = 0.7 } },
			snappy = { maxlevel = 0, uses = 0, times = { [3] = 0.4 } },
			oddly_breakable_by_hand = { maxlevel = 0, uses = 0, times = { [1] = 3.5, [2] = 2.0, [3] = 0.7 } },
		},
		damage_groups = { fleshy = 1 },
	},
})

core.log("action", "[bc_tools] Tools loaded (5 tiers x 4 types)")
