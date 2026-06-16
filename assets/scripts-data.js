/* =========================================================
   scripts-data.js — the Script Library catalog.
   A standalone file, auto-wired via index.html. Each entry
   points at a real file in /scripts (the download source).
   server.js is NOT touched; this is pure front-end data.
   ========================================================= */
const SCRIPTS = [
  {
    id: "avatar-collector",
    title: "Avatar Collector",
    category: "Data",
    lang: "lua",
    file: "scripts/avatar-collector.lua",
    tags: ["avatars", "players", "datastore", "prototype"],
    what: "Saves player avatars.",
    does: "When a player joins, it grabs their headshot plus every worn item — looking up each item's real name and thumbnail and linking it to its Roblox catalog page — then sends it all to your site's Avatar Vault, stamped with the join date.",
  },
  {
    id: "bridge-core",
    title: "Bridge Core",
    category: "Networking",
    lang: "lua",
    file: "scripts/bridge-core.lua",
    tags: ["http", "bridge", "console", "commands"],
    what: "Game ↔ website link.",
    does: "The base connector. Sends game events to the website and listens for commands typed in the Live Console. Other scripts reuse the same say()/poll() pattern.",
  },
  {
    id: "live-telemetry",
    title: "Live Telemetry",
    category: "Networking",
    lang: "lua",
    file: "scripts/live-telemetry.lua",
    tags: ["http", "telemetry", "position", "sensor"],
    what: "Streams live player data.",
    does: "Every second, reports each player's position and speed to the website — turning the running game into a real-time sensor feed.",
  },
  {
    id: "rdr2-daynight",
    title: "RDR2 Day/Night Cycle",
    category: "Environment",
    lang: "lua",
    file: "scripts/rdr2-daynight-cycle.lua",
    tags: ["lighting", "atmosphere", "fog", "cycle"],
    what: "Cinematic day/night.",
    does: "A Red Dead Redemption 2-style lighting cycle with volumetric fog and warm/cool tones. Day lasts 20 minutes, night 10 minutes, with a whitelisted :time day / :time night command.",
  },
  {
    id: "2d-survival-server",
    title: "2D Survival — Server",
    category: "Game",
    lang: "lua",
    file: "scripts/2d-survival-server.lua",
    tags: ["2d", "survival", "multiplayer", "game", "server"],
    what: "Multiplayer 2D world server.",
    does: "Manages the shared tile world (40×30 procedural map with grass, trees, stone, water, food) and all player states. Handles movement, gathering, and combat via RemoteEvents — broadcasts full world sync to every client on each action. Place in ServerScriptService alongside the companion LocalScript.",
  },
  {
    id: "2d-survival-client",
    title: "2D Survival — Client",
    category: "Game",
    lang: "lua",
    file: "scripts/2d-survival-client.lua",
    tags: ["2d", "survival", "multiplayer", "game", "gui", "client"],
    what: "2D game renderer + input.",
    does: "Renders the tile world inside a ScreenGui (camera follows your character, viewport-culled for performance), draws all players as coloured dots with nametags, and shows a live HUD with HP, inventory, and player list. WASD to move, G to gather, F to attack, Esc to toggle. Place in StarterPlayerScripts.",
  },
];
