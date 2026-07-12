#!/usr/bin/env python3
"""
Generate a Minecraft-style blocky player for BlockCraft Modern:
  * models/character.obj  - a box humanoid (head, torso, 2 arms, 2 legs),
                            feet at y=0, ~2.0 blocks tall, facing -Z.
  * textures/bc_skin.png  - a 64x64 Steve-like skin atlas.
  * textures/wieldhand.png- a first-person arm (overrides the engine default).

The OBJ and the skin share a simple atlas: each body part samples one flat
cell, and the head-front samples a face cell with eyes/mouth. We author both
sides so they stay consistent.
Run:  python3 gen_player.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "models")
TEX = os.path.join(HERE, "textures")
os.makedirs(MODELS, exist_ok=True)
os.makedirs(TEX, exist_ok=True)

# ---- Skin atlas (64x64) ----------------------------------------------
SKIN = (223, 176, 140)
SKIN_D = (198, 150, 116)
SHIRT = (54, 170, 170)
PANTS = (58, 74, 140)
HAIR = (90, 64, 40)
SHOE = (70, 60, 54)

atlas = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(atlas)

# cells (x0,y0,x1,y1)
CELL = {
	"skin":  (0, 0, 16, 16),
	"face":  (16, 0, 32, 16),
	"hair":  (32, 0, 48, 16),
	"shirt": (0, 16, 16, 32),
	"pants": (0, 32, 16, 48),
	"shoe":  (16, 32, 32, 48),
}


def fill(cell, color):
	d.rectangle(CELL[cell], fill=color)


fill("skin", SKIN)
fill("hair", HAIR)
fill("shirt", SHIRT)
fill("pants", PANTS)
fill("shoe", SHOE)

# face cell: skin base + eyes + mouth
fx0, fy0, fx1, fy1 = CELL["face"]
d.rectangle(CELL["face"], fill=SKIN)
# hair fringe on top
d.rectangle([fx0, fy0, fx1, fy0 + 4], fill=HAIR)
# eyes
d.rectangle([fx0 + 4, fy0 + 6, fx0 + 6, fy0 + 8], fill=(255, 255, 255))
d.rectangle([fx0 + 5, fy0 + 6, fx0 + 6, fy0 + 8], fill=(60, 90, 170))
d.rectangle([fx0 + 10, fy0 + 6, fx0 + 12, fy0 + 8], fill=(255, 255, 255))
d.rectangle([fx0 + 10, fy0 + 6, fx0 + 11, fy0 + 8], fill=(60, 90, 170))
# mouth
d.rectangle([fx0 + 5, fy0 + 11, fx0 + 11, fy0 + 12], fill=SKIN_D)
atlas.save(os.path.join(TEX, "bc_skin.png"))


# ---- First-person hand/arm (skin sleeve) -----------------------------
hand = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
hd = ImageDraw.Draw(hand)
hd.rectangle([4, 0, 11, 11], fill=SHIRT)       # sleeve
hd.rectangle([4, 11, 11, 15], fill=SKIN)       # hand
for i in range(0, 16, 3):
	hd.point((5, i), fill=SKIN_D)
hand.save(os.path.join(TEX, "wieldhand.png"))


# ---- OBJ box-model humanoid ------------------------------------------
# Each part: (name, cell, (x0,y0,z0), (x1,y1,z1))
P = 1.0 / 16.0  # one MC pixel in blocks
parts = [
	("head",  "skin",  (-4 * P, 24 * P, -4 * P), (4 * P, 32 * P, 4 * P)),
	("torso", "shirt", (-4 * P, 12 * P, -2 * P), (4 * P, 24 * P, 2 * P)),
	("arm_r", "skin",  (-8 * P, 12 * P, -2 * P), (-4 * P, 24 * P, 2 * P)),
	("arm_l", "skin",  (4 * P, 12 * P, -2 * P), (8 * P, 24 * P, 2 * P)),
	("leg_r", "pants", (-4 * P, 0, -2 * P), (0, 12 * P, 2 * P)),
	("leg_l", "pants", (0, 0, -2 * P), (4 * P, 12 * P, 2 * P)),
]

verts = []
uvs = []
faces = []


def uv_of(cell):
	x0, y0, x1, y1 = CELL[cell]
	# inset slightly to avoid bleeding; normalize; flip V for OBJ
	u0 = (x0 + 1) / 64.0
	u1 = (x1 - 1) / 64.0
	v0 = 1 - (y1 - 1) / 64.0
	v1 = 1 - (y0 + 1) / 64.0
	return (u0, v0), (u1, v1)


def add_box(cell, a, b, face_cell=None):
	x0, y0, z0 = a
	x1, y1, z1 = b
	# 8 corners
	base = len(verts) + 1
	corners = [
		(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),  # 1-4 back (-... wait z0)
		(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),  # 5-8
	]
	for c in corners:
		verts.append(c)
	(u0, v0), (u1, v1) = uv_of(cell)
	uvbase = len(uvs) + 1
	uvs.extend([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
	# face-cell (head front) gets its own uv quad
	if face_cell:
		(fu0, fv0), (fu1, fv1) = uv_of(face_cell)
		uvs.extend([(fu0, fv0), (fu1, fv0), (fu1, fv1), (fu0, fv1)])
		face_uv = uvbase + 4
	else:
		face_uv = uvbase

	def quad(i, j, k, l, uvq):
		faces.append(((base + i, uvq + 0), (base + j, uvq + 1),
					  (base + k, uvq + 2), (base + l, uvq + 3)))

	# -Z face (front, facing camera) uses face_uv if provided
	quad(0, 1, 2, 3, face_uv)   # front (z0 side, -Z)
	quad(5, 4, 7, 6, uvbase)    # back  (z1 side, +Z)
	quad(4, 0, 3, 7, uvbase)    # left  (-X)
	quad(1, 5, 6, 2, uvbase)    # right (+X)
	quad(3, 2, 6, 7, uvbase)    # top   (+Y)
	quad(4, 5, 1, 0, uvbase)    # bottom(-Y)


for name, cell, a, b in parts:
	add_box(cell, a, b, face_cell="face" if name == "head" else None)

with open(os.path.join(MODELS, "character.obj"), "w") as f:
	f.write("# BlockCraft Modern player model\n")
	f.write("mtllib character.mtl\n")
	f.write("o character\n")
	for v in verts:
		f.write("v %.4f %.4f %.4f\n" % v)
	for t in uvs:
		f.write("vt %.5f %.5f\n" % t)
	f.write("usemtl skin\n")
	for q in faces:
		f.write("f %d/%d %d/%d %d/%d %d/%d\n" %
				(q[0][0], q[0][1], q[1][0], q[1][1],
				 q[2][0], q[2][1], q[3][0], q[3][1]))

with open(os.path.join(MODELS, "character.mtl"), "w") as f:
	f.write("newmtl skin\nmap_Kd bc_skin.png\n")

print("Generated player: %d verts, %d faces" % (len(verts), len(faces)))
print("  ", os.path.join(MODELS, "character.obj"))
print("  ", os.path.join(TEX, "bc_skin.png"))
print("  ", os.path.join(TEX, "wieldhand.png"))
