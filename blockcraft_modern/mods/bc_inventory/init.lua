--[[
	BlockCraft Modern - Survival player inventory

	Gives every player a real inventory (opened with the inventory key):
	an 8x4 main grid (top row = hotbar) plus a 2x2 personal crafting grid.
	The engine natively resolves crafting in the reserved "craft" /
	"craftpreview" player lists, so we only lay out the formspec and sizes.
]]

local function formspec()
	return table.concat({
		"formspec_version[4]",
		"size[10.5,10.5]",
		-- 2x2 personal crafting grid + arrow + result
		"label[3.2,0.6;Crafting]",
		"list[current_player;craft;3.2,1.0;2,2;]",
		"image[5.5,1.6;1,1;bc_arrow_bg.png^[transformR270]",
		"list[current_player;craftpreview;6.8,1.6;1,1;]",
		-- main inventory
		"list[current_player;main;0.5,4.0;8,4;]",
		-- hotbar highlight row separation
		"box[0.4,3.9;8.2,1.1;#5552]",
		"listring[current_player;main]",
		"listring[current_player;craft]",
	})
end

core.register_on_joinplayer(function(player)
	local inv = player:get_inventory()
	inv:set_size("main", 8 * 4)
	inv:set_size("craft", 4)          -- 2x2
	inv:set_size("craftpreview", 1)
	player:set_inventory_formspec(formspec())
	player:hud_set_hotbar_itemcount(8)
end)

-- Return leftover crafting-grid items to the main inventory on leave so
-- nothing gets lost when a player logs out with items in the grid.
core.register_on_leaveplayer(function(player)
	local inv = player:get_inventory()
	for i = 1, inv:get_size("craft") do
		local stack = inv:get_stack("craft", i)
		if not stack:is_empty() then
			if inv:room_for_item("main", stack) then
				inv:add_item("main", stack)
			else
				core.add_item(player:get_pos(), stack)
			end
			inv:set_stack("craft", i, "")
		end
	end
end)

core.log("action", "[bc_inventory] survival inventory ready")
