# Building the standalone "BlockCraft" distribution

This turns BlockCraft into a **self-contained, double-click-to-play Windows
build** — the player never sees "install Luanti, drop a folder in." They
unzip one folder and run `bin/BlockCraft.exe`.

## What it produces

```
BlockCraft/
├── bin/BlockCraft.exe        ← the launcher (renamed engine)
├── Start BlockCraft.bat      ← convenience launcher
├── PLAY.txt                  ← player instructions
├── minetest.conf             ← portable, single-game, offline config
├── games/blockcraft_modern/  ← our game, the only installed game
├── textures/base/pack/       ← main menu rebranded (BlockCraft logo/header)
├── builtin/ client/ fonts/ locale/ textures/  (engine)
└── ENGINE-LICENSE.txt        ← LGPL notice + source pointer
```

## How to build it

```sh
tools/assemble_standalone.sh /path/to/luanti-5.16.1 /path/to/output/BlockCraft
cd /path/to/output && zip -r BlockCraft-standalone-win64.zip BlockCraft
```

`/path/to/luanti-5.16.1` is the extracted Luanti portable Windows build (the
folder with `bin/`, `builtin/`, `textures/`, `minetest.conf.example`).

## What is and isn't "our own"

- **The game** — every block, recipe, tool, world-gen rule — is original
  code in `games/blockcraft_modern`. Yours.
- **The engine** (`bin/BlockCraft.exe` + DLLs, `builtin/`, `client/`) is the
  **Luanti** engine, **included unmodified** under the LGPL 2.1+. We rename
  and rebrand around it, but we do **not** recompile it.
- **Consequence of not recompiling:** the OS **window title bar and taskbar
  icon still say/show "Luanti."** Changing those requires building the C++
  engine from source with a Windows toolchain. Everything the player
  interacts with inside the app (menu logo, header, background, the single
  installed game, the `BlockCraft.exe` name) is BlockCraft.
- **Textures** for blocks/items/tools are from the Baunilha pack
  (CC BY-SA 4.0) — see `ATTRIBUTION.md`.

## LGPL compliance (important if you distribute it)

Because the LGPL engine is bundled, the distribution must:
1. Include the engine's license — done (`ENGINE-LICENSE.txt`).
2. Point to the engine's complete source — done (link to the 5.16.1 tag).
Since the engine binary is unmodified, no further obligations apply to your
own game code, which stays MIT.

## Fully removing the "Luanti" name (optional, advanced)

Only possible by compiling the engine yourself:
1. Get the Luanti 5.16.1 source.
2. Edit branding constants (`PROJECT_NAME`, `PROJECT_NAME_C`) and the Windows
   resource/icon (`.rc`).
3. Build with a MinGW/MSVC toolchain, then run this script against your
   custom build. (Not possible in this environment — no C++ toolchain / the
   network blocks fetching the source.)
