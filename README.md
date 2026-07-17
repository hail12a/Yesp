# Yesp Docs

A documentation-style site inspired by the [Claude Code docs](https://code.claude.com/docs/en/overview) — same tabs, sidebar, clean panels and light/dark theme — pointed at two very different worlds.

## Two tabs

- **🎮 Battlefeuer S2** — a full field manual for the Roblox game
  [Battlefeuer S2 [FFS] B39.11](https://www.roblox.com/games/112971188400049/Battlefeuer-S2-FFS-B39-11):
  getting started, loadouts & weapons, maps & modes, and pro tips.
- **⚛️ Quantum Lab** — revolutionary, boundary-pushing experiments that use
  code in ways it normally isn't: a superposition engine, entangled variables,
  quantum-walk search, and a general-purpose reality annealer.

## Features

- Section-aware sidebar that swaps with the active tab
- Inline tabbed panels, accordions, and copy-to-clipboard code blocks
- Fuzzy search (press `/`) across every page
- Light / dark theme, remembered between visits
- On-this-page table of contents with scroll-spy
- 100% static — no build step

## Run it

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Structure

```
index.html          # shell: top bar, sidebar, layout, search modal
assets/styles.css   # the Claude-docs-inspired theme
assets/content.js   # every page's content + search index
assets/app.js       # routing, tabs, accordion, search, theme
```
