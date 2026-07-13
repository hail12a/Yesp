--[[
	BlockCraft Modern - custom Bedrock-style main menu.

	Installed by tools/assemble_standalone.sh as builtin/mainmenu/init.lua in
	the standalone build (the original is kept as init.lua.orig, and
	RESTORE_DEFAULT_MENU.bat puts it back). It uses ONLY the low-level main
	menu API (core.update_formspec / core.button_handler / core.get_worlds /
	core.create_world / gamedata + core.start), so it is fully self-contained
	and does not depend on the engine's default menu code.

	Screens:
	  title  -> logo + Play / Multiplayer / Quit
	  worlds -> world list, Create New World, Play, Back (singleplayer)
	  create -> name a new world
	  mp     -> connect to a server (multiplayer)
]]

local SEP = rawget(_G, "DIR_DELIM") or "/"
local PACK = core.get_texturepath_share() .. SEP .. "base" .. SEP .. "pack" .. SEP

local function esc(s) return core.formspec_escape(tostring(s)) end

-- Resolve our game id (only one game is installed, but be defensive).
local GAMEID = "blockcraft_modern"
do
	local games = core.get_games() or {}
	local ok = false
	for _, g in ipairs(games) do
		if g.id == GAMEID then ok = true break end
	end
	if not ok and games[1] then GAMEID = games[1].id end
end

local screen = "title"
local status = ""
local sel_row = 1
local mp = { addr = "", port = "30000", name = "Player" }
local new_creative = false
local new_damage = true

local W, H = 15.5, 10

-- Worlds belonging to our game, keeping the raw index core.start() expects.
local function our_worlds()
	local list = {}
	for i, w in ipairs(core.get_worlds() or {}) do
		if w.gameid == GAMEID then
			list[#list + 1] = { raw = i, name = w.name }
		end
	end
	return list
end

----------------------------------------------------------------------
-- Formspec builders
----------------------------------------------------------------------
local function base_prepend()
	return table.concat({
		"formspec_version[4]",
		"size[", W, ",", H, "]",
		"bgcolor[#00000000;true]",
		-- panel + button theme (Bedrock-ish: flat, green primary)
		"style_type[button;bgcolor=#5a5a5aff;textcolor=#ffffff;border=false]",
		"style_type[button:hovered;bgcolor=#6f6f6fff]",
		"style_type[button:pressed;bgcolor=#484848ff]",
	})
end

local function status_label(y)
	if status == "" then return "" end
	return table.concat({ "label[0.4,", y, ";", esc(status), "]" })
end

local function fs_title()
	return table.concat({
		base_prepend(),
		"image[", W / 2 - 3.2, ",0.5;6.4,3.2;", esc(PACK .. "logo.png"), "]",
		"style[play;bgcolor=#43a047ff]",
		"style[play:hovered;bgcolor=#4cbb51ff]",
		"button[", W / 2 - 3, ",4.4;6,1.3;play;Play]",
		"button[", W / 2 - 3, ",6.0;6,1.0;multiplayer;Multiplayer]",
		"button[", W / 2 - 3, ",7.2;6,1.0;quit;Quit]",
		"label[0.4,", H - 0.35, ";", esc("BlockCraft Modern  •  built on the Luanti engine"), "]",
		status_label(H - 0.9),
	})
end

local function fs_worlds()
	local worlds = our_worlds()
	local items = {}
	for _, w in ipairs(worlds) do items[#items + 1] = esc(w.name) end
	if sel_row > #worlds then sel_row = math.max(1, #worlds) end
	return table.concat({
		base_prepend(),
		"image[0.5,0.3;3.4,1.7;", esc(PACK .. "logo.png"), "]",
		"label[6.2,1.0;", esc("Select World"), "]",
		"box[0.5,2.3;", W - 1, ",5.2;#0000008c]",
		(#items > 0)
			and table.concat({ "textlist[0.7,2.5;", W - 1.4, ",4.8;worlds;",
				table.concat(items, ","), ";", sel_row, ";false]" })
			or  "label[0.9,4.6;No worlds yet — click 'Create New World'.]",
		"checkbox[0.7,7.9;cb_creative;Creative Mode;", tostring(new_creative), "]",
		"checkbox[4.0,7.9;cb_damage;Enable Damage;", tostring(new_damage), "]",
		"button[0.5,8.4;3.6,1.0;create;Create New World]",
		"style[play;bgcolor=#43a047ff]",
		"button[", W - 4.1, ",8.4;3.6,1.0;play_world;Play]",
		"button[", W - 8.0, ",8.4;3.6,1.0;back;Back]",
		status_label(9.6),
	})
end

local function fs_create()
	return table.concat({
		base_prepend(),
		"label[0.6,0.8;", esc("Create New World"), "]",
		"field[0.6,1.6;7,0.9;te_name;World name;]",
		"field_close_on_enter[te_name;false]",
		"checkbox[0.7,3.0;cb_creative;Creative Mode;", tostring(new_creative), "]",
		"checkbox[4.0,3.0;cb_damage;Enable Damage;", tostring(new_damage), "]",
		"style[do_create;bgcolor=#43a047ff]",
		"button[0.6,4.2;3.4,1.0;do_create;Create]",
		"button[4.2,4.2;3.4,1.0;back;Cancel]",
		status_label(5.6),
	})
end

local function fs_mp()
	return table.concat({
		base_prepend(),
		"label[0.6,0.8;", esc("Multiplayer — Join Server"), "]",
		"field[0.6,1.7;7,0.9;te_addr;Address;", esc(mp.addr), "]",
		"field[7.8,1.7;3,0.9;te_port;Port;", esc(mp.port), "]",
		"field[0.6,3.0;7,0.9;te_name;Name;", esc(mp.name), "]",
		"style[connect;bgcolor=#43a047ff]",
		"button[0.6,4.2;3.4,1.0;connect;Connect]",
		"button[4.2,4.2;3.4,1.0;back;Back]",
		status_label(5.6),
	})
end

local function refresh()
	local fs
	if screen == "worlds" then fs = fs_worlds()
	elseif screen == "create" then fs = fs_create()
	elseif screen == "mp" then fs = fs_mp()
	else fs = fs_title() end
	core.update_formspec(fs)
end

----------------------------------------------------------------------
-- Actions
----------------------------------------------------------------------
local function play_selected()
	local worlds = our_worlds()
	local w = worlds[sel_row]
	if not w then
		status = "Select a world first (or create one)."
		return refresh()
	end
	core.settings:set("menu_last_game", GAMEID)
	core.settings:set_bool("creative_mode", new_creative)
	core.settings:set_bool("enable_damage", new_damage)
	gamedata.selected_world = w.raw
	gamedata.singleplayer = true
	gamedata.playername = "Player"
	core.start()
end

local function create_world_now(name)
	name = (name or ""):trim()
	if name == "" then
		-- auto-name world1, world2, ...
		local n = 0
		for _, w in ipairs(our_worlds()) do
			local num = tostring(w.name):match("^world(%d+)$")
			if num then n = math.max(n, tonumber(num)) end
		end
		name = "world" .. (n + 1)
	end
	local msg = core.create_world(name, GAMEID, { mg_name = "v7", fixed_map_seed = "" })
	if msg then
		status = "Could not create world: " .. tostring(msg)
		screen = "create"
		return refresh()
	end
	status = ""
	screen = "worlds"
	sel_row = #our_worlds()
	refresh()
end

----------------------------------------------------------------------
-- Engine callbacks
----------------------------------------------------------------------
function core.button_handler(fields)
	-- persist toggles wherever they appear
	if fields.cb_creative ~= nil then new_creative = (fields.cb_creative == "true") end
	if fields.cb_damage ~= nil then new_damage = (fields.cb_damage == "true") end

	if screen == "title" then
		if fields.play then status = ""; screen = "worlds"; return refresh() end
		if fields.multiplayer then status = ""; screen = "mp"; return refresh() end
		if fields.quit then return core.close() end

	elseif screen == "worlds" then
		if fields.worlds then
			local ev = core.explode_textlist_event(fields.worlds)
			if ev.index then sel_row = ev.index end
			if ev.type == "DCL" then return play_selected() end
			return refresh()
		end
		if fields.create then status = ""; screen = "create"; return refresh() end
		if fields.play_world or fields.key_enter then return play_selected() end
		if fields.back then status = ""; screen = "title"; return refresh() end

	elseif screen == "create" then
		if fields.do_create or fields.key_enter then
			return create_world_now(fields.te_name)
		end
		if fields.back then status = ""; screen = "worlds"; return refresh() end

	elseif screen == "mp" then
		if fields.te_addr then mp.addr = fields.te_addr end
		if fields.te_port then mp.port = fields.te_port end
		if fields.te_name then mp.name = fields.te_name end
		if fields.connect then
			if (mp.addr or "") == "" then
				status = "Enter a server address."
				return refresh()
			end
			gamedata.selected_world = 0
			gamedata.singleplayer = false
			gamedata.address = mp.addr
			gamedata.port = mp.port
			gamedata.playername = (mp.name ~= "" and mp.name) or "Player"
			core.settings:set("address", mp.addr)
			core.settings:set("remote_port", mp.port)
			core.start()
			return
		end
		if fields.back then status = ""; screen = "title"; return refresh() end
	end
end

function core.event_handler(event)
	if event == "MenuQuit" then
		if screen ~= "title" then
			screen = "title"
			status = ""
			refresh()
		else
			core.close()
		end
	end
end

-- Ambience + first paint
core.set_clouds(true)
pcall(function() core.set_background("background", PACK .. "bc_menu_bg.png") end)
core.set_topleft_text("BlockCraft Modern")
refresh()
