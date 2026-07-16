/* =========================================================
   Yesp Docs — self-updating static server.
   On every startup it pulls the latest files from GitHub,
   then serves them. No manual uploads, no git, no npm.
   ========================================================= */
const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");
const crypto = require("crypto");
let worldgen = null;
try { worldgen = require("./worldgen"); } catch (e) { console.log("[worldgen] not loaded:", e.message); }

const PORT   = process.env.SERVER_PORT || process.env.PORT || 8080;
const REPO   = process.env.REPO   || "hail12a/Yesp";
// Personal access token — required only if the repo is PRIVATE.
// Read from env var, or from a local token.txt file (which is gitignored
// so the secret never gets committed to the repo).
function readToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.TOKEN) return process.env.TOKEN.trim();
  for (const f of ["token.txt", ".token"]) {
    try { return fs.readFileSync(path.join(__dirname, f), "utf8").trim(); } catch (_) {}
  }
  return "";
}
const TOKEN  = readToken();
// Branches to try, in order. The website lives on the feature branch, so we
// try it FIRST — the panel often sets BRANCH=master, which only holds the old
// 2-file repo and must not win.
const BRANCHES = ["claude/festive-faraday-b4ljrz", process.env.BRANCH, "main", "master"]
  .filter(Boolean)
  .filter((b, i, a) => a.indexOf(b) === i);

// auth header for the GitHub API (works for private repos with a token)
const AUTH = TOKEN ? { Authorization: `token ${TOKEN}` } : {};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
};

/* ---- tiny HTTPS GET that follows redirects ---- */
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "yesp-updater", ...headers } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location, headers));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

/* ---- pull every file from the first branch that exists ----
   Uses the GitHub blob API (base64) so it works for PRIVATE repos
   too — no reliance on raw.githubusercontent.com. ---- */
async function updateFromBranch(branch) {
  const SKIP = [".git", "accounts.json", "worldstate.json", "doi.json", "tilecache"]; // never overwrite git internals or live runtime data
  const meta = JSON.parse(await get(`https://api.github.com/repos/${REPO}/branches/${branch}`, AUTH));
  const treeSha = meta.commit.commit.tree.sha;
  const tree = JSON.parse(await get(`https://api.github.com/repos/${REPO}/git/trees/${treeSha}?recursive=1`, AUTH));

  let count = 0;
  for (const entry of tree.tree) {
    if (entry.type !== "blob") continue;
    if (SKIP.some(s => entry.path.startsWith(s))) continue;

    const blob = JSON.parse(await get(`https://api.github.com/repos/${REPO}/git/blobs/${entry.sha}`, AUTH));
    const data = Buffer.from(blob.content, blob.encoding || "base64");
    const dest = path.join(__dirname, entry.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    count++;
  }
  return count;
}

async function selfUpdate() {
  for (const branch of BRANCHES) {
    try {
      console.log(`[updater] checking ${REPO}@${branch} …`);
      const count = await updateFromBranch(branch);
      console.log(`[updater] updated ${count} files from ${branch} ✔`);
      return; // first branch that works wins
    } catch (e) {
      console.log(`[updater] ${branch} unavailable (${e.message}), trying next…`);
    }
  }
  console.log("[updater] no branch reachable — serving local files.");
}

/* ---- bridge API state (in memory, resets on restart) ---- */
const rooms = {}; // { room: { messages: [], commands: [] } }
const room = name => (rooms[name] || (rooms[name] = { messages: [], commands: [] }));
const CAP = 200; // keep the last N messages per room

function readBody(req) {
  return new Promise(resolve => {
    let b = "";
    req.on("data", c => (b += c));
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch (_) { resolve({}); } });
  });
}

/* ---- accounts (persisted to accounts.json) + multiplayer world (in memory) ---- */
const ACCT_FILE = path.join(__dirname, "accounts.json");
let accounts = { secret: "", users: {} };
try { accounts = JSON.parse(fs.readFileSync(ACCT_FILE, "utf8")); } catch (_) {}
if (!accounts.secret) accounts.secret = crypto.randomBytes(24).toString("hex");
if (!accounts.users) accounts.users = {};
function saveAccounts() {
  try { fs.writeFileSync(ACCT_FILE, JSON.stringify(accounts)); }
  catch (e) { console.log("[accounts] save failed:", e.message); }
}
function hashPw(pw, salt) {
  return crypto.pbkdf2Sync(pw, salt, 60000, 32, "sha256").toString("hex");
}
function tokenFor(key) {
  return key + "." + crypto.createHmac("sha256", accounts.secret).update(key).digest("hex").slice(0, 32);
}
function userFromToken(t) {
  if (!t || typeof t !== "string") return null;
  const i = t.lastIndexOf(".");
  if (i < 1) return null;
  const key = t.slice(0, i);
  return tokenFor(key) === t ? key : null;
}

const world = {}; // key -> { user, lat, lng, heading, speed, mode, car, carLat, carLng, ts }
const WORLD_TTL = 15000;

/* ---- DOI network (servers, channels, chat, friends, DMs, profiles) ---- */
const DOI_FILE = path.join(__dirname, "doi.json");
let doiStore = { servers: {}, friends: {}, friendReqs: {}, dms: {}, profiles: {}, hiddenDMs: {}, groups: {}, siteAccent: "", shop: null };
try {
  const loaded = JSON.parse(fs.readFileSync(DOI_FILE, "utf8"));
  if (loaded && typeof loaded === "object") {
    doiStore.servers    = (loaded.servers    && typeof loaded.servers    === "object") ? loaded.servers    : {};
    doiStore.friends    = (loaded.friends    && typeof loaded.friends    === "object") ? loaded.friends    : {};
    doiStore.friendReqs = (loaded.friendReqs && typeof loaded.friendReqs === "object") ? loaded.friendReqs : {};
    doiStore.dms        = (loaded.dms        && typeof loaded.dms        === "object") ? loaded.dms        : {};
    doiStore.profiles   = (loaded.profiles   && typeof loaded.profiles   === "object") ? loaded.profiles   : {};
    doiStore.hiddenDMs  = (loaded.hiddenDMs  && typeof loaded.hiddenDMs  === "object") ? loaded.hiddenDMs  : {};
    doiStore.groups     = (loaded.groups     && typeof loaded.groups     === "object") ? loaded.groups     : {};
    doiStore.siteAccent = (typeof loaded.siteAccent === "string") ? loaded.siteAccent : "";
    doiStore.shop       = (loaded.shop && Array.isArray(loaded.shop.items)) ? loaded.shop : null;
  }
} catch (_) {}

// Seed the flagship "DOI · Site-CI" server on first boot. Owner is 'doi' (the
// user key registered as callsign "DOI"). Everyone auto-joins on login.
const DOI_FLAGSHIP_ID = "srv-doi-flagship";
if (!doiStore.servers[DOI_FLAGSHIP_ID]) {
  doiStore.servers[DOI_FLAGSHIP_ID] = {
    id: DOI_FLAGSHIP_ID,
    name: "DOI · Site-CI",
    description: "The flagship Novalis server. Owner: DOI.",
    ownerKey: "doi",
    icon: null,
    created: Date.now(),
    isFlagship: true,
    categories: [
      { id:"cat-general", name:"GENERAL", order: 0 },
      { id:"cat-ops",     name:"OPS",     order: 1 },
    ],
    channels: [
      { id:"ch-general",   name:"general",   categoryId:"cat-general", topic:"DOI general chat — everyone welcome." },
      { id:"ch-briefings", name:"briefings", categoryId:"cat-general", topic:"Officer briefings and announcements." },
      { id:"ch-ops",       name:"ops",       categoryId:"cat-ops",     topic:"Operations coordination." },
      { id:"ch-blackline", name:"blackline", categoryId:"cat-ops",     topic:"BLACKLINE · restricted operations." },
    ],
    members: ["doi"],
    chat: {
      "ch-general":  [{ id:"m1", author:"DOI", ts: 1704067200000, text:"DOI network online. Speak freely." }],
      "ch-briefings":[{ id:"m1", author:"DOI", ts: 1704067200000, text:"Officer briefings post here. Dismantling greed is the mission." }],
      "ch-ops":      [{ id:"m1", author:"DOI", ts: 1704067200000, text:"Ops channel is open. Keep it professional." }],
      "ch-blackline":[{ id:"m1", author:"DOI", ts: 1704067200000, text:"BLACKLINE — restricted channel." }]
    }
  };
}

// Seed a starter shop on first boot. Items are owner-editable at runtime.
// kind: "premium" | "decoration" | "nameplate" | "effect" | "frame"
if (!doiStore.shop) {
  doiStore.shop = { items: [
    { id: "sku-premium",   kind: "premium",    name: "Novalis Premium", price: 9.99, image: "", desc: "Custom accent, bubble effects, profile flair." },
    { id: "sku-bonsai",    kind: "effect",     name: "Bonsai Eternity", price: 4.99, image: "", desc: "Drifting pink bonsai leaves across your profile." },
    { id: "sku-dreamhop",  kind: "nameplate",  name: "Dream Hop",       price: 3.99, image: "", desc: "A winged bunny hops behind your name." },
    { id: "sku-crystals",  kind: "frame",      name: "Crystals",        price: 4.99, image: "", desc: "Purple crystal clusters crown your avatar." },
    { id: "sku-chillet",   kind: "decoration", name: "Chillet",         price: 8.99, image: "", desc: "A frosty companion hugs your avatar." }
  ] };
}

let doiSaveTimer = null;
function saveDoi() {
  if (doiSaveTimer) return;
  doiSaveTimer = setTimeout(() => {
    doiSaveTimer = null;
    try { fs.writeFileSync(DOI_FILE, JSON.stringify(doiStore)); }
    catch (e) { console.log("[doi] save failed:", e.message); }
  }, 600);
}

const DOI_MSG_CAP    = 300;         // messages per channel
const DOI_SRV_CAP    = 100;         // servers per user

function doiUserFromToken(t) {
  const k = userFromToken(t);
  if (!k) return null;
  const rec = accounts.users[k];
  return rec ? { key: k, name: rec.user } : null;
}
function doiProfile(key) {
  const p = doiStore.profiles[key] || {};
  const rec = accounts.users[key];
  return {
    key,
    name: rec ? rec.user : key,
    tag:  p.tag   || ("#" + String(1000 + (Math.abs(hashCode(key)) % 9000))),
    bio:  p.bio   || "Insurgent",
    pronouns: p.pronouns || "",
    avatar: p.avatar || null,
    bannerColor: p.bannerColor || defaultBanner(key),
    messagePrivacy: p.messagePrivacy || "anyone",   // "anyone" | "friends"
    theme: p.theme || "discord",                    // "discord" | "insurgency" (owner-only meaningful)
    accent: p.accent || doiStore.siteAccent || "#5865f2",  // per-user accent; falls back to owner-set site default
    siteAccent: doiStore.siteAccent || "",          // owner-pushed default (for the Appearance toggle state)
    bubbles: p.bubbles !== false,                   // iOS26 bubble effects on by default
    premium: !!p.premium,                           // has Novalis Premium
    owned: Array.isArray(p.owned) ? p.owned : [],   // owned shop item ids
    equipped: (p.equipped && typeof p.equipped === "object") ? p.equipped : {},  // {decoration,effect,nameplate,frame} -> itemId
    joined: (rec && rec.created) || Date.now(),
    isDOI: !!(rec && rec.user === "DOI")
  };
}
function defaultBanner(key) {
  const h = Math.abs(hashCode(key));
  const palette = ["#5865f2","#3b7ec1","#6b4bd4","#8b5cf6","#c8102e","#0e7a3f","#9c8f4f","#2a4d69"];
  return palette[h % palette.length];
}
function dmPairKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
function areFriends(a, b) {
  return (doiStore.friends[a] || []).includes(b);
}
// Group-DM descriptor. When `full`, includes messages.
function doiGroupBrief(g, userKey, full) {
  const members = (g.members || []).map(k => doiProfile(k));
  const msgs = g.messages || [];
  const last = msgs[msgs.length - 1] || null;
  const auto = members.filter(m => m.key !== userKey).map(m => m.name).join(", ") || "Empty group";
  const brief = {
    id: g.id, kind: "group",
    name: g.name || auto,
    autoName: auto,
    icon: g.icon || null,
    ownerKey: g.ownerKey,
    isOwner: g.ownerKey === userKey,
    members,
    memberCount: members.length,
    created: g.created,
    lastTs: last ? last.ts : g.created,
    lastText: last ? ((last.from ? last.from + ": " : "") + last.text) : "",
  };
  if (full) brief.messages = msgs;
  return brief;
}
function groupHasMember(g, key) { return (g.members || []).includes(key); }
function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h; }

// Return a compact server descriptor (no chat, no member details) for lists.
function doiServerBrief(s, userKey) {
  return {
    id: s.id, name: s.name, description: s.description || "",
    icon: s.icon || null, ownerKey: s.ownerKey,
    isOwner: s.ownerKey === userKey,
    isFlagship: !!s.isFlagship,
    memberCount: (s.members || []).length,
    created: s.created
  };
}
// Return the full server (channels, categories, members) — caller must be member.
function doiServerFull(s, userKey) {
  return {
    ...doiServerBrief(s, userKey),
    categories: s.categories || [],
    channels: s.channels || [],
    members: (s.members || []).map(k => ({
      key: k,
      name: (accounts.users[k] ? accounts.users[k].user : k),
      avatar: (doiStore.profiles[k] && doiStore.profiles[k].avatar) || null,
      isOwner: k === s.ownerKey
    }))
  };
}

// Auto-add the flagship server to any user on first authenticated request.
function ensureFlagshipMembership(userKey) {
  const flagship = doiStore.servers[DOI_FLAGSHIP_ID];
  if (!flagship) return;
  if (!flagship.members.includes(userKey)) {
    flagship.members.push(userKey);
    saveDoi();
  }
  // If this user is the DOI account, they own the flagship
  const rec = accounts.users[userKey];
  if (rec && rec.user === "DOI" && flagship.ownerKey !== userKey) {
    flagship.ownerKey = userKey;
    saveDoi();
  }
}

/* ---- persistent world changes (trees cut, wildlife, …) ----
   Stored on disk so forest harvesting + wildlife edits survive restarts and
   are shared by every player. Structure is intentionally extensible. */
const WORLD_FILE = path.join(__dirname, "worldstate.json");
let worldState = { trees: {}, wildlife: {} };
try {
  const loaded = JSON.parse(fs.readFileSync(WORLD_FILE, "utf8"));
  if (loaded && typeof loaded === "object") {
    worldState.trees = loaded.trees || {};
    worldState.wildlife = loaded.wildlife || {};
  }
} catch (_) {}
let worldSaveTimer = null;
function saveWorldState() {
  // debounce disk writes — harvesting can fire several POSTs per second
  if (worldSaveTimer) return;
  worldSaveTimer = setTimeout(() => {
    worldSaveTimer = null;
    try { fs.writeFileSync(WORLD_FILE, JSON.stringify(worldState)); }
    catch (e) { console.log("[worldstate] save failed:", e.message); }
  }, 800);
}

const numOr = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const strOr = (v, n = 24) => (typeof v === "string" ? v.slice(0, n) : "");

function sendJSON(res, obj, codeNum = 200) {
  res.writeHead(codeNum, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

async function handleApi(req, res, urlPath, query) {
  if (req.method === "OPTIONS") return sendJSON(res, {});
  const name = query.get("room") || "default";

  if (urlPath === "/api/say" && req.method === "POST") {
    const m = await readBody(req);
    const entry = { from: m.from || "game", text: m.text || "", data: m.data || {}, ts: Date.now() };
    const r = room(m.room || name);
    r.messages.push(entry);
    if (r.messages.length > CAP) r.messages.splice(0, r.messages.length - CAP);
    return sendJSON(res, { ok: true });
  }
  if (urlPath === "/api/messages" && req.method === "GET") {
    return sendJSON(res, room(name).messages);
  }
  if (urlPath === "/api/cmd" && req.method === "POST") {
    const m = await readBody(req);
    room(m.room || name).commands.push({ text: m.text || "", ts: Date.now() });
    return sendJSON(res, { ok: true });
  }
  if (urlPath === "/api/commands" && req.method === "GET") {
    const r = room(name);
    const pending = r.commands;
    r.commands = []; // deliver once, then clear
    return sendJSON(res, pending);
  }
  if (urlPath === "/api/clear" && req.method === "POST") {
    const m = await readBody(req);
    room(m.room || name).messages = [];
    return sendJSON(res, { ok: true });
  }

  /* ---- accounts ---- */
  if (urlPath === "/api/register" && req.method === "POST") {
    const m = await readBody(req);
    const user = strOr(m.user, 16).trim();
    const pass = String(m.pass || "");
    if (!/^[A-Za-z0-9_]{3,16}$/.test(user))
      return sendJSON(res, { error: "Username must be 3–16 letters, numbers or _" }, 400);
    if (pass.length < 4)
      return sendJSON(res, { error: "Password must be at least 4 characters" }, 400);
    const key = user.toLowerCase();
    if (accounts.users[key]) return sendJSON(res, { error: "That username is taken" }, 409);
    const salt = crypto.randomBytes(16).toString("hex");
    accounts.users[key] = { user, salt, hash: hashPw(pass, salt), created: Date.now() };
    saveAccounts();
    return sendJSON(res, { ok: true, token: tokenFor(key), user });
  }
  if (urlPath === "/api/login" && req.method === "POST") {
    const m = await readBody(req);
    const user = strOr(m.user, 16).trim();
    const pass = String(m.pass || "");
    const rec = accounts.users[user.toLowerCase()];
    if (!rec || rec.hash !== hashPw(pass, rec.salt))
      return sendJSON(res, { error: "Wrong username or password" }, 401);
    return sendJSON(res, { ok: true, token: tokenFor(user.toLowerCase()), user: rec.user });
  }

  /* ---- multiplayer world ---- */
  if (urlPath === "/api/world/sync" && req.method === "POST") {
    const m = await readBody(req);
    const key = userFromToken(m.token);
    if (!key) return sendJSON(res, { error: "Not logged in" }, 401);
    const rec = accounts.users[key];
    world[key] = {
      user: rec ? rec.user : key,
      lat: numOr(m.lat), lng: numOr(m.lng),
      heading: numOr(m.heading), speed: numOr(m.speed),
      mode: strOr(m.mode, 8) || "drive",
      car: strOr(m.car, 24),
      carLat: numOr(m.carLat, numOr(m.lat)), carLng: numOr(m.carLng, numOr(m.lng)),
      ts: Date.now(),
    };
    const now = Date.now();
    const players = [];
    for (const k in world) {
      if (now - world[k].ts > WORLD_TTL) { delete world[k]; continue; }
      if (k !== key) players.push(world[k]);
    }
    return sendJSON(res, { ok: true, you: world[key].user, players });
  }
  if (urlPath === "/api/world/players" && req.method === "GET") {
    const now = Date.now();
    const players = [];
    for (const k in world) {
      if (now - world[k].ts > WORLD_TTL) { delete world[k]; continue; }
      players.push({ user: world[k].user, lat: world[k].lat, lng: world[k].lng });
    }
    return sendJSON(res, players);
  }

  /* ---- persistent world changes (trees + wildlife) ---- */
  if (urlPath === "/api/world/state" && req.method === "GET") {
    // full snapshot of every persistent change (loaded once on join)
    return sendJSON(res, { ok: true, trees: worldState.trees, wildlife: worldState.wildlife });
  }
  if (urlPath === "/api/world/tree_cut" && req.method === "POST") {
    const m = await readBody(req);
    const key = userFromToken(m.token);
    if (!key) return sendJSON(res, { error: "Not logged in" }, 401);
    const id = strOr(m.id, 40);
    if (!id) return sendJSON(res, { error: "missing id" }, 400);
    const rec = accounts.users[key];
    if (!worldState.trees[id]) {
      worldState.trees[id] = {
        by: rec ? rec.user : key,
        lat: numOr(m.lat), lng: numOr(m.lng),
        at: Date.now(),
      };
      saveWorldState();
    }
    return sendJSON(res, { ok: true, id, trees: worldState.trees[id] });
  }

  /* ---- real-world → Roblox tile generation ---- */
  if (urlPath === "/api/world/tile" && req.method === "GET") {
    if (!worldgen) return sendJSON(res, { error: "worldgen unavailable" }, 503);
    const lat = parseFloat(query.get("lat")), lng = parseFloat(query.get("lng"));
    const size = parseInt(query.get("size") || "3000", 10);
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
      return sendJSON(res, { error: "lat/lng required (valid coordinates)" }, 400);
    try {
      const tile = await worldgen.buildTile(lat, lng, size);
      return sendJSON(res, tile);
    } catch (e) {
      return sendJSON(res, { error: "tile build failed: " + e.message }, 500);
    }
  }
  if (urlPath === "/api/world/roblox.lua" && req.method === "GET") {
    if (!worldgen) { res.writeHead(503); return res.end("worldgen unavailable"); }
    const lat = parseFloat(query.get("lat")), lng = parseFloat(query.get("lng"));
    let size = parseInt(query.get("size") || "3000", 10);
    if (!isFinite(lat) || !isFinite(lng)) { res.writeHead(400); return res.end("-- lat/lng query params required"); }
    size = Math.max(worldgen.MIN_SIZE, Math.min(worldgen.MAX_SIZE, size || 3000));
    // derive the public origin so the baked-in endpoint URL is reachable
    const proto = req.headers["x-forwarded-proto"] || "http";
    const host = query.get("host") || (proto + "://" + (req.headers["x-forwarded-host"] || req.headers.host || "localhost:" + PORT));
    const lua = worldgen.robloxScript(host, lat, lng, size);
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    return res.end(lua);
  }

  /* ---- DOI network: profile, servers, channels, chat, friends ---- */
  if (urlPath === "/api/doi/me" && req.method === "GET") {
    const tok = query.get("token") || "";
    const u = doiUserFromToken(tok);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    ensureFlagshipMembership(u.key);
    return sendJSON(res, { ok: true, profile: doiProfile(u.key) });
  }
  if (urlPath === "/api/doi/me" && req.method === "POST") {
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const p = doiStore.profiles[u.key] || {};
    if (typeof m.bio === "string")           p.bio      = m.bio.slice(0, 200);
    if (typeof m.pronouns === "string")      p.pronouns = m.pronouns.slice(0, 20);
    if (typeof m.bannerColor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(m.bannerColor)) p.bannerColor = m.bannerColor;
    if (m.messagePrivacy === "friends" || m.messagePrivacy === "anyone") p.messagePrivacy = m.messagePrivacy;
    if ((m.theme === "discord" || m.theme === "insurgency") && u.name === "DOI") p.theme = m.theme;
    if (typeof m.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(m.accent)) p.accent = m.accent;
    if (typeof m.accentReset !== "undefined" && m.accentReset) delete p.accent;
    if (typeof m.bubbles === "boolean") p.bubbles = m.bubbles;
    // Owner can push a site-wide default accent to every user (like the theme toggle).
    if (u.name === "DOI" && typeof m.siteAccent === "string") {
      doiStore.siteAccent = /^#[0-9a-fA-F]{6}$/.test(m.siteAccent) ? m.siteAccent : "";
    }
    if (typeof m.avatar === "string") { if (m.avatar.length < 260_000) p.avatar = m.avatar; }
    doiStore.profiles[u.key] = p;
    saveDoi();
    return sendJSON(res, { ok: true, profile: doiProfile(u.key) });
  }

  // ---------- SHOP ----------
  if (urlPath === "/api/doi/shop" && req.method === "GET") {
    const u = doiUserFromToken(query.get("token") || "");
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    return sendJSON(res, { ok: true, items: doiStore.shop.items, me: doiProfile(u.key), isOwner: u.name === "DOI" });
  }
  if (urlPath === "/api/doi/shop/admin" && req.method === "POST") {
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    if (u.name !== "DOI") return sendJSON(res, { error: "Owner only" }, 403);
    if (m.action === "add") {
      const kinds = ["premium", "decoration", "nameplate", "effect", "frame"];
      const kind = kinds.includes(m.kind) ? m.kind : "decoration";
      const name = String(m.name || "").trim().slice(0, 40);
      if (!name) return sendJSON(res, { error: "Name required" }, 400);
      const price = Math.max(0, Math.min(999, Number(m.price) || 0));
      const image = (typeof m.image === "string" && m.image.length < 400) ? m.image.trim() : "";
      const desc  = String(m.desc || "").slice(0, 140);
      const id = "sku-" + Math.abs(hashCode(name + kind + Date.now())).toString(36);
      doiStore.shop.items.push({ id, kind, name, price, image, desc });
    } else if (m.action === "remove") {
      doiStore.shop.items = doiStore.shop.items.filter(it => it.id !== m.id);
    }
    saveDoi();
    return sendJSON(res, { ok: true, items: doiStore.shop.items });
  }
  if (urlPath === "/api/doi/shop/buy" && req.method === "POST") {
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const item = doiStore.shop.items.find(it => it.id === m.id);
    if (!item) return sendJSON(res, { error: "No such item" }, 404);
    const p = doiStore.profiles[u.key] || {};
    p.owned = Array.isArray(p.owned) ? p.owned : [];
    if (!p.owned.includes(item.id)) p.owned.push(item.id);
    if (item.kind === "premium") p.premium = true;
    doiStore.profiles[u.key] = p;
    saveDoi();
    return sendJSON(res, { ok: true, profile: doiProfile(u.key) });
  }
  if (urlPath === "/api/doi/shop/equip" && req.method === "POST") {
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const p = doiStore.profiles[u.key] || {};
    p.owned = Array.isArray(p.owned) ? p.owned : [];
    p.equipped = (p.equipped && typeof p.equipped === "object") ? p.equipped : {};
    const item = doiStore.shop.items.find(it => it.id === m.id);
    if (m.unequip && ["decoration", "nameplate", "effect", "frame"].includes(m.slot)) {
      delete p.equipped[m.slot];
    } else if (item && ["decoration", "nameplate", "effect", "frame"].includes(item.kind)) {
      if (!p.owned.includes(item.id)) return sendJSON(res, { error: "Not owned" }, 400);
      p.equipped[item.kind] = item.id;
    }
    doiStore.profiles[u.key] = p;
    saveDoi();
    return sendJSON(res, { ok: true, profile: doiProfile(u.key) });
  }

  // Public profile of any user (for popup card). Doesn't leak email, hash, etc.
  {
    const mm = urlPath.match(/^\/api\/doi\/profile\/([^/]+)$/);
    if (mm && req.method === "GET") {
      const tok = query.get("token") || "";
      const u = doiUserFromToken(tok);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const targetKey = mm[1].toLowerCase();
      if (!accounts.users[targetKey]) return sendJSON(res, { error: "not found" }, 404);
      const prof = doiProfile(targetKey);
      const friendState =
        targetKey === u.key ? "self" :
        areFriends(u.key, targetKey) ? "friends" :
        (doiStore.friendReqs[targetKey] || []).some(r => r.from === u.key) ? "outgoing" :
        (doiStore.friendReqs[u.key] || []).some(r => r.from === targetKey) ? "incoming" :
        "none";
      return sendJSON(res, { ok: true, profile: prof, friendState });
    }
  }

  /* ---- servers ---- */
  if (urlPath === "/api/doi/servers" && req.method === "GET") {
    const tok = query.get("token") || "";
    const u = doiUserFromToken(tok);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    ensureFlagshipMembership(u.key);
    const mine = Object.values(doiStore.servers)
      .filter(s => (s.members || []).includes(u.key))
      .map(s => doiServerBrief(s, u.key));
    return sendJSON(res, { ok: true, servers: mine });
  }
  if (urlPath === "/api/doi/servers" && req.method === "POST") {
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const name = String(m.name || "").trim().slice(0, 40);
    if (!name) return sendJSON(res, { error: "Server name required" }, 400);
    const mine = Object.values(doiStore.servers).filter(s => s.ownerKey === u.key).length;
    if (mine >= DOI_SRV_CAP) return sendJSON(res, { error: "server cap reached" }, 429);
    const id = "srv-" + crypto.randomBytes(6).toString("hex");
    const catId = "cat-" + crypto.randomBytes(3).toString("hex");
    const chId  = "ch-" + crypto.randomBytes(3).toString("hex");
    const srv = {
      id, name, description: String(m.description || "").slice(0, 200),
      ownerKey: u.key, icon: null, created: Date.now(),
      categories: [{ id: catId, name: "GENERAL", order: 0 }],
      channels: [{ id: chId, name: "general", categoryId: catId, topic: "" }],
      members: [u.key],
      chat: { [chId]: [] }
    };
    doiStore.servers[id] = srv;
    saveDoi();
    return sendJSON(res, { ok: true, server: doiServerFull(srv, u.key) });
  }
  // /api/doi/servers/:id  — GET (full detail for member)
  {
    const mFull = urlPath.match(/^\/api\/doi\/servers\/([^/]+)$/);
    if (mFull && req.method === "GET") {
      const tok = query.get("token") || "";
      const u = doiUserFromToken(tok);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mFull[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      if (!(s.members || []).includes(u.key)) return sendJSON(res, { error: "not a member" }, 403);
      return sendJSON(res, { ok: true, server: doiServerFull(s, u.key) });
    }
  }
  // /api/doi/servers/:id/join
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/join$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      if (!s.members.includes(u.key)) { s.members.push(u.key); saveDoi(); }
      return sendJSON(res, { ok: true, server: doiServerFull(s, u.key) });
    }
  }
  // /api/doi/servers/:id/leave
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/leave$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      if (s.isFlagship) return sendJSON(res, { error: "cannot leave the flagship server" }, 400);
      if (s.ownerKey === u.key) return sendJSON(res, { error: "owner cannot leave — delete the server instead" }, 400);
      s.members = s.members.filter(k => k !== u.key);
      saveDoi();
      return sendJSON(res, { ok: true });
    }
  }
  // /api/doi/servers/:id/settings   (owner only) — rename, description, icon
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/settings$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      if (s.ownerKey !== u.key) return sendJSON(res, { error: "owner only" }, 403);
      if (typeof m.name === "string" && m.name.trim()) s.name = m.name.trim().slice(0, 40);
      if (typeof m.description === "string") s.description = m.description.slice(0, 200);
      if (typeof m.icon === "string" && m.icon.length < 260_000) s.icon = m.icon;
      if (m.icon === null) s.icon = null;
      saveDoi();
      return sendJSON(res, { ok: true, server: doiServerFull(s, u.key) });
    }
  }
  // /api/doi/servers/:id/delete  (owner only, non-flagship)
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/delete$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      if (s.isFlagship) return sendJSON(res, { error: "cannot delete flagship" }, 400);
      if (s.ownerKey !== u.key) return sendJSON(res, { error: "owner only" }, 403);
      delete doiStore.servers[mm[1]];
      saveDoi();
      return sendJSON(res, { ok: true });
    }
  }
  // /api/doi/servers/:id/categories  (POST — owner only)
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/categories$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      if (s.ownerKey !== u.key) return sendJSON(res, { error: "owner only" }, 403);
      const name = String(m.name || "").trim().slice(0, 30).toUpperCase();
      if (!name) return sendJSON(res, { error: "category name required" }, 400);
      const cat = { id: "cat-" + crypto.randomBytes(3).toString("hex"), name, order: (s.categories || []).length };
      s.categories = s.categories || []; s.categories.push(cat);
      saveDoi();
      return sendJSON(res, { ok: true, category: cat });
    }
  }
  // /api/doi/servers/:sid/categories/:cid/delete  (owner only)
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/categories\/([^/]+)\/delete$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      if (s.ownerKey !== u.key) return sendJSON(res, { error: "owner only" }, 403);
      s.categories = (s.categories || []).filter(c => c.id !== mm[2]);
      // channels in that category become uncategorized (null)
      (s.channels || []).forEach(ch => { if (ch.categoryId === mm[2]) ch.categoryId = null; });
      saveDoi();
      return sendJSON(res, { ok: true });
    }
  }
  // /api/doi/servers/:id/channels  (POST — owner only)
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/channels$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      if (s.ownerKey !== u.key) return sendJSON(res, { error: "owner only" }, 403);
      const name = String(m.name || "").trim().slice(0, 24).toLowerCase().replace(/[^a-z0-9\-_]/g, "-");
      if (!name) return sendJSON(res, { error: "channel name required" }, 400);
      const catId = m.categoryId && (s.categories || []).some(c => c.id === m.categoryId) ? m.categoryId : null;
      const ch = {
        id: "ch-" + crypto.randomBytes(3).toString("hex"),
        name, categoryId: catId, topic: String(m.topic || "").slice(0, 200)
      };
      s.channels = s.channels || []; s.channels.push(ch);
      s.chat = s.chat || {}; s.chat[ch.id] = [];
      saveDoi();
      return sendJSON(res, { ok: true, channel: ch });
    }
  }
  // /api/doi/servers/:sid/channels/:cid/delete  (owner only)
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/channels\/([^/]+)\/delete$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      if (s.ownerKey !== u.key) return sendJSON(res, { error: "owner only" }, 403);
      s.channels = (s.channels || []).filter(c => c.id !== mm[2]);
      if (s.chat) delete s.chat[mm[2]];
      saveDoi();
      return sendJSON(res, { ok: true });
    }
  }
  // /api/doi/servers/:sid/chat/:cid  (GET ?since=ts, POST {token,text})  (member only)
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/chat\/([^/]+)$/);
    if (mm) {
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      const cid = mm[2];
      if (!(s.channels || []).some(c => c.id === cid)) return sendJSON(res, { error: "channel not found" }, 404);
      if (req.method === "GET") {
        const tok = query.get("token") || "";
        const u = doiUserFromToken(tok);
        if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
        if (!(s.members || []).includes(u.key)) return sendJSON(res, { error: "not a member" }, 403);
        const since = parseInt(query.get("since") || "0", 10) || 0;
        const all = (s.chat && s.chat[cid]) || [];
        const msgs = since ? all.filter(x => x.ts > since) : all;
        return sendJSON(res, { ok: true, messages: msgs, now: Date.now() });
      }
      if (req.method === "POST") {
        const m = await readBody(req);
        const u = doiUserFromToken(m.token);
        if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
        if (!(s.members || []).includes(u.key)) return sendJSON(res, { error: "not a member" }, 403);
        const text = String(m.text || "").trim().slice(0, 2000);
        if (!text) return sendJSON(res, { error: "empty message" }, 400);
        s.chat = s.chat || {}; s.chat[cid] = s.chat[cid] || [];
        const post = { id: "c-" + crypto.randomBytes(5).toString("hex"), author: u.name, authorKey: u.key, ts: Date.now(), text };
        s.chat[cid].push(post);
        if (s.chat[cid].length > DOI_MSG_CAP) s.chat[cid].splice(0, s.chat[cid].length - DOI_MSG_CAP);
        saveDoi();
        return sendJSON(res, { ok: true, message: post });
      }
    }
  }
  // Edit or delete a channel message (author-only, or server owner)
  {
    const mm = urlPath.match(/^\/api\/doi\/servers\/([^/]+)\/chat\/([^/]+)\/(edit|delete)$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const s = doiStore.servers[mm[1]];
      if (!s) return sendJSON(res, { error: "not found" }, 404);
      const cid = mm[2], op = mm[3];
      const list = (s.chat && s.chat[cid]) || [];
      const idx = list.findIndex(x => x.id === m.mid);
      if (idx === -1) return sendJSON(res, { error: "message not found" }, 404);
      const msg = list[idx];
      const isAuthor = msg.authorKey === u.key || msg.author === u.name;
      const isOwner  = s.ownerKey === u.key;
      if (!isAuthor && !(isOwner && op === "delete")) return sendJSON(res, { error: "not allowed" }, 403);
      if (op === "delete") { list.splice(idx, 1); saveDoi(); return sendJSON(res, { ok: true, deleted: m.mid }); }
      const text = String(m.text || "").trim().slice(0, 2000);
      if (!text) return sendJSON(res, { error: "empty message" }, 400);
      msg.text = text; msg.edited = Date.now();
      saveDoi();
      return sendJSON(res, { ok: true, message: msg });
    }
  }

  /* ---- friends (with request model) ---- */
  if (urlPath === "/api/doi/friends" && req.method === "GET") {
    const tok = query.get("token") || "";
    const u = doiUserFromToken(tok);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const list = (doiStore.friends[u.key] || []).map(k => doiProfile(k));
    return sendJSON(res, { ok: true, friends: list });
  }
  if (urlPath === "/api/doi/friends/requests" && req.method === "GET") {
    const tok = query.get("token") || "";
    const u = doiUserFromToken(tok);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const incoming = (doiStore.friendReqs[u.key] || []).map(r => ({ ...doiProfile(r.from), at: r.at }));
    // outgoing = anyone whose friendReqs list contains u.key
    const outgoing = [];
    for (const receiverKey in doiStore.friendReqs) {
      for (const r of (doiStore.friendReqs[receiverKey] || [])) {
        if (r.from === u.key) outgoing.push({ ...doiProfile(receiverKey), at: r.at });
      }
    }
    return sendJSON(res, { ok: true, incoming, outgoing });
  }
  // Send a friend request (or auto-accept if reciprocal already exists)
  if ((urlPath === "/api/doi/friends/add" || urlPath === "/api/doi/friends/request") && req.method === "POST") {
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const call = String(m.callsign || "").trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(call)) return sendJSON(res, { error: "invalid callsign" }, 400);
    const targetKey = call.toLowerCase();
    if (targetKey === u.key) return sendJSON(res, { error: "cannot befriend yourself" }, 400);
    if (!accounts.users[targetKey]) return sendJSON(res, { error: "no such operative" }, 404);
    if (areFriends(u.key, targetKey)) return sendJSON(res, { error: "already friends" }, 400);
    // Reciprocal request? auto-accept.
    const myPending = doiStore.friendReqs[u.key] || [];
    if (myPending.some(r => r.from === targetKey)) {
      doiStore.friendReqs[u.key] = myPending.filter(r => r.from !== targetKey);
      doiStore.friends[u.key]     = doiStore.friends[u.key]     || [];
      doiStore.friends[targetKey] = doiStore.friends[targetKey] || [];
      if (!doiStore.friends[u.key].includes(targetKey)) doiStore.friends[u.key].push(targetKey);
      if (!doiStore.friends[targetKey].includes(u.key)) doiStore.friends[targetKey].push(u.key);
      saveDoi();
      return sendJSON(res, { ok: true, state: "friends" });
    }
    // Already sent?
    const theirPending = doiStore.friendReqs[targetKey] || [];
    if (theirPending.some(r => r.from === u.key)) return sendJSON(res, { error: "request already sent" }, 400);
    doiStore.friendReqs[targetKey] = theirPending.concat({ from: u.key, at: Date.now() });
    saveDoi();
    return sendJSON(res, { ok: true, state: "outgoing" });
  }
  if (urlPath === "/api/doi/friends/accept" && req.method === "POST") {
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const fromKey = String(m.from || "").toLowerCase();
    const pending = doiStore.friendReqs[u.key] || [];
    if (!pending.some(r => r.from === fromKey)) return sendJSON(res, { error: "no such request" }, 404);
    doiStore.friendReqs[u.key] = pending.filter(r => r.from !== fromKey);
    doiStore.friends[u.key]    = doiStore.friends[u.key]    || [];
    doiStore.friends[fromKey]  = doiStore.friends[fromKey]  || [];
    if (!doiStore.friends[u.key].includes(fromKey))  doiStore.friends[u.key].push(fromKey);
    if (!doiStore.friends[fromKey].includes(u.key))  doiStore.friends[fromKey].push(u.key);
    saveDoi();
    return sendJSON(res, { ok: true });
  }
  if (urlPath === "/api/doi/friends/decline" && req.method === "POST") {
    // decline incoming OR cancel own outgoing
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const otherKey = String(m.from || m.to || "").toLowerCase();
    if (doiStore.friendReqs[u.key])    doiStore.friendReqs[u.key]    = doiStore.friendReqs[u.key].filter(r => r.from !== otherKey);
    if (doiStore.friendReqs[otherKey]) doiStore.friendReqs[otherKey] = doiStore.friendReqs[otherKey].filter(r => r.from !== u.key);
    saveDoi();
    return sendJSON(res, { ok: true });
  }
  if (urlPath === "/api/doi/friends/remove" && req.method === "POST") {
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const call = String(m.callsign || "").trim();
    const targetKey = call.toLowerCase();
    if (doiStore.friends[u.key])     doiStore.friends[u.key]     = doiStore.friends[u.key].filter(k => k !== targetKey);
    if (doiStore.friends[targetKey]) doiStore.friends[targetKey] = doiStore.friends[targetKey].filter(k => k !== u.key);
    saveDoi();
    return sendJSON(res, { ok: true });
  }

  /* ---- group DMs ---- */
  if (urlPath === "/api/doi/groups" && req.method === "POST") {
    const m = await readBody(req);
    const u = doiUserFromToken(m.token);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    // members: array of callsigns (or keys). Always includes creator.
    const raw = Array.isArray(m.members) ? m.members : [];
    const memberKeys = new Set([u.key]);
    for (const c of raw) {
      const k = String(c || "").trim().toLowerCase();
      if (k && accounts.users[k]) memberKeys.add(k);
    }
    if (memberKeys.size < 2) return sendJSON(res, { error: "pick at least one other operative" }, 400);
    const id = "grp-" + crypto.randomBytes(6).toString("hex");
    const g = {
      id, name: String(m.name || "").slice(0, 40), icon: null,
      ownerKey: u.key, members: [...memberKeys], created: Date.now(), messages: [],
    };
    doiStore.groups[id] = g;
    saveDoi();
    return sendJSON(res, { ok: true, group: doiGroupBrief(g, u.key, true) });
  }
  {
    const mm = urlPath.match(/^\/api\/doi\/groups\/([^/]+)$/);
    if (mm && req.method === "GET") {
      const u = doiUserFromToken(query.get("token") || "");
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const g = doiStore.groups[mm[1]];
      if (!g) return sendJSON(res, { error: "not found" }, 404);
      if (!groupHasMember(g, u.key)) return sendJSON(res, { error: "not a member" }, 403);
      return sendJSON(res, { ok: true, group: doiGroupBrief(g, u.key, true) });
    }
  }
  {
    const mm = urlPath.match(/^\/api\/doi\/groups\/([^/]+)\/(invite|leave|settings|remove)$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const g = doiStore.groups[mm[1]];
      if (!g) return sendJSON(res, { error: "not found" }, 404);
      if (!groupHasMember(g, u.key)) return sendJSON(res, { error: "not a member" }, 403);
      const op = mm[2];
      if (op === "invite") {
        const k = String(m.callsign || "").trim().toLowerCase();
        if (!accounts.users[k]) return sendJSON(res, { error: "no such operative" }, 404);
        if (!g.members.includes(k)) {
          g.members.push(k);
          g.messages.push({ id: "g-" + crypto.randomBytes(4).toString("hex"), system: true, ts: Date.now(),
            text: (accounts.users[k].user) + " was added to the group." });
        }
        saveDoi();
        return sendJSON(res, { ok: true, group: doiGroupBrief(g, u.key, true) });
      }
      if (op === "remove") {
        if (g.ownerKey !== u.key) return sendJSON(res, { error: "owner only" }, 403);
        const k = String(m.callsign || "").trim().toLowerCase();
        g.members = g.members.filter(x => x !== k);
        if (accounts.users[k]) g.messages.push({ id: "g-" + crypto.randomBytes(4).toString("hex"), system: true, ts: Date.now(),
          text: accounts.users[k].user + " was removed from the group." });
        saveDoi();
        return sendJSON(res, { ok: true, group: doiGroupBrief(g, u.key, true) });
      }
      if (op === "settings") {
        if (typeof m.name === "string") g.name = m.name.slice(0, 40);
        if (typeof m.icon === "string" && m.icon.length < 260_000) g.icon = m.icon;
        saveDoi();
        return sendJSON(res, { ok: true, group: doiGroupBrief(g, u.key, true) });
      }
      if (op === "leave") {
        g.members = g.members.filter(x => x !== u.key);
        g.messages.push({ id: "g-" + crypto.randomBytes(4).toString("hex"), system: true, ts: Date.now(),
          text: u.name + " left the group." });
        if (g.ownerKey === u.key) g.ownerKey = g.members[0] || g.ownerKey; // hand off
        if (g.members.length === 0) delete doiStore.groups[g.id];         // last one out
        saveDoi();
        return sendJSON(res, { ok: true, left: true });
      }
    }
  }
  {
    const mm = urlPath.match(/^\/api\/doi\/groups\/([^/]+)\/messages$/);
    if (mm) {
      const g = doiStore.groups[mm[1]];
      if (!g) return sendJSON(res, { error: "not found" }, 404);
      if (req.method === "GET") {
        const u = doiUserFromToken(query.get("token") || "");
        if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
        if (!groupHasMember(g, u.key)) return sendJSON(res, { error: "not a member" }, 403);
        const since = parseInt(query.get("since") || "0", 10) || 0;
        const all = g.messages || [];
        const msgs = since ? all.filter(x => x.ts > since) : all;
        return sendJSON(res, { ok: true, messages: msgs, now: Date.now() });
      }
      if (req.method === "POST") {
        const m = await readBody(req);
        const u = doiUserFromToken(m.token);
        if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
        if (!groupHasMember(g, u.key)) return sendJSON(res, { error: "not a member" }, 403);
        const text = String(m.text || "").trim().slice(0, 2000);
        if (!text) return sendJSON(res, { error: "empty message" }, 400);
        const post = { id: "g-" + crypto.randomBytes(5).toString("hex"), from: u.name, fromKey: u.key, ts: Date.now(), text };
        g.messages.push(post);
        if (g.messages.length > DOI_MSG_CAP) g.messages.splice(0, g.messages.length - DOI_MSG_CAP);
        saveDoi();
        return sendJSON(res, { ok: true, message: post });
      }
    }
  }
  {
    const mm = urlPath.match(/^\/api\/doi\/groups\/([^/]+)\/messages\/(edit|delete)$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const g = doiStore.groups[mm[1]];
      if (!g) return sendJSON(res, { error: "not found" }, 404);
      if (!groupHasMember(g, u.key)) return sendJSON(res, { error: "not a member" }, 403);
      const list = g.messages || [];
      const idx = list.findIndex(x => x.id === m.mid);
      if (idx === -1) return sendJSON(res, { error: "message not found" }, 404);
      const msg = list[idx];
      const isAuthor = msg.fromKey === u.key;
      const isOwner  = g.ownerKey === u.key;
      if (!isAuthor && !(isOwner && mm[2] === "delete")) return sendJSON(res, { error: "not allowed" }, 403);
      if (mm[2] === "delete") { list.splice(idx, 1); saveDoi(); return sendJSON(res, { ok: true, deleted: m.mid }); }
      const text = String(m.text || "").trim().slice(0, 2000);
      if (!text) return sendJSON(res, { error: "empty message" }, 400);
      msg.text = text; msg.edited = Date.now();
      saveDoi();
      return sendJSON(res, { ok: true, message: msg });
    }
  }

  /* ---- direct messages ---- */
  if (urlPath === "/api/doi/dms" && req.method === "GET") {
    const tok = query.get("token") || "";
    const u = doiUserFromToken(tok);
    if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
    const hidden = new Set(doiStore.hiddenDMs[u.key] || []);
    const seen = new Set();
    const convos = [];
    // 0) group DMs the user belongs to
    for (const gid in doiStore.groups) {
      const g = doiStore.groups[gid];
      if (groupHasMember(g, u.key)) convos.push(doiGroupBrief(g, u.key));
    }
    // 1) all conversations with any past messages
    for (const pk in doiStore.dms) {
      const parts = pk.split("|");
      if (parts.includes(u.key)) {
        const other = parts[0] === u.key ? parts[1] : parts[0];
        if (hidden.has(other)) continue;
        const msgs = doiStore.dms[pk] || [];
        const last = msgs[msgs.length - 1] || null;
        convos.push({ kind: "dm", other: doiProfile(other), lastTs: last ? last.ts : 0, lastText: last ? last.text : "" });
        seen.add(other);
      }
    }
    // 2) friends who don't have an active conversation yet (they show as
    //    placeholder DM rows until the user closes them with the X)
    for (const fk of (doiStore.friends[u.key] || [])) {
      if (seen.has(fk) || hidden.has(fk)) continue;
      convos.push({ kind: "dm", other: doiProfile(fk), lastTs: 0, lastText: "" });
    }
    convos.sort((a, b) => b.lastTs - a.lastTs);
    return sendJSON(res, { ok: true, dms: convos });
  }
  // POST /api/doi/dms/:otherKey/close  → hide from DM list
  {
    const mmc = urlPath.match(/^\/api\/doi\/dms\/([^/]+)\/close$/);
    if (mmc && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const otherKey = mmc[1].toLowerCase();
      const list = doiStore.hiddenDMs[u.key] || [];
      if (!list.includes(otherKey)) list.push(otherKey);
      doiStore.hiddenDMs[u.key] = list;
      saveDoi();
      return sendJSON(res, { ok: true });
    }
  }
  {
    const mm = urlPath.match(/^\/api\/doi\/dms\/([^/]+)$/);
    if (mm && req.method === "GET") {
      const tok = query.get("token") || "";
      const u = doiUserFromToken(tok);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const otherKey = mm[1].toLowerCase();
      if (!accounts.users[otherKey]) return sendJSON(res, { error: "not found" }, 404);
      // opening a DM un-hides it
      const hid = doiStore.hiddenDMs[u.key] || [];
      const idx = hid.indexOf(otherKey);
      if (idx !== -1) { hid.splice(idx, 1); doiStore.hiddenDMs[u.key] = hid; saveDoi(); }
      const pk = dmPairKey(u.key, otherKey);
      const since = parseInt(query.get("since") || "0", 10) || 0;
      const all = doiStore.dms[pk] || [];
      const msgs = since ? all.filter(x => x.ts > since) : all;
      return sendJSON(res, { ok: true, other: doiProfile(otherKey), messages: msgs, now: Date.now() });
    }
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const otherKey = mm[1].toLowerCase();
      if (!accounts.users[otherKey]) return sendJSON(res, { error: "not found" }, 404);
      // enforce message privacy of the RECEIVER
      const otherProf = doiProfile(otherKey);
      if (otherProf.messagePrivacy === "friends" && !areFriends(u.key, otherKey)) {
        return sendJSON(res, { error: "This operative only accepts messages from friends." }, 403);
      }
      const text = String(m.text || "").trim().slice(0, 2000);
      if (!text) return sendJSON(res, { error: "empty message" }, 400);
      const pk = dmPairKey(u.key, otherKey);
      doiStore.dms[pk] = doiStore.dms[pk] || [];
      const post = { id: "d-" + crypto.randomBytes(5).toString("hex"), from: u.name, fromKey: u.key, ts: Date.now(), text };
      doiStore.dms[pk].push(post);
      if (doiStore.dms[pk].length > DOI_MSG_CAP) doiStore.dms[pk].splice(0, doiStore.dms[pk].length - DOI_MSG_CAP);
      saveDoi();
      return sendJSON(res, { ok: true, message: post });
    }
  }
  // Edit or delete a DM (author only)
  {
    const mm = urlPath.match(/^\/api\/doi\/dms\/([^/]+)\/(edit|delete)$/);
    if (mm && req.method === "POST") {
      const m = await readBody(req);
      const u = doiUserFromToken(m.token);
      if (!u) return sendJSON(res, { error: "Not logged in" }, 401);
      const otherKey = mm[1].toLowerCase(), op = mm[2];
      if (!accounts.users[otherKey]) return sendJSON(res, { error: "not found" }, 404);
      const pk = dmPairKey(u.key, otherKey);
      const list = doiStore.dms[pk] || [];
      const idx = list.findIndex(x => x.id === m.mid);
      if (idx === -1) return sendJSON(res, { error: "message not found" }, 404);
      const msg = list[idx];
      if (msg.fromKey !== u.key) return sendJSON(res, { error: "not allowed" }, 403);
      if (op === "delete") { list.splice(idx, 1); saveDoi(); return sendJSON(res, { ok: true, deleted: m.mid }); }
      const text = String(m.text || "").trim().slice(0, 2000);
      if (!text) return sendJSON(res, { error: "empty message" }, 400);
      msg.text = text; msg.edited = Date.now();
      saveDoi();
      return sendJSON(res, { ok: true, message: msg });
    }
  }

  return sendJSON(res, { error: "unknown endpoint" }, 404);
}

/* ---- static file server (+ bridge API) ---- */
function startServer() {
  http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    const urlPath = decodeURIComponent(u.pathname);

    // bridge API routes
    if (urlPath.startsWith("/api/")) return handleApi(req, res, urlPath, u.searchParams);

    let filePath = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);

    // keep requests inside the app folder
    if (!filePath.startsWith(__dirname)) { res.writeHead(403); return res.end("Forbidden"); }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA fallback → index.html
        return fs.readFile(path.join(__dirname, "index.html"), (e2, d2) => {
          if (e2) { res.writeHead(404); return res.end("Not found"); }
          // The server self-updates from GitHub; never let the browser run a
          // stale cached copy of the app shell or its assets.
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, must-revalidate" });
          res.end(d2);
        });
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
        // no-cache forces a revalidation each load, so freshly pulled JS/CSS
        // (e.g. assets/mapgame.js) always reaches the client instead of a
        // heuristically-cached older version
        "Cache-Control": "no-cache, must-revalidate",
      });
      res.end(data);
    });
  }).listen(PORT, () => console.log(`Yesp Docs running on port ${PORT}`));
}

/* ---- boot: update first, then serve no matter what ---- */
selfUpdate().finally(startServer);
