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
│   ├── AdminClient.client.lua      -- admin panel v2 (animated; Money/Players/World/Effects/Announce/Server)
│   └── NovalOS.client.lua          -- phone popout (browser -> banking, send money, savings, stocks, DOE)
│
├── ServerScriptService/       -- Scripts (server). Place in ServerScriptService
│   ├── ShopPrompt.server.lua       -- ProximityPrompt on the "Shop" part -> opens dealership
│   ├── ChatStyleRelay.server.lua   -- relays/validates each player's chat color + font
│   ├── CrownHat.server.lua         -- gives a mesh crown hat to a specific player
│   ├── MoneyServer.server.lua      -- leaderstats.Money, DataStore save, timed payout
│   ├── DealershipServer.server.lua -- buy/sell/ownership, builds PreviewCars shells (logs to bank)
│   ├── CarSpawnServer.server.lua   -- secure car spawning from ServerStorage/DealerCars
│   ├── AdminServer.server.lua      -- server-validated admin actions (cash, cars, kick, etc.)
│   ├── BankServer.server.lua       -- NovalOS banking backend (send/savings/stocks/DOE); auto-creates its remotes
│   └── NovalOSTool.server.lua      -- gives every player the "NovalOS" phone Tool
│
└── ReplicatedStorage/         -- ModuleScripts. Place in ReplicatedStorage
    ├── CarCatalog.lua              -- the one file you edit to manage cars, prices, badges, types
    ├── AdminConfig.lua             -- who is an admin / super-admin
    └── StockMarket.lua             -- global deterministic stock prices (5 companies)
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
- ModuleScript `StockMarket` (from `src/ReplicatedStorage/StockMarket.lua`)
- Folder `PreviewCars`  (auto-built by DealershipServer)
- Folder `GearPreviews` (optional; gear models for the Tools panel)
- `BankRequest` / `BankNotify` / `BankLog` — **auto-created by BankServer**, nothing to add

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

## NovalOS phone + banking + stock market

A phone that pops out while you **hold the `NovalOS` Tool** (auto-given to players
by `NovalOSTool`). `BankServer` **auto-creates its own remotes**, so the only manual
step is placing `StockMarket` in ReplicatedStorage.

**Phone (`NovalOS.client.lua`)**
- Draggable window (PC mouse + mobile touch), auto-scales and clamps so it never
  leaves the screen. Drag from the top strip; `⌂` home, `⏻` power to hide.
- Home screen with apps; **Browser** is the functional one.
- Browser → "Little World Bank": the window **flips to a wide landscape "1080p"**
  banking dashboard (screenshot-1 layout, Novalis dark-pink theme from screenshot 2).

**Banking**
- **Overview** — Checking / Savings / Investments cards + recent transactions table.
- **Send Money** — pick an online player, see a live fee breakdown, send. The
  recipient gets **90%**; a **5% bank fee + 5% economy tax** go to the DOE. Both
  sides get a transaction entry + a toast.
- **Savings** — deposit/withdraw vs checking; **4.25% APY** paid automatically.
- **Stocks** — 5 global companies with **live prices** (see below), buy/sell by
  dollar amount (fractional shares), portfolio value, and a **DRIP** toggle
  (auto-reinvest dividends — the "option no other invest system has").
- **Transactions** — full history, incl. **car purchases/sales** (wired via `BankLog`).

**Department of Economy (DOE)** — a sidebar panel **only `D2Here4game` can see**:
the global treasury balance (every 5%+5% cut from every server flows here) and a
cross-server economy ledger.

**Stock market (`StockMarket.lua`)** — prices are a *pure deterministic function of
synced server time*, so every server **and** the client compute the exact same price
at the same instant — genuinely global, no syncing needed. The server still recomputes
the price when you actually trade. 5 companies with individual volatility and dividend
yields; interest + dividends accrue on a server loop.

Money changes go through the existing `leaderstats.Money` (MoneyServer). Per-player
savings/holdings/transactions save to DataStore `BankData_v1`; the DOE pool + ledger
to `DOE_Global_v1` (atomic `UpdateAsync`, shared across servers).

> Note: I couldn't run a Lua interpreter in this environment, so these were hand-checked
> (brackets balanced) — please test in Studio and report any runtime errors.
