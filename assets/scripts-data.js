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
    title: "2D Survival (.io) — Server",
    category: "Game",
    lang: "lua",
    file: "scripts/2d-survival-server.lua",
    tags: ["2d", "survival", "multiplayer", "io", "server"],
    what: "Authoritative .io world server.",
    does: "Runs a moomoo.io / starve.io-style top-down world: a continuous (grid-free) map of scattered trees, stones and berry bushes. Owns every player's position, health and inventory, handles smooth movement with collision, gathering and combat, and streams ~18 snapshots/sec to all clients (sending only the resource nodes that actually changed). Place in ServerScriptService with the companion LocalScript.",
  },
  {
    id: "2d-survival-client",
    title: "2D Survival (.io) — Client",
    category: "Game",
    lang: "lua",
    file: "scripts/2d-survival-client.lua",
    tags: ["2d", "survival", "multiplayer", "io", "gui", "client"],
    what: "Polished .io renderer + input.",
    does: "Draws the world in a ScreenGui the way the real .io games look: round characters with dark outlines, drop shadows, swinging hands, nametags and HP bars; leafy tree blobs, rounded stones and berry bushes; a flat vibrant palette with a soft vignette. Camera smoothly follows you and movement is interpolated so it never stutters. WASD move, G gather, F/click attack, Esc hide. Place in StarterPlayerScripts.",
  },
];
