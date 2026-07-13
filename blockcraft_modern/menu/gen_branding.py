#!/usr/bin/env python3
"""
Generate BlockCraft menu branding, Minecraft-Bedrock-style:
  * a full-screen landscape background (sky gradient, sun, hills, trees)
  * a big chunky logo
  * a slim header

Uses the game's own block textures as tiles so the menu matches the game.
Run from the game root:  python3 menu/gen_branding.py
Optionally pass a font path as argv[1] (defaults to DejaVuSans-Bold).
"""
import os
import sys
import math
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))          # .../menu
GAME = os.path.dirname(HERE)
TEX = os.path.join(GAME, "mods/bc_core/textures")
PACK = os.path.join(GAME, "branding/pack")
os.makedirs(PACK, exist_ok=True)

FONT = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

CREAM = (245, 242, 232)
DARK = (28, 24, 20)
GREEN = (120, 200, 96)


def tex(name):
    return Image.open(os.path.join(TEX, name)).convert("RGBA")


def font(sz):
    return ImageFont.truetype(FONT, sz)


def text_bevel(d, xy, s, sz, fill, anchor="mm", shadow=DARK, ow=None):
    ow = ow if ow is not None else max(2, sz // 16)
    f = font(sz)
    d.text((xy[0] + ow, xy[1] + ow + 2), s, font=f, fill=(0, 0, 0, 120), anchor=anchor)
    for dx in range(-ow, ow + 1):
        for dy in range(-ow, ow + 1):
            if dx * dx + dy * dy <= ow * ow:
                d.text((xy[0] + dx, xy[1] + dy), s, font=f, fill=shadow, anchor=anchor)
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


def _dark(img, f):
    px = img.load()
    o = img.copy()
    op = o.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            op[x, y] = (int(r * f), int(g * f), int(b * f), a)
    return o


def iso_block(size, top_name, side_name):
    """A faux-isometric block built from two textures."""
    top = tex(top_name).resize((size, size), Image.NEAREST)
    side = tex(side_name).resize((size, size), Image.NEAREST)
    canvas = Image.new("RGBA", (size * 2, size * 2), (0, 0, 0, 0))
    canvas.alpha_composite(side, (0, size // 2))
    canvas.alpha_composite(_dark(side, 0.8), (size, size // 2))
    canvas.alpha_composite(top, (size // 2, 0))
    return canvas


# ------------------------------------------------------------------
# Full-screen landscape background (1280x720)
# ------------------------------------------------------------------
def background():
    W, H = 1280, 720
    img = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    px = img.load()
    top_c, bot_c = (94, 160, 232), (176, 214, 240)
    horizon = int(H * 0.66)
    for y in range(horizon):
        t = y / horizon
        row = tuple(int(top_c[i] + (bot_c[i] - top_c[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = row + (255,)
    d = ImageDraw.Draw(img)
    d.ellipse([980, 70, 1120, 210], fill=(255, 238, 176, 255))
    d.ellipse([1000, 90, 1100, 190], fill=(255, 246, 205, 255))
    for (cx, cy, s) in [(220, 130, 1.0), (520, 90, 0.7), (760, 170, 1.2)]:
        for (ox, oy, r) in [(0, 0, 34), (44, 6, 28), (-40, 8, 26), (20, -14, 24)]:
            d.ellipse([cx + ox * s - r, cy + oy - r, cx + ox * s + r, cy + oy + r],
                      fill=(255, 255, 255, 210))
    for (layer_y, color) in [(horizon - 40, (120, 168, 120)), (horizon - 12, (104, 156, 104))]:
        pts = [(0, H), (0, layer_y)]
        for x in range(0, W + 1, 40):
            pts.append((x, layer_y + int(28 * math.sin(x / 130.0))))
        pts += [(W, layer_y), (W, H)]
        d.polygon(pts, fill=color + (255,))
    grass_side = tex("bc_grass_side.png").resize((64, 64), Image.NEAREST)
    dirt = tex("bc_dirt.png").resize((64, 64), Image.NEAREST)
    for x in range(0, W, 64):
        img.alpha_composite(grass_side, (x, horizon))
        for y in range(horizon + 64, H, 64):
            img.alpha_composite(dirt, (x, y))
    tree = tex("bc_tree.png").resize((64, 64), Image.NEAREST)
    leaf = tex("bc_leaves.png").resize((64, 64), Image.NEAREST)
    for base_x in (176, 1040):
        for i in range(3):
            img.alpha_composite(tree, (base_x, horizon - 64 * (i + 1)))
        top_y = horizon - 64 * 3
        for (lx, ly) in [(-64, 0), (0, -40), (64, 0), (-64, 40), (64, 40), (0, 40)]:
            img.alpha_composite(leaf, (base_x + lx, top_y + ly))
    return img.convert("RGB")


background().save(os.path.join(HERE, "background.png"))


# ------------------------------------------------------------------
# Big chunky logo (512x256, transparent)
# ------------------------------------------------------------------
def logo():
    W, H = 512, 256
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    blk = iso_block(70, "bc_grass_top.png", "bc_grass_side.png")
    img.alpha_composite(blk, (W // 2 - blk.width // 2, 2))
    d = ImageDraw.Draw(img)
    text_bevel(d, (W // 2, 172), "BLOCKCRAFT", 60, CREAM, ow=4)
    text_bevel(d, (W // 2, 224), "MODERN", 32, GREEN, ow=3)
    return img


logo().save(os.path.join(PACK, "logo.png"))


def header():
    W, H = 672, 72
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    text_bevel(d, (W // 2, H // 2 - 2), "BlockCraft Modern", 38, CREAM, ow=3)
    return img


header().save(os.path.join(PACK, "menu_header.png"))
logo().resize((256, 128)).save(os.path.join(HERE, "header.png"))


def icon():
    blk = iso_block(40, "bc_grass_top.png", "bc_grass_side.png")
    c = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    c.alpha_composite(blk, (48 - blk.width // 2, 48 - blk.height // 2))
    return c


icon().save(os.path.join(HERE, "icon.png"))

print("Branding regenerated (Bedrock-style):")
for p in (os.path.join(HERE, "background.png"), os.path.join(PACK, "logo.png"),
          os.path.join(PACK, "menu_header.png"), os.path.join(HERE, "icon.png")):
    print("  ", p, Image.open(p).size)
