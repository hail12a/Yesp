# BlockCraft Modern

A standalone sandbox voxel game — mine, build, craft and explore
procedurally generated worlds. Built as a **game** (subgame) for the
[Luanti](https://www.luanti.org/) engine (formerly Minetest).

> Luanti is the *engine*; BlockCraft Modern is the *game* that runs on it.
> All blocks, tools, crafting, world generation and artwork in this folder
> are original to this project.

![Blocks & items](../docs/texture_sheet.png)

## Features

- **42 blocks** — stone, dirt, grass, sand, sandstone, gravel, clay, wood &
  logs, leaves, glass, brick, snow/ice, bedrock, ores and mineral blocks,
  plus functional crafting table, furnace and chest.
- **20 tools** — pickaxe, axe, shovel and sword in five tiers
  (wood → stone → steel → gold → diamond), each with balanced dig speed,
  durability and combat stats.
- **Real crafting** — 49 recipes including a live 3×3 crafting-table preview.
- **Working furnace** — fuel + smelting logic (ore → ingot, sand → glass,
  cobble → stone, clay → brick) with an animated active state.
- **World generation** — five biomes (grassland, beach, ocean, desert,
  tundra), ore distribution by depth, oak trees, tall grass and clay.
- **Living world** — grass spreads to bare dirt in light and dies in the
  dark; saplings grow into trees; sand/gravel/snow obey gravity.
- **Player kit** — new survival players spawn with a wooden pickaxe, axe
  and torches.

## Install & play

1. Install the Luanti engine (5.16.x or newer) from <https://www.luanti.org/>.
2. Copy the `blockcraft_modern` folder into your Luanti `games/` directory:
   - Windows: `%APPDATA%\Luanti\games\`
   - Linux: `~/.minetest/games/` or `~/.luanti/games/`
   - Or the `games/` folder next to the engine binary.
3. Launch Luanti, create a new world, and select **BlockCraft Modern** as
   the game.

## Getting started (survival)

1. Punch trees to collect **logs**, craft them into **planks**, then
   **sticks** and a **crafting table**.
2. Use the table to craft a **wooden pickaxe** → mine stone for
   **cobblestone**.
3. Craft a **furnace**, smelt **iron ore** into **steel ingots**, and
   upgrade your gear.
4. Dig deep for **gold** and **diamond** — bring torches.

## Artwork

Block, item and tool textures are from the **Baunilha** texture pack for
Luanti / Minetest Game (CC BY-SA 4.0) — see `ATTRIBUTION.md`. A fully
self-contained procedural fallback set is also included:

```sh
cd mods/bc_core
python3 gen_textures.py                    # original procedural placeholders
python3 reskin_baunilha.py /path/to/pack   # re-apply a Baunilha-style pack
```

## Project layout

```
blockcraft_modern/
├── game.conf                 # game manifest
├── menu/                     # icon + menu background
└── mods/
    ├── bc_core/              # nodes, world gen, ores, biomes, textures
    ├── bc_tools/             # pickaxes/axes/shovels/swords (5 tiers)
    ├── bc_crafting/          # crafting recipes
    └── bc_player/            # starting kit, spawn, HUD
```

## License

- **Code** (`*.lua`, `*.py`): MIT — see `LICENSE.txt`.
- **Media** (textures, menu art): CC BY-SA 4.0. Block/item/tool textures are
  from the Baunilha pack; see `ATTRIBUTION.md` and `licenses/`.
- The **Luanti engine** is a separate work under LGPL 2.1+ and is not
  included in this repository; install it from luanti.org.
