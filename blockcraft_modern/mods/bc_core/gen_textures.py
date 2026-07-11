#!/usr/bin/env python3
"""
Procedural 16x16 pixel-art texture generator for BlockCraft Modern.
Deterministic (seeded) so regenerating gives identical output.
Run:  python3 gen_textures.py
Outputs PNGs into ./textures/

NOTE ON SHIPPED ART:
    The textures currently committed for blocks, items and tools come from
    the Baunilha texture pack (see ATTRIBUTION.md), applied via
    reskin_baunilha.py. This script generates the ORIGINAL, self-contained
    procedural placeholder set — useful as an offline fallback when no
    texture pack is available. Re-running it will REPLACE the Baunilha art
    with procedural placeholders; run reskin_baunilha.py afterwards to
    restore the pack look. The procedural-only assets that are always kept
    (bedrock, furnace fuel/arrow gauges, menu background) are produced here.
"""
import os
import random
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures")
os.makedirs(OUT, exist_ok=True)
S = 16  # texture size


def rng(seed):
    r = random.Random()
    r.seed(seed)
    return r


def clamp(v):
    return max(0, min(255, int(v)))


def shade(color, amt):
    return (clamp(color[0] + amt), clamp(color[1] + amt), clamp(color[2] + amt),
            color[3] if len(color) > 3 else 255)


def new_img():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


def save(img, name):
    img.save(os.path.join(OUT, name))


def noise_fill(base, seed, spread=18, alpha=255):
    """Solid block with speckled brightness noise."""
    img = new_img()
    r = rng(seed)
    px = img.load()
    for y in range(S):
        for x in range(S):
            a = r.randint(-spread, spread)
            c = shade(base, a)
            px[x, y] = (c[0], c[1], c[2], alpha)
    return img


def speckle(img, seed, color, count, size=1):
    r = rng(seed)
    px = img.load()
    for _ in range(count):
        x = r.randint(0, S - size)
        y = r.randint(0, S - size)
        for dx in range(size):
            for dy in range(size):
                c = shade(color, r.randint(-15, 15))
                px[x + dx, y + dy] = (c[0], c[1], c[2], 255)
    return img


# ---- Basic terrain -------------------------------------------------
save(noise_fill((128, 128, 132), "stone", 14), "bc_stone.png")
save(noise_fill((134, 96, 62), "dirt", 16), "bc_dirt.png")
save(noise_fill((92, 160, 74), "grasstop", 16), "bc_grass_top.png")
save(noise_fill((222, 205, 148), "sand", 12), "bc_sand.png")
save(noise_fill((214, 176, 92), "desertsand", 12), "bc_desert_sand.png")
save(noise_fill((156, 88, 66), "desertstone", 12), "bc_desert_stone.png")
save(noise_fill((150, 116, 82), "clay", 8), "bc_clay.png")
save(noise_fill((236, 244, 250), "snow", 8), "bc_snow.png")
save(noise_fill((236, 244, 250), "snowblock", 6), "bc_snowblock.png")
save(noise_fill((70, 74, 92), "permafrost", 12), "bc_permafrost.png")


# grass side: dirt with a green top band + fringe
def grass_side():
    img = noise_fill((134, 96, 62), "grassside", 16)
    r = rng("grassfringe")
    px = img.load()
    for x in range(S):
        top = 3 + r.randint(0, 2)
        for y in range(top + 1):
            c = shade((92, 160, 74), r.randint(-16, 16))
            px[x, y] = (c[0], c[1], c[2], 255)
    return img


save(grass_side(), "bc_grass_side.png")


def snow_side():
    img = noise_fill((134, 96, 62), "snowside", 16)
    r = rng("snowfringe")
    px = img.load()
    for x in range(S):
        top = 4 + r.randint(0, 2)
        for y in range(top + 1):
            c = shade((236, 244, 250), r.randint(-8, 8))
            px[x, y] = (c[0], c[1], c[2], 255)
    return img


save(snow_side(), "bc_dirt_with_snow_side.png")


# gravel: pebbly
def gravel():
    img = noise_fill((120, 116, 112), "gravel", 20)
    speckle(img, "gravel2", (150, 146, 140), 40)
    speckle(img, "gravel3", (86, 82, 78), 40)
    return img


save(gravel(), "bc_gravel.png")


# cobble: irregular stones with dark mortar
def cobble(base=(120, 120, 124), seed="cobble"):
    img = noise_fill(base, seed, 10)
    r = rng(seed + "mortar")
    px = img.load()
    # dark mortar grid, jittered
    for i in range(0, S, 8):
        for y in range(S):
            xx = min(S - 1, i + r.randint(-1, 1))
            px[xx, y] = shade(base, -55)
    for j in range(0, S, 8):
        for x in range(S):
            yy = min(S - 1, j + r.randint(-1, 1))
            px[x, yy] = shade(base, -55)
    return img


save(cobble(), "bc_cobble.png")
save(cobble((150, 92, 72), "desertcobble"), "bc_desert_cobble.png")


# sandstone: horizontal layers
def sandstone():
    img = noise_fill((222, 205, 148), "sandstone", 6)
    px = img.load()
    for y in range(0, S, 4):
        for x in range(S):
            px[x, y] = shade((222, 205, 148), -26)
    return img


save(sandstone(), "bc_sandstone.png")


# bedrock: chaotic dark
save(speckle(noise_fill((58, 58, 62), "bedrock", 22), "bedrock2", (28, 28, 30), 70), "bc_bedrock.png")


# ---- Wood ----------------------------------------------------------
def planks():
    img = noise_fill((168, 132, 78), "planks", 8)
    px = img.load()
    r = rng("planklines")
    for y in (0, 8):
        for x in range(S):
            px[x, y] = shade((168, 132, 78), -40)
    for y in range(S):
        for x in (0, 8):
            xx = x
            px[xx, y] = shade((168, 132, 78), -30)
    return img


save(planks(), "bc_wood.png")


def log_side():
    img = noise_fill((96, 68, 42), "logside", 8)
    px = img.load()
    r = rng("bark")
    for x in range(S):
        streak = r.randint(-22, 6)
        for y in range(S):
            c = shade((96, 68, 42), streak + r.randint(-6, 6))
            px[x, y] = (c[0], c[1], c[2], 255)
    return img


save(log_side(), "bc_tree.png")


def log_top():
    img = noise_fill((150, 116, 72), "logtop", 6)
    px = img.load()
    cx = cy = 7.5
    for y in range(S):
        for x in range(S):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            ring = int(d) % 3
            base = (150, 116, 72) if ring else (120, 90, 56)
            px[x, y] = (base[0], base[1], base[2], 255)
    return img


save(log_top(), "bc_tree_top.png")


def leaves():
    img = noise_fill((54, 118, 48), "leaves", 22, alpha=255)
    speckle(img, "leaves2", (38, 92, 36), 60)
    speckle(img, "leaves3", (74, 140, 62), 40)
    # punch a few transparent holes
    r = rng("leafholes")
    px = img.load()
    for _ in range(10):
        x, y = r.randint(0, S - 1), r.randint(0, S - 1)
        px[x, y] = (0, 0, 0, 0)
    return img


save(leaves(), "bc_leaves.png")


# ---- Glass ---------------------------------------------------------
def glass():
    img = new_img()
    px = img.load()
    for y in range(S):
        for x in range(S):
            edge = x in (0, S - 1) or y in (0, S - 1)
            if edge:
                px[x, y] = (200, 224, 232, 200)
            else:
                px[x, y] = (210, 232, 240, 40)
    # highlight streak
    for i in range(4):
        px[2 + i, 2 + i] = (255, 255, 255, 150)
    return img


save(glass(), "bc_glass.png")


# ---- Ores ----------------------------------------------------------
def ore(spot_color, seed):
    img = noise_fill((128, 128, 132), "stone_ore" + seed, 14)
    r = rng(seed)
    px = img.load()
    for _ in range(6):
        x = r.randint(1, S - 3)
        y = r.randint(1, S - 3)
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            c = shade(spot_color, r.randint(-20, 20))
            px[x + dx, y + dy] = (c[0], c[1], c[2], 255)
    return img


save(ore((40, 40, 44), "coal"), "bc_coal_ore.png")
save(ore((196, 170, 150), "iron"), "bc_iron_ore.png")
save(ore((240, 210, 70), "gold"), "bc_gold_ore.png")
save(ore((110, 224, 224), "diamond"), "bc_diamond_ore.png")


# ---- Metal / mineral blocks ---------------------------------------
def metal_block(color, seed):
    img = noise_fill(color, seed, 10)
    px = img.load()
    # beveled highlight/shadow border
    for i in range(S):
        px[i, 0] = shade(color, 40)
        px[0, i] = shade(color, 40)
        px[i, S - 1] = shade(color, -40)
        px[S - 1, i] = shade(color, -40)
    return img


save(metal_block((200, 200, 206), "steelblock"), "bc_steelblock.png")
save(metal_block((242, 214, 88), "goldblock"), "bc_goldblock.png")
save(metal_block((116, 226, 226), "diamondblock"), "bc_diamondblock.png")
save(metal_block((44, 44, 48), "coalblock"), "bc_coalblock.png")


# ---- Brick ---------------------------------------------------------
def brick():
    base = (160, 74, 58)
    img = noise_fill(base, "brick", 8)
    px = img.load()
    mortar = (196, 190, 182)
    for y in range(0, S, 4):
        for x in range(S):
            px[x, y] = mortar
    for row, y in enumerate(range(0, S, 4)):
        off = 0 if row % 2 == 0 else 4
        for x in range(off, S, 8):
            for yy in range(y, min(S, y + 4)):
                if 0 <= x < S:
                    px[x, yy] = mortar
    return img


save(brick(), "bc_brick.png")


# ---- Liquids -------------------------------------------------------
save(noise_fill((48, 96, 190), "water", 12, alpha=170), "bc_water.png")
save(noise_fill((228, 108, 34), "lava", 26, alpha=255), "bc_lava.png")
save(noise_fill((176, 214, 236), "ice", 8, alpha=210), "bc_ice.png")


# ---- Plants (alpha) ------------------------------------------------
def tallgrass():
    img = new_img()
    r = rng("tallgrass")
    px = img.load()
    for x in range(1, S, 2):
        h = r.randint(5, 11)
        g = shade((78, 152, 66), r.randint(-16, 16))
        for y in range(S - 1, S - 1 - h, -1):
            px[x, y] = (g[0], g[1], g[2], 255)
    return img


save(tallgrass(), "bc_tallgrass.png")


def sapling():
    img = new_img()
    px = img.load()
    # trunk
    for y in range(6, S):
        px[7, y] = (110, 78, 46, 255)
        px[8, y] = (96, 66, 40, 255)
    # canopy
    r = rng("sapling")
    for _ in range(26):
        x = r.randint(4, 11)
        y = r.randint(1, 8)
        g = shade((66, 142, 56), r.randint(-16, 16))
        px[x, y] = (g[0], g[1], g[2], 255)
    return img


save(sapling(), "bc_sapling.png")


def apple_item():
    img = new_img()
    px = img.load()
    r = rng("apple")
    cx, cy, rad = 8, 9, 5
    for y in range(S):
        for x in range(S):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad:
                c = shade((208, 44, 40), r.randint(-20, 20))
                px[x, y] = (c[0], c[1], c[2], 255)
    px[8, 3] = (110, 78, 46, 255)
    px[8, 2] = (110, 78, 46, 255)
    px[9, 2] = (70, 150, 60, 255)
    px[6, 6] = (255, 200, 200, 220)
    return img


save(apple_item(), "bc_apple.png")


# ---- Torch (alpha) -------------------------------------------------
def torch():
    img = new_img()
    px = img.load()
    for y in range(6, S):
        px[7, y] = (110, 78, 46, 255)
        px[8, y] = (96, 66, 40, 255)
    # flame
    px[7, 5] = (255, 210, 90, 255)
    px[8, 5] = (255, 190, 70, 255)
    px[7, 4] = (255, 240, 140, 255)
    px[8, 4] = (255, 230, 120, 255)
    px[7, 3] = (255, 250, 200, 255)
    return img


save(torch(), "bc_torch.png")


# ---- Crafting table ------------------------------------------------
def craft_top():
    img = planks()
    px = img.load()
    # grid overlay
    for i in range(S):
        px[i, 5] = (86, 62, 34, 255)
        px[i, 10] = (86, 62, 34, 255)
        px[5, i] = (86, 62, 34, 255)
        px[10, i] = (86, 62, 34, 255)
    return img


save(craft_top(), "bc_crafting_table_top.png")


def craft_front():
    img = planks()
    px = img.load()
    for x in range(3, 13):
        px[x, 4] = (86, 62, 34, 255)
        px[x, 12] = (86, 62, 34, 255)
    for y in range(4, 13):
        px[3, y] = (86, 62, 34, 255)
        px[12, y] = (86, 62, 34, 255)
    px[7, 8] = (200, 200, 60, 255)
    return img


save(craft_front(), "bc_crafting_table_front.png")
save(planks(), "bc_crafting_table_side.png")


# ---- Furnace -------------------------------------------------------
def furnace_front(active=False):
    img = noise_fill((120, 120, 124), "furnace", 12)
    px = img.load()
    # mouth
    for y in range(6, 13):
        for x in range(4, 12):
            px[x, y] = (30, 30, 34, 255)
    if active:
        for y in range(9, 13):
            for x in range(5, 11):
                px[x, y] = shade((240, 130, 40), rng("fa").randint(-20, 20))
    else:
        for x in range(5, 11):
            px[x, 11] = (60, 60, 66, 255)
    return img


save(furnace_front(False), "bc_furnace_front.png")
save(furnace_front(True), "bc_furnace_front_active.png")
save(noise_fill((120, 120, 124), "furnace", 12), "bc_furnace_side.png")


def furnace_top():
    img = noise_fill((120, 120, 124), "furnace", 12)
    px = img.load()
    for x in range(4, 12):
        px[x, 6] = (60, 60, 66, 255)
        px[x, 9] = (60, 60, 66, 255)
    return img


save(furnace_top(), "bc_furnace_top.png")


# ---- Chest ---------------------------------------------------------
def chest_front():
    img = noise_fill((150, 108, 60), "chest", 8)
    px = img.load()
    for x in range(S):
        px[x, 6] = (96, 66, 34, 255)
    # latch
    for y in range(5, 9):
        px[7, y] = (60, 60, 66, 255)
        px[8, y] = (60, 60, 66, 255)
    for i in range(S):
        px[i, 0] = shade((150, 108, 60), 30)
        px[0, i] = shade((150, 108, 60), 30)
        px[i, S - 1] = shade((150, 108, 60), -40)
        px[S - 1, i] = shade((150, 108, 60), -40)
    return img


save(chest_front(), "bc_chest_front.png")
save(noise_fill((150, 108, 60), "chest", 8), "bc_chest_side.png")


def chest_top():
    img = noise_fill((150, 108, 60), "chest", 8)
    px = img.load()
    for y in range(5, 9):
        px[7, y] = (60, 60, 66, 255)
        px[8, y] = (60, 60, 66, 255)
    return img


save(chest_top(), "bc_chest_top.png")


# ---- Craftitems ----------------------------------------------------
def ingot(color, seed):
    img = new_img()
    px = img.load()
    r = rng(seed)
    for y in range(6, 12):
        for x in range(3, 13):
            c = shade(color, r.randint(-16, 16))
            px[x, y] = (c[0], c[1], c[2], 255)
    for x in range(3, 13):
        px[x, 6] = shade(color, 40)
    return img


save(ingot((196, 196, 202), "steelingot"), "bc_steel_ingot.png")
save(ingot((240, 210, 80), "goldingot"), "bc_gold_ingot.png")


def lump(color, seed):
    img = new_img()
    px = img.load()
    r = rng(seed)
    cx, cy = 8, 8
    for y in range(S):
        for x in range(S):
            if (x - cx) ** 2 + (y - cy) ** 2 <= 20:
                c = shade(color, r.randint(-24, 24))
                px[x, y] = (c[0], c[1], c[2], 255)
    return img


save(lump((44, 44, 48), "coallump"), "bc_coal_lump.png")
save(lump((190, 160, 140), "ironlump"), "bc_iron_lump.png")
save(lump((240, 210, 70), "goldlump"), "bc_gold_lump.png")
save(lump((150, 116, 82), "claylump"), "bc_clay_lump.png")


def diamond_item():
    img = new_img()
    px = img.load()
    r = rng("diamonditem")
    pts = [(8, 3), (5, 8), (11, 8), (8, 13)]
    # simple gem diamond
    for y in range(3, 14):
        w = 6 - abs(8 - y)
        w = max(1, w)
        for x in range(8 - w, 8 + w):
            c = shade((116, 226, 226), r.randint(-20, 20))
            px[x, y] = (c[0], c[1], c[2], 255)
    return img


save(diamond_item(), "bc_diamond.png")


def stick_item():
    img = new_img()
    px = img.load()
    for i in range(3, 13):
        px[i, i] = (140, 100, 56, 255)
        px[i, i - 1] = (120, 84, 46, 255)
    return img


save(stick_item(), "bc_stick.png")


# ---- Tools ---------------------------------------------------------
MAT_COLORS = {
    "wood": (150, 112, 62),
    "stone": (128, 128, 132),
    "steel": (200, 200, 206),
    "gold": (240, 210, 80),
    "diamond": (116, 226, 226),
}


def tool_base():
    """Return image + handle drawn (diagonal stick, bottom-left to center)."""
    img = new_img()
    px = img.load()
    for i in range(2, 12):
        x = i
        y = S - 1 - i
        for dx in (0, 1):
            if 0 <= x + dx < S and 0 <= y < S:
                px[x + dx, y] = (120, 84, 46, 255)
    return img, px


def draw_head(px, coords, color, r):
    for (x, y) in coords:
        if 0 <= x < S and 0 <= y < S:
            c = shade(color, r.randint(-18, 18))
            px[x, y] = (c[0], c[1], c[2], 255)


def pick_tex(mat):
    img, px = tool_base()
    r = rng("pick" + mat)
    color = MAT_COLORS[mat]
    coords = []
    for x in range(2, 14):
        y = 2 + abs(x - 8) // 2
        coords.append((x, y))
        coords.append((x, y + 1))
    draw_head(px, coords, color, r)
    return img


def axe_tex(mat):
    img, px = tool_base()
    r = rng("axe" + mat)
    color = MAT_COLORS[mat]
    coords = []
    for y in range(2, 8):
        w = 4 - abs(4 - y) // 1
        for x in range(3, 3 + max(2, w + 2)):
            coords.append((x, y))
    draw_head(px, coords, color, r)
    return img


def shovel_tex(mat):
    img, px = tool_base()
    r = rng("shovel" + mat)
    color = MAT_COLORS[mat]
    coords = []
    for y in range(2, 7):
        for x in range(5, 10):
            coords.append((x, y))
    draw_head(px, coords, color, r)
    return img


def sword_tex(mat):
    img = new_img()
    px = img.load()
    r = rng("sword" + mat)
    color = MAT_COLORS[mat]
    # blade diagonal
    for i in range(3, 12):
        x = i
        y = S - 1 - i
        c = shade(color, r.randint(-18, 18))
        px[x, y] = (c[0], c[1], c[2], 255)
        px[x, y - 1] = shade(color, 30)
    # guard + handle
    px[11, 4] = (90, 70, 50, 255)
    px[12, 3] = (90, 70, 50, 255)
    px[13, 3] = (140, 100, 56, 255)
    px[10, 5] = (90, 70, 50, 255)
    return img


for mat in MAT_COLORS:
    save(pick_tex(mat), f"bc_{mat}_pick.png")
    save(axe_tex(mat), f"bc_{mat}_axe.png")
    save(shovel_tex(mat), f"bc_{mat}_shovel.png")
    save(sword_tex(mat), f"bc_{mat}_sword.png")


# ---- Menu assets ---------------------------------------------------
def menu_icon():
    img = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    px = img.load()
    r = rng("icon")
    # isometric-ish grass block
    for y in range(96):
        for x in range(96):
            if 20 <= x < 76 and 30 <= y < 66:
                base = (110, 78, 46)  # dirt body
                if y < 40:
                    base = (92, 160, 74)  # grass top band
                c = shade(base, r.randint(-14, 14))
                px[x, y] = (c[0], c[1], c[2], 255)
    return img


menu_icon().save(os.path.join(os.path.dirname(OUT), "..", "..", "menu", "icon.png"))


def menu_bg():
    img = Image.new("RGBA", (256, 144), (0, 0, 0, 255))
    px = img.load()
    r = rng("bg")
    for y in range(144):
        for x in range(256):
            if y < 70:
                base = (96, 150, 214)  # sky
            elif y < 84:
                base = (92, 160, 74)  # grass
            else:
                base = (110, 78, 46)  # dirt
            c = shade(base, r.randint(-10, 10))
            px[x, y] = (c[0], c[1], c[2], 255)
    return img


menu_bg().save(os.path.join(os.path.dirname(OUT), "..", "..", "menu", "background.png"))

# ---- Furnace GUI gauges (not shipped by the engine) ----------------
def flame(fg=True):
    img = new_img()
    px = img.load()
    r = rng("flame" + str(fg))
    hot = (255, 170, 40) if fg else (90, 90, 96)
    core_c = (255, 240, 150) if fg else (130, 130, 136)
    for y in range(S):
        for x in range(S):
            cx = 8
            w = (S - y) * 0.42
            if abs(x - cx) < w and y > 2:
                c = core_c if abs(x - cx) < w * 0.4 else hot
                c = shade(c, r.randint(-16, 16))
                px[x, y] = (c[0], c[1], c[2], 255)
    return img


save(flame(True), "bc_furnace_fire_fg.png")
save(flame(False), "bc_furnace_fire_bg.png")


def arrow(fg=True):
    img = new_img()
    px = img.load()
    col = (240, 240, 245) if fg else (90, 90, 96)
    # horizontal arrow pointing right (rotated in formspec as needed)
    for x in range(2, 11):
        for y in range(6, 10):
            px[x, y] = col
    for i in range(5):
        for y in range(4 + i, 12 - i):
            xx = 10 + i
            if xx < S:
                px[xx, y] = col
    return img


save(arrow(True), "bc_arrow_fg.png")
save(arrow(False), "bc_arrow_bg.png")


print("Generated", len(os.listdir(OUT)), "textures in", OUT)
