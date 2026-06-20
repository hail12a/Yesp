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
  const SKIP = [".git", "accounts.json", "worldstate.json", "tilecache"]; // never overwrite git internals or live runtime data
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
