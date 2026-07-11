# Yesp

Roblox game scripts (2018-style custom chat, HUD, dealership, garage, admin panel,
money system, car spawning). Saved here so they can be version-controlled and worked
on over time.

## Project layout

```
src/
├── StarterPlayerScripts/      -- LocalScripts (client). Place in StarterPlayer > StarterPlayerScripts
│   ├── ChatPlayerList.client.lua   -- 2018-style custom chat + player list + overhead bubbles
│   ├── HudClient.client.lua        -- top-right HUD (cash, clock, taskbar, garage, teams, tools)
│   ├── DealershipClient.client.lua -- dealership shop UI (filters, search, car-type dropdown, buy)
│   └── AdminClient.client.lua      -- admin panel v2 (animated; Money/Players/World/Effects/Announce/Server)
│
├── ServerScriptService/       -- Scripts (server). Place in ServerScriptService
│   ├── ShopPrompt.server.lua       -- ProximityPrompt on the "Shop" part -> opens dealership
│   ├── ChatStyleRelay.server.lua   -- relays/validates each player's chat color + font
│   ├── CrownHat.server.lua         -- gives a mesh crown hat to a specific player
│   ├── MoneyServer.server.lua      -- leaderstats.Money, DataStore save, timed payout
│   ├── DealershipServer.server.lua -- buy/sell/ownership, builds PreviewCars shells
│   ├── CarSpawnServer.server.lua   -- secure car spawning from ServerStorage/DealerCars
│   └── AdminServer.server.lua      -- server-validated admin actions (cash, cars, kick, etc.)
│
└── ReplicatedStorage/         -- ModuleScripts. Place in ReplicatedStorage
    ├── CarCatalog.lua              -- the one file you edit to manage cars, prices, badges, types
    └── AdminConfig.lua             -- who is an admin / super-admin
```

> File suffixes (`.client.lua`, `.server.lua`) follow the Rojo convention so the
> tree could be synced into Studio later. They are plain Lua otherwise.

## Roblox setup (Instances you must create by hand)

**TextChatService**
- `ChatVersion = TextChatService`
- `CreateDefaultTextChannels = true`

**ReplicatedStorage**
- RemoteEvent `ChatStyleEvent`
- RemoteEvent `OpenDealership`
- RemoteEvent `SpawnCarEvent`
- RemoteEvent `GiveGearEvent` (optional; used by the Tools panel)
- RemoteEvent `DealerNotify`
- RemoteFunction `DealerRequest`
- RemoteFunction `AdminRequest`
- RemoteEvent `AdminIsAdmin`
- ModuleScript `CarCatalog`  (from `src/ReplicatedStorage/CarCatalog.lua`)
- ModuleScript `AdminConfig` (from `src/ReplicatedStorage/AdminConfig.lua`)
- Folder `PreviewCars`  (auto-built by DealershipServer)
- Folder `GearPreviews` (optional; gear models for the Tools panel)

**ServerStorage**
- Folder `DealerCars` — car `Model`s (each with `PrimaryPart` set)

**Workspace**
- Part named `Shop` (gets the "hold E" dealership prompt)

## Notes / fixes applied while saving

These small corrections were made so the files load/run cleanly (originals had typos):

- `CarCatalog.lua`: two entries had stray positional values instead of an `added`
  field (`"2013 Chevrolet Caprice PPV"` and `"2020 BMW M2 CS"`). Changed to
  `added = "2026-07-09"` / `added = "2026-07-08"`. `2020 BMW M2 CS` as written was
  also invalid Lua (`2026-07-08` parsed as arithmetic).
- `AdminConfig.lua`: removed a duplicate `"JunkoProblem"` entry.
- `HudClient.client.lua`: in `togglePanel`, the dot-reveal used an undefined `d`
  instead of `dot`. Fixed to `dot.BackgroundTransparency = 0`.

Everything else is preserved as-is.

## Admin panel v2 (AdminClient + AdminServer)

The admin panel was rebuilt with an animated GUI and a much larger action set.
It reuses the existing `AdminRequest` / `AdminIsAdmin` remotes — **no new instances
required**. Open with **F4** or the floating ⚡ button (admins only).

Pages & actions:

- **Money** — give / set / remove cash (with +1K/+10K/+100K/+1M quick chips),
  give-all, set-all, and multiply-everyone's-cash. Online-player dropdown target.
- **Players** — bring, goto, teleport, freeze/thaw, WalkSpeed & JumpPower sliders,
  heal, god / ungod, respawn, kill, kick, ban (super-admin).
- **World** — time-of-day slider + Dawn/Day/Dusk/Night presets, freeze-time toggle,
  brightness, fog distance, and gravity sliders (live, replicated via `Lighting`/`Workspace`).
- **Effects** — fire / sparkles / smoke / neon / clear, explode, fling, and body-size slider.
- **Announce** — advanced broadcast: message + RGB color picker (with preset chips) +
  duration slider + animation style (Slide / Fade / Flash). Rendered as an animated
  top banner for everyone.
- **Server** — live car list, give-car, and a restart-notice broadcast.

UI niceties: animated open/close (Back easing + fade), rotating gradient title bar,
custom sliders/toggles/dropdowns, hover tweens, a pulsing launcher button, and a
colored status line for action feedback. God mode, freezes, and time-freeze are all
enforced/held server-side.
