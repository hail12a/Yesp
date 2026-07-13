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
       "$OUT/games/blockcraft_modern/mods/bc_core/reskin_baunilha.py" \
       "$OUT/games/blockcraft_modern/mods/bc_player/gen_player.py"

echo "==> Rebranding the main menu"
cp "$HERE/branding/pack/logo.png"        "$OUT/textures/base/pack/logo.png"
cp "$HERE/branding/pack/menu_header.png" "$OUT/textures/base/pack/menu_header.png"
# Full-screen menu background used by the custom menu.
cp "$HERE/menu/background.png"           "$OUT/textures/base/pack/bc_menu_bg.png"

echo "==> Installing the custom Bedrock-style main menu"
# Back up the engine's default menu, then replace it with ours. Fully
# revertable via RESTORE_DEFAULT_MENU.bat.
if [ ! -f "$OUT/builtin/mainmenu/init.lua.orig" ]; then
	cp "$OUT/builtin/mainmenu/init.lua" "$OUT/builtin/mainmenu/init.lua.orig"
fi
cp "$HERE/menu/custom_mainmenu.lua" "$OUT/builtin/mainmenu/init.lua"

cat > "$OUT/RESTORE_DEFAULT_MENU.bat" <<'BAT'
@echo off
rem Restore the engine's original main menu if the custom one misbehaves.
copy /Y "builtin\mainmenu\init.lua.orig" "builtin\mainmenu\init.lua"
echo Default menu restored. You can relaunch BlockCraft now.
pause
BAT

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

# --- Server (used by Start_Server.bat) ---
server_name = BlockCraft Server
server_description = A BlockCraft Modern server
max_users = 15
port = 30000
# Do not announce to the public server list by default (LAN / direct-IP only)
server_announce = false
# Let friends join without registering an account
disallow_empty_password = false
CONF

echo "==> Writing launcher + player readme"
cat > "$OUT/Start BlockCraft.bat" <<'BAT'
@echo off
cd /d "%~dp0"
start "" "bin\BlockCraft.exe"
BAT

# Dedicated LAN/online server launcher.
cat > "$OUT/Start Server.bat" <<'BAT'
@echo off
cd /d "%~dp0"
set WORLD=worlds\server_world
if not exist "%WORLD%" mkdir "%WORLD%"
echo ============================================================
echo   BlockCraft Modern - Dedicated Server
echo ------------------------------------------------------------
echo   Others on your Wi-Fi/LAN join with YOUR local IP + port 30000.
echo   Find your IP: open a new Command Prompt and type  ipconfig
echo   (use the "IPv4 Address", e.g. 192.168.1.23)
echo.
echo   For friends over the internet you must forward UDP port
echo   30000 on your router to this PC. See SERVER_README.txt.
echo.
echo   The FIRST time, allow "BlockCraft.exe" through Windows
echo   Firewall (tick Private networks) when prompted.
echo ------------------------------------------------------------
echo   Leave this window open while playing. Close it to stop.
echo ============================================================
echo.
"bin\BlockCraft.exe" --server --world "%WORLD%" --gameid blockcraft_modern --port 30000
pause
BAT

cat > "$OUT/SERVER_README.txt" <<'TXT'
BlockCraft Modern - Running a Server
====================================

QUICK START (same Wi-Fi / LAN)
------------------------------
1. On the HOST PC, double-click "Start Server.bat".
   - The first time, Windows Firewall will ask to allow BlockCraft.exe.
     Tick "Private networks" and click Allow. (If you miss it, allow
     bin\BlockCraft.exe manually in Windows Defender Firewall.)
   - Leave the black server window open. Closing it stops the server.

2. Find the host's local IP address:
   - On the host, open Command Prompt and type:  ipconfig
   - Note the "IPv4 Address", e.g. 192.168.1.23

3. Each player (including the host, in a second window) launches
   "Start BlockCraft.bat", clicks MULTIPLAYER, and enters:
       Address:  192.168.1.23   (the host's IPv4)
       Port:     30000
       Name:     (anything)
   then Connect.

   The host can also join their own server using Address 127.0.0.1.

PLAYING OVER THE INTERNET
-------------------------
Friends outside your home network need to reach your PC:

Option A - Port forwarding (classic):
   - In your router settings, forward UDP port 30000 to the host PC's
     local IP (from step 2 above).
   - Friends connect to your PUBLIC IP (google "what is my ip") + port 30000.

Option B - Easier, no router setup: use a virtual-LAN tool like Radmin VPN
   or ZeroTier. Everyone installs it and joins the same virtual network,
   then friends connect to the host's virtual-LAN IP + port 30000.

NOTES
-----
- The server world is stored in  worlds\server_world  and persists between
  runs. Delete that folder to start fresh.
- Survival/creative and damage for the server come from minetest.conf
  (creative_mode / enable_damage) in this folder - edit before first run.
- Default port is 30000 (UDP). Change it in "Start Server.bat" and in
  minetest.conf if needed.
TXT

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
