/* =========================================================
   Yesp Docs — self-updating static server.
   On every startup it pulls the latest files from GitHub,
   then serves them. No manual uploads, no git, no npm.
   ========================================================= */
const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

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
  const SKIP = [".git"]; // never overwrite git internals
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
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(d2);
        });
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    });
  }).listen(PORT, () => console.log(`Yesp Docs running on port ${PORT}`));
}

/* ---- boot: update first, then serve no matter what ---- */
selfUpdate().finally(startServer);
