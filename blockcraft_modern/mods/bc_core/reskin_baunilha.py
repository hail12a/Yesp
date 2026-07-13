#!/usr/bin/env python3
"""
Reskin BlockCraft Modern's block/item/tool textures using the Baunilha
texture pack (16x16, CC BY-SA / LGPL / CC0). Overwrites the bc_*.png files
our mod code already references, so no Lua changes are needed.

Ores and the crafting table are composited from base + overlay.
Procedural-only assets (bedrock, furnace gauges, arrows, menu) are left
untouched — they are produced by gen_textures.py.
"""
#
# Usage:  python3 reskin_baunilha.py /path/to/minetest_game_textures_folder
#
# The pack folder must contain 16x16 Minetest-Game-named textures
# (default_stone.png, default_tool_diamondpick.png, default_mineral_coal.png ...).
# The Baunilha texture pack provides these.
import os
import sys
from PIL import Image

_here = os.path.dirname(os.path.abspath(__file__))
POOL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(_here, "pack_src")
OUT = os.path.normpath(os.path.join(_here, "textures"))


def load(name):
    return Image.open(os.path.join(POOL, name + ".png")).convert("RGBA")


def save(img, bc_name):
    img.save(os.path.join(OUT, bc_name + ".png"))


def copy(bc_name, src):
    save(load(src), bc_name)


def overlay(base, top):
    b = load(base).copy()
    t = load(top)
    b.alpha_composite(t)
    return b


# ---- Direct 1:1 copies ------------------------------------------------
direct = {
    "bc_stone": "default_stone",
    "bc_cobble": "default_cobble",
    "bc_dirt": "default_dirt",
    "bc_grass_top": "default_grass",
    "bc_grass_side": "default_grass_side",
    "bc_sand": "default_sand",
    "bc_desert_sand": "default_desert_sand",
    "bc_sandstone": "default_sandstone",
    "bc_desert_stone": "default_desert_stone",
    "bc_desert_cobble": "default_desert_cobble",
    "bc_gravel": "default_gravel",
    "bc_clay": "default_clay",
    "bc_snow": "default_snow",
    "bc_snowblock": "default_snow",          # no dedicated snowblock in pool
    "bc_ice": "default_ice",
    "bc_permafrost": "default_permafrost",
    "bc_dirt_with_snow_side": "default_snow_side",
    "bc_tree": "default_tree",
    "bc_tree_top": "default_tree_top",
    "bc_wood": "default_wood",
    "bc_leaves": "default_leaves",
    "bc_sapling": "default_sapling",
    "bc_tallgrass": "default_grass_1",
    "bc_glass": "default_glass",
    "bc_brick": "default_brick",
    "bc_coalblock": "default_coal_block",
    "bc_steelblock": "default_steel_block",
    "bc_goldblock": "default_gold_block",
    "bc_diamondblock": "default_diamond_block",
    "bc_torch": "default_torch_on_floor",
    "bc_water": "default_water",
    "bc_lava": "default_lava",
    "bc_furnace_top": "default_furnace_top",
    "bc_furnace_side": "default_furnace_side",
    "bc_furnace_front": "default_furnace_front",
    "bc_furnace_front_active": "default_furnace_front_active",
    "bc_chest_top": "default_chest_top",
    "bc_chest_side": "default_chest_side",
    "bc_chest_front": "default_chest_front",
    "bc_stick": "default_stick",
    "bc_coal_lump": "default_coal_lump",
    "bc_iron_lump": "default_iron_lump",
    "bc_steel_ingot": "default_steel_ingot",
    "bc_gold_lump": "default_gold_lump",
    "bc_gold_ingot": "default_gold_ingot",
    "bc_diamond": "default_diamond",
    "bc_clay_lump": "default_clay_lump",
    "bc_apple": "default_apple",
}
for bc, src in direct.items():
    copy(bc, src)

# ---- Ores: stone base + mineral overlay ------------------------------
ores = {
    "bc_coal_ore": "default_mineral_coal",
    "bc_iron_ore": "default_mineral_iron",
    "bc_gold_ore": "default_mineral_gold",
    "bc_diamond_ore": "default_mineral_diamond",
}
for bc, mineral in ores.items():
    save(overlay("default_stone", mineral), bc)

# ---- Crafting table: real wood + drawn grid --------------------------
wood = load("default_wood")


def craft_top():
    img = wood.copy()
    px = img.load()
    dark = (86, 62, 34, 255)
    for i in range(16):
        px[i, 5] = dark; px[i, 10] = dark
        px[5, i] = dark; px[10, i] = dark
    return img


def craft_front():
    img = wood.copy()
    px = img.load()
    dark = (86, 62, 34, 255)
    for x in range(3, 13):
        px[x, 4] = dark; px[x, 12] = dark
    for y in range(4, 13):
        px[3, y] = dark; px[12, y] = dark
    px[7, 8] = (200, 200, 60, 255)
    return img


save(craft_top(), "bc_crafting_table_top")
save(craft_front(), "bc_crafting_table_front")
save(wood.copy(), "bc_crafting_table_side")

# ---- Tools: 5 tiers x 4 types (gold -> bronze art) -------------------
tool_tier = {"wood": "wood", "stone": "stone", "steel": "steel",
             "gold": "bronze", "diamond": "diamond"}
for bc_tier, art in tool_tier.items():
    for kind in ("pick", "axe", "shovel", "sword"):
        copy("bc_%s_%s" % (bc_tier, kind), "default_tool_%s%s" % (art, kind))

# ---- Nicer menu icon from the real grass block -----------------------
def menu_icon():
    grass_top = load("default_grass").resize((56, 20), Image.NEAREST)
    dirt = load("default_dirt").resize((56, 36), Image.NEAREST)
    img = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    img.paste(dirt, (20, 44))
    img.paste(grass_top, (20, 30))
    return img


menu_icon().save(os.path.normpath(os.path.join(_here, "..", "..", "menu", "icon.png")))

n = len(direct) + len(ores) + 3 + 20
print("Reskinned %d textures from Baunilha into %s" % (n, OUT))
