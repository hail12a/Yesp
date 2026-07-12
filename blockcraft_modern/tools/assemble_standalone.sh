#!/usr/bin/env bash
#
# Assemble a standalone, rebranded "BlockCraft" Windows distribution from a
# Luanti engine build + this game.
#
# Usage:
#   tools/assemble_standalone.sh /path/to/luanti-engine-build /path/to/output-dir
#
# The engine build is the extracted Luanti portable Windows folder (the one
# containing bin/, builtin/, textures/, minetest.conf.example ...).
# The result is a folder the user runs by double-clicking bin/BlockCraft.exe.
#
# NOTE: This bundles the *unmodified* Luanti engine binary (LGPL 2.1+). We do
# not recompile it, so the OS window title and taskbar icon still read
# "Luanti"; everything the player interacts with (menu logo/header/background,
# the only installed game, the launcher name) is BlockCraft. See STANDALONE.md.
set -euo pipefail

ENGINE="${1:?path to Luanti engine build required}"
OUT="${2:?output dir required}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # the game folder (blockcraft_modern)

echo "==> Copying engine build"
rm -rf "$OUT"
cp -r "$ENGINE" "$OUT"

echo "==> Installing BlockCraft as the only game"
mkdir -p "$OUT/games"
rm -rf "$OUT/games/blockcraft_modern"
cp -r "$HERE" "$OUT/games/blockcraft_modern"
# Drop authoring-only files from the shipped copy
rm -rf "$OUT/games/blockcraft_modern/tools" \
       "$OUT/games/blockcraft_modern/branding" \
       "$OUT/games/blockcraft_modern/menu/gen_branding.py" \
       "$OUT/games/blockcraft_modern/mods/bc_core/gen_textures.py" \
       "$OUT/games/blockcraft_modern/mods/bc_core/reskin_baunilha.py"

echo "==> Rebranding the main menu"
cp "$HERE/branding/pack/logo.png"        "$OUT/textures/base/pack/logo.png"
cp "$HERE/branding/pack/menu_header.png" "$OUT/textures/base/pack/menu_header.png"

echo "==> Renaming launcher -> BlockCraft.exe"
if [ -f "$OUT/bin/luanti.exe" ]; then
	mv "$OUT/bin/luanti.exe" "$OUT/bin/BlockCraft.exe"
fi

echo "==> Writing portable config (single-game, offline, branded)"
cat > "$OUT/minetest.conf" <<'CONF'
# BlockCraft portable configuration
menu_last_game = blockcraft_modern
menu_clouds = true

# --- Survival defaults (new worlds) ---
creative_mode = false
enable_damage = true
default_privs = interact, shout

# --- Minecraft-like feel ---
fov = 72
# Inventory on E (SDL scancode 8), like Minecraft
keymap_inventory = SYSTEM_SCANCODE_8
# Sprint / aux key on Left Ctrl (SDL scancode 224) instead of E
keymap_special1 = SYSTEM_SCANCODE_224

# Keep the experience self-contained / offline
contentdb_enable_updates_indicator = false
show_advanced = false
enable_split_login_register = false
name = Player
CONF

echo "==> Writing launcher + player readme"
cat > "$OUT/Start BlockCraft.bat" <<'BAT'
@echo off
cd /d "%~dp0"
start "" "bin\BlockCraft.exe"
BAT

cat > "$OUT/PLAY.txt" <<'TXT'
BlockCraft Modern
=================

To play:
  1. Double-click  "Start BlockCraft.bat"   (or bin\BlockCraft.exe)
  2. In the menu, "BlockCraft Modern" is the installed game.
  3. Click New / New World, name it, Create, then Play Game.

You spawn with a wooden pickaxe, axe and torches. Punch a tree to begin,
craft a workbench, mine stone, build a furnace, dig for diamonds.

Note: this is a standalone build. The game (blocks, crafting, world
generation, tools) is original work. It runs on the Luanti engine (LGPL),
which is included unmodified - see ENGINE-LICENSE.txt. Block/item/tool art
is from the Baunilha texture pack (CC BY-SA 4.0) - see
games/blockcraft_modern/ATTRIBUTION.md.
TXT

cat > "$OUT/ENGINE-LICENSE.txt" <<'TXT'
This product includes the Luanti voxel game engine (formerly Minetest),
copyright (C) 2010-2024 celeron55 and contributors, licensed under the
GNU Lesser General Public License version 2.1 or later (LGPL-2.1+).

The engine binary here is UNMODIFIED. Its complete corresponding source
code is available from the upstream project:
  https://github.com/luanti-org/luanti  (tag 5.16.1)

The BlockCraft game content (games/blockcraft_modern) is a separate work;
see games/blockcraft_modern/LICENSE.txt and ATTRIBUTION.md.
TXT

echo "==> Done: $OUT"
echo "    Launch with: bin/BlockCraft.exe  (or 'Start BlockCraft.bat')"
