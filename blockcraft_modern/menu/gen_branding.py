#!/usr/bin/env python3
"""Generate BlockCraft menu branding: engine logo, menu header, and the
game's menu background/icon/header. Uses the engine's bundled Arimo-Bold."""
import os
from PIL import Image, ImageDraw, ImageFont

ENG = "/tmp/claude-0/-home-user-Yesp/d9b8b84e-a659-538f-bd26-8630d47a4932/scratchpad/luanti/5.16.1"
FONT = os.path.join(ENG, "fonts", "Arimo-Bold.ttf")
GAME = "/home/user/Yesp/blockcraft_modern"
TEX = os.path.join(GAME, "mods/bc_core/textures")
OUTPACK = "/tmp/claude-0/-home-user-Yesp/d9b8b84e-a659-538f-bd26-8630d47a4932/scratchpad/branding_out/pack"
OUTMENU = "/tmp/claude-0/-home-user-Yesp/d9b8b84e-a659-538f-bd26-8630d47a4932/scratchpad/branding_out/menu"
os.makedirs(OUTPACK, exist_ok=True)
os.makedirs(OUTMENU, exist_ok=True)

GREEN = (108, 184, 92)
GREEN_D = (74, 140, 62)
DIRT = (134, 96, 62)
SKY = (122, 176, 232)
DARK = (34, 30, 26)
CREAM = (245, 240, 228)


def tex(name):
    return Image.open(os.path.join(TEX, name)).convert("RGBA")


def draw_text(d, xy, text, size, fill, outline=None, ow=3, anchor="mm"):
    f = ImageFont.truetype(FONT, size)
    if outline:
        for dx in range(-ow, ow + 1):
            for dy in range(-ow, ow + 1):
                if dx * dx + dy * dy <= ow * ow:
                    d.text((xy[0] + dx, xy[1] + dy), text, font=f, fill=outline, anchor=anchor)
    d.text(xy, text, font=f, fill=fill, anchor=anchor)


def block_glyph(size):
    """Isometric-ish grass block built from real textures."""
    top = tex("bc_grass_top.png").resize((size, size), Image.NEAREST)
    side = tex("bc_grass_side.png").resize((size, size), Image.NEAREST)
    side2 = tex("bc_dirt.png").resize((size, size), Image.NEAREST)
    canvas = Image.new("RGBA", (size * 2, size * 2), (0, 0, 0, 0))
    # simple faux-iso: top shifted up, two sides below
    canvas.alpha_composite(side, (0, size // 2))
    canvas.alpha_composite(ImageChops_darken(side2, 0.85), (size, size // 2))
    canvas.alpha_composite(top, (size // 2, 0))
    return canvas


def ImageChops_darken(img, f):
    px = img.load()
    out = img.copy()
    o = out.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            o[x, y] = (int(r * f), int(g * f), int(b * f), a)
    return out


# ---- Engine main-menu logo (256x256, transparent) --------------------
def logo():
    W = H = 256
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = block_glyph(84)
    img.alpha_composite(g, (W // 2 - g.width // 2, 6))
    d = ImageDraw.Draw(img)
    draw_text(d, (W // 2, 175), "BLOCK", 46, CREAM, DARK, 4)
    draw_text(d, (W // 2, 220), "CRAFT", 46, GREEN, DARK, 4)
    return img


logo().save(os.path.join(OUTPACK, "logo.png"))


# ---- Engine menu header (672x72) -------------------------------------
def header():
    W, H = 672, 72
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_text(d, (W // 2, H // 2 - 2), "BlockCraft  Modern", 40, CREAM, DARK, 3)
    return img


header().save(os.path.join(OUTPACK, "menu_header.png"))


# ---- Game menu background (landscape scene) --------------------------
def background():
    W, H = 768, 432
    img = Image.new("RGBA", (W, H), SKY + (255,))
    # ground band of grass over dirt using real textures, tiled
    grass = tex("bc_grass_top.png").resize((48, 48), Image.NEAREST)
    dirt = tex("bc_dirt.png").resize((48, 48), Image.NEAREST)
    horizon = int(H * 0.62)
    for x in range(0, W, 48):
        img.alpha_composite(grass, (x, horizon))
        for y in range(horizon + 48, H, 48):
            img.alpha_composite(dirt, (x, y))
    # a few stone/ore blocks embedded
    stone = tex("bc_stone.png").resize((48, 48), Image.NEAREST)
    ore = tex("bc_diamond_ore.png").resize((48, 48), Image.NEAREST)
    for (bx, by, t) in [(96, horizon + 96, stone), (192, horizon + 144, ore),
                        (624, horizon + 96, stone), (528, horizon + 144, stone)]:
        img.alpha_composite(t, (bx, by))
    # sun
    d = ImageDraw.Draw(img)
    d.ellipse([620, 40, 700, 120], fill=(255, 236, 170, 255))
    return img


background().save(os.path.join(OUTMENU, "background.png"))


# ---- Game menu header + refreshed icon -------------------------------
def game_header():
    W, H = 512, 96
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = block_glyph(40)
    img.alpha_composite(g, (18, 8))
    d = ImageDraw.Draw(img)
    draw_text(d, (W // 2 + 30, H // 2), "BlockCraft Modern", 34, CREAM, DARK, 3)
    return img


game_header().save(os.path.join(OUTMENU, "header.png"))


def icon():
    g = block_glyph(44)
    canvas = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    canvas.alpha_composite(g, (48 - g.width // 2, 48 - g.height // 2))
    return canvas


icon().save(os.path.join(OUTMENU, "icon.png"))

print("Branding generated:")
for p in (OUTPACK, OUTMENU):
    for f in sorted(os.listdir(p)):
        print("  ", os.path.join(p, f))
