/* =========================================================
   worldgen.js — real-world → Roblox tile builder.

   Elevation: downloads SRTM1 .hgt tiles (30 m native, 3601×3601
   per 1° cell) from the AWS public dataset on first request,
   caches them to disk forever, and bilinear-interpolates to any
   grid density.  No API keys, no rate limits, no RAM concerns.

   OSM: Overpass bbox query for buildings, roads, water with
   minimal simplification and no artificial feature count caps.

   Output: compact local-metre JSON + a Roblox Luau script that
   fetches the tile endpoint at runtime and builds terrain, water,
   roads, and buildings with WriteVoxels for the heightmap.
   ========================================================= */
const https  = require("https");
const zlib   = require("zlib");
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

const CACHE_DIR = path.join(__dirname, "tilecache");
const SRTM_DIR  = path.join(CACHE_DIR, "srtm");
try { fs.mkdirSync(SRTM_DIR, { recursive: true }); } catch (_) {}

const MAX_SIZE = 8000;
const MIN_SIZE = 100;
const M_PER_DEG_LAT = 111320;
const SRTM_N = 3601;

/* ---- helpers ---- */
function httpGetBuf(url, hdrs = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "yesp-worldgen", ...hdrs }, timeout: 90000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(httpGetBuf(res.headers.location, hdrs));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " " + url)); }
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("timeout", () => req.destroy(new Error("timeout"))); req.on("error", reject);
  });
}
function httpPostStr(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), data = Buffer.from(body);
    const req = https.request({
      method: "POST", hostname: u.hostname, path: u.pathname + u.search,
      headers: { "User-Agent": "yesp-worldgen", "Content-Type": "application/x-www-form-urlencoded", "Content-Length": data.length },
      timeout: 90000,
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const c = []; res.on("data", x => c.push(x)); res.on("end", () => resolve(Buffer.concat(c).toString("utf8")));
    });
    req.on("timeout", () => req.destroy(new Error("timeout"))); req.on("error", reject);
    req.write(data); req.end();
  });
}
const gunzip = (buf) => new Promise((res, rej) => zlib.gunzip(buf, (e, d) => e ? rej(e) : res(d)));

/* =========================================================
   SRTM1 elevation  (30 m native resolution, local parsing)
   ========================================================= */
function srtmName(ilat, ilng) {
  return `${ilat >= 0 ? "N" : "S"}${String(Math.abs(ilat)).padStart(2, "0")}` +
         `${ilng >= 0 ? "E" : "W"}${String(Math.abs(ilng)).padStart(3, "0")}`;
}
async function loadSRTMTile(ilat, ilng) {
  const name = srtmName(ilat, ilng);
  const file = path.join(SRTM_DIR, name + ".hgt");
  if (fs.existsSync(file)) return fs.readFileSync(file);

  const ns = ilat >= 0 ? "N" : "S", lat2 = String(Math.abs(ilat)).padStart(2, "0");
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/skadi/${ns}${lat2}/${name}.hgt.gz`;
  console.log("[srtm] downloading", url);
  const gz = await httpGetBuf(url);
  const buf = await gunzip(gz);
  fs.writeFileSync(file, buf);
  return buf;
}
function srtmSample(buf, fRow, fCol) {
  const r0 = Math.max(0, Math.min(SRTM_N - 2, Math.floor(fRow)));
  const c0 = Math.max(0, Math.min(SRTM_N - 2, Math.floor(fCol)));
  const tr = fRow - r0, tc = fCol - c0;
  const r1 = r0 + 1, c1 = c0 + 1;
  const rd = (r, c) => { const v = buf.readInt16BE((r * SRTM_N + c) * 2); return v === -32768 ? 0 : v; };
  return rd(r0,c0)*(1-tc)*(1-tr) + rd(r0,c1)*tc*(1-tr) + rd(r1,c0)*(1-tc)*tr + rd(r1,c1)*tc*tr;
}

async function buildElevationGrid(clat, clng, halfM) {
  const stepM  = Math.max(4, halfM * 2 / 1024);
  const res    = Math.round(halfM * 2 / stepM) + 1;
  const dLat   = halfM / M_PER_DEG_LAT;
  const mPerLng = M_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180);
  const dLng   = halfM / mPerLng;

  const latMin = clat - dLat, latMax = clat + dLat;
  const lngMin = clng - dLng, lngMax = clng + dLng;
  const tileSet = {};
  for (const ilat of [Math.floor(latMin), Math.floor(latMax)]) {
    for (const ilng of [Math.floor(lngMin), Math.floor(lngMax)]) {
      const k = ilat + "_" + ilng;
      if (!tileSet[k]) tileSet[k] = await loadSRTMTile(ilat, ilng);
    }
  }

  const heights = [];
  for (let ri = 0; ri < res; ri++) {
    const lat = latMin + (latMax - latMin) * (ri / (res - 1));
    const ilat = Math.floor(lat);
    const buf  = tileSet[ilat + "_" + Math.floor(lngMin)] || tileSet[Object.keys(tileSet)[0]];
    for (let ci = 0; ci < res; ci++) {
      const lng  = lngMin + (lngMax - lngMin) * (ci / (res - 1));
      const ilng = Math.floor(lng);
      const key  = ilat + "_" + ilng;
      const tb   = tileSet[key] || buf;
      const fRow = (ilat + 1 - lat) * 3600;
      const fCol = (lng - ilng) * 3600;
      heights.push(+srtmSample(tb, fRow, fCol).toFixed(1));
    }
  }

  let min = Infinity, max = -Infinity;
  for (const h of heights) { if (h < min) min = h; if (h > max) max = h; }
  return {
    res, stepM: +stepM.toFixed(2),
    heights,
    minH: +min.toFixed(1), maxH: +max.toFixed(1),
    source: "srtm1-local",
  };
}

/* =========================================================
   Coordinate projection: lat/lng → local metres from centre
   ========================================================= */
function makeProj(clat, clng) {
  const mPerLng = M_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180);
  return (lat, lng) => ({
    x: +((lng - clng) * mPerLng).toFixed(2),
    z: +((lat - clat) * M_PER_DEG_LAT).toFixed(2),
  });
}

/* =========================================================
   OSM via Overpass — buildings, roads, water
   ========================================================= */
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) >= tol) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Real-world carriageway widths in metres (fallback when OSM lacks width/lanes tags).
// OSM usually draws one way per carriageway direction, so these are one-direction widths.
const ROAD_W = {
  motorway:11, motorway_link:5, trunk:9, trunk_link:5,
  primary:7, primary_link:4, secondary:7, secondary_link:4,
  tertiary:6, tertiary_link:4, residential:5.5, living_street:4,
  unclassified:5.5, service:3.5, track:3,
  pedestrian:4, footway:2, path:1.5, cycleway:2,
};

// Render priority: higher classes are lifted slightly at junctions to prevent z-fighting.
const ROAD_PRI = {
  motorway:9, motorway_link:8, trunk:8, trunk_link:7,
  primary:7, primary_link:6, secondary:6, secondary_link:5,
  tertiary:5, tertiary_link:4, unclassified:4, road:4, residential:4,
  living_street:3, service:2, track:1,
  pedestrian:2, footway:1, path:1, cycleway:1, steps:1, bridleway:1, corridor:1,
};

const PATH_KINDS = new Set(["footway", "path", "cycleway", "pedestrian", "steps", "bridleway", "corridor"]);
const ROAD_RENDER = new Set(Object.keys(ROAD_W).concat(["road", "steps", "bridleway", "corridor"]));

/* ---- oriented bounding box (min-area rectangle) for building footprints ---- */
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
function minAreaRect(points) {
  const hull = convexHull(points);
  if (hull.length < 3) {
    let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
    for (const p of points) { minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z); }
    return { cx:(minx+maxx)/2, cz:(minz+maxz)/2, w:maxx-minx, d:maxz-minz, rot:0 };
  }
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    const vx = -uz, vz = ux;
    let minu=1e9,maxu=-1e9,minv=1e9,maxv=-1e9;
    for (const p of hull) {
      const du = (p.x-a.x)*ux + (p.z-a.z)*uz;
      const dv = (p.x-a.x)*vx + (p.z-a.z)*vz;
      if (du<minu) minu=du; if (du>maxu) maxu=du;
      if (dv<minv) minv=dv; if (dv>maxv) maxv=dv;
    }
    const w = maxu-minu, d = maxv-minv, area = w*d;
    if (!best || area < best.area) {
      const cu=(minu+maxu)/2, cv=(minv+maxv)/2;
      best = { area, cx: a.x+ux*cu+vx*cv, cz: a.z+uz*cu+vz*cv, w, d, rot: Math.atan2(uz, ux) };
    }
  }
  return best;
}
function polyArea(pts) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x + pts[i].x) * (pts[j].z - pts[i].z);
  return Math.abs(s) / 2;
}

async function fetchOSM(clat, clng, halfM, proj) {
  const dLat = halfM / M_PER_DEG_LAT;
  const dLng = halfM / (M_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180));
  const bbox = `${clat-dLat},${clng-dLng},${clat+dLat},${clng+dLng}`;
  const q = `[out:json][timeout:90];(`+
    `way["building"](${bbox});relation["building"]["type"="multipolygon"](${bbox});`+
    `way["highway"](${bbox});`+
    `way["natural"="water"](${bbox});relation["natural"="water"](${bbox});`+
    `way["water"](${bbox});relation["water"](${bbox});`+
    `way["waterway"="riverbank"](${bbox});`+
    `way["natural"="coastline"](${bbox});`+
    `);out geom;`;

  const mirrors = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ];
  let data = null;
  for (const url of mirrors) {
    try { data = JSON.parse(await httpPostStr(url, "data=" + encodeURIComponent(q))); break; }
    catch (_) {}
  }
  const buildings = [], roads = [], water = [];
  if (!data || !data.elements) return { buildings, roads, water, ok: false };

  for (const el of data.elements) {
    const t = el.tags || {};
    if (t.building) {
      let geoms = [];
      if (el.type === "way" && el.geometry) geoms = [el.geometry];
      else if (el.type === "relation" && el.members)
        geoms = el.members.filter(m => m.geometry && m.role !== "inner").map(m => m.geometry);
      for (const g of geoms) {
        if (!g || g.length < 3) continue;
        let h = parseFloat(t.height);
        if (!isFinite(h)) { const lv = parseFloat(t["building:levels"]); h = isFinite(lv) ? lv * 3.2 : 7; }
        h = Math.max(3, Math.min(400, h));
        const pts = g.map(p => proj(p.lat, p.lon));
        const area = polyArea(pts);
        if (area < 6 || area > 250000) continue;
        const r = minAreaRect(pts);
        if (!r || r.w < 1 || r.d < 1) continue;
        buildings.push({
          h: +h.toFixed(1),
          cx: +r.cx.toFixed(2), cz: +r.cz.toFixed(2),
          w: +r.w.toFixed(2), d: +r.d.toFixed(2),
          rot: +r.rot.toFixed(4),
        });
      }
      continue;
    }
    if (t.highway && el.geometry && el.geometry.length >= 2) {
      const hw = t.highway;
      if (!ROAD_RENDER.has(hw)) continue;
      if (t.tunnel && t.tunnel !== "no") continue;
      if (t.area === "yes") continue;
      let w;
      const tw = parseFloat(t.width);
      if (isFinite(tw) && tw > 0) {
        w = tw;
      } else {
        const lanes = parseInt(t.lanes, 10);
        w = (isFinite(lanes) && lanes > 0) ? lanes * 3.5 : (ROAD_W[hw] || 3);
      }
      w = Math.max(1.5, Math.min(60, w));
      const pts = simplify(el.geometry.map(p => proj(p.lat, p.lon)), 0.5);
      if (pts.length >= 2) roads.push({
        cls: hw,
        w: +w.toFixed(1),
        kind: PATH_KINDS.has(hw) ? "path" : "road",
        pri: ROAD_PRI[hw] || 1,
        bridge: (t.bridge && t.bridge !== "no") ? 1 : 0,
        pts,
      });
      continue;
    }
    if (t.natural === "water" || t.water || t.waterway === "riverbank" || t.natural === "coastline") {
      let geoms = [];
      if (el.type === "way" && el.geometry) geoms = [el.geometry];
      else if (el.type === "relation" && el.members)
        geoms = el.members.filter(m => m.geometry && m.role !== "inner").map(m => m.geometry);
      for (const g of geoms) {
        if (!g || g.length < 3) continue;
        const pts = simplify(g.map(p => proj(p.lat, p.lon)), 1);
        if (pts.length >= 3 && polyArea(pts) >= 150) water.push(pts);
      }
    }
  }
  return { buildings, roads, water, ok: true };
}

/* =========================================================
   Main entry: build (or load) a tile
   ========================================================= */
function tileKey(lat, lng, size) {
  return crypto.createHash("sha1").update(`v6_${lat.toFixed(5)}_${lng.toFixed(5)}_${size}`).digest("hex").slice(0, 16);
}
async function buildTile(lat, lng, size) {
  size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(size) || 3000));
  const key = tileKey(lat, lng, size);
  const cacheFile = path.join(CACHE_DIR, key + ".json");
  try { return { ...JSON.parse(fs.readFileSync(cacheFile, "utf8")), cached: true }; } catch (_) {}

  const halfM = size / 2;
  const proj  = makeProj(lat, lng);
  const [elev, osm] = await Promise.all([
    buildElevationGrid(lat, lng, halfM),
    fetchOSM(lat, lng, halfM, proj),
  ]);

  const tile = {
    v: 3,
    center: { lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
    size, halfM,
    elevation: elev,
    water:     osm.water,
    roads:     osm.roads,
    buildings: osm.buildings,
    counts: { water: osm.water.length, roads: osm.roads.length, buildings: osm.buildings.length },
    osmOk: osm.ok,
    built: Date.now(),
  };
  try { fs.writeFileSync(cacheFile, JSON.stringify(tile)); } catch (_) {}
  return { ...tile, cached: false };
}

/* =========================================================
   Roblox Luau renderer  (pasted into Studio Command Bar)

   Scale: Roblox's default character is 5 studs ≈ 1.7 m real life,
   so 1 m ≈ 3 studs.  SCALE=3 gives correct visual proportions
   next to any default character or vehicle.  SCALE=1 is true 1:1.
   ========================================================= */
function robloxScript(host, lat, lng, size) {
  const ep = `${host}/api/world/tile?lat=${lat}&lng=${lng}&size=${size}`;

  // We build the Lua as a regular string (not a template literal) so we can
  // embed it without worrying about nested backtick conflicts.
  const lines = [];
  const L = s => lines.push(s);

  L(`--[[`);
  L(`  Yesp Real-World Renderer v6 — PASTE INTO STUDIO COMMAND BAR`);
  L(`  (View → Command Bar) then press Enter.`);
  L(``);
  L(`  Tile: ${size} x ${size} m centred on (${lat}, ${lng})`);
  L(`  Builds: terrain (SRTM1) · water · roads · buildings`);
  L(`  Requires: Game Settings -> Security -> Allow HTTP Requests = ON`);
  L(``);
  L(`  SCALE = 3  →  real-world proportions with default Roblox character  (recommended)`);
  L(`  SCALE = 1  →  true 1:1 metre (character looks giant)`);
  L(`  Edit SCALE below before running.`);
  L(`--]]`);
  L(``);
  L(`local HttpService = game:GetService("HttpService")`);
  L(`local Workspace   = game:GetService("Workspace")`);
  L(`local Terrain     = Workspace.Terrain`);
  L(``);
  L(`local ENDPOINT = "${ep}"`);
  L(`local SCALE    = 3      -- studs per real-world metre`);
  L(`local BASE_Y   = 0      -- world Y for the tile minimum elevation`);
  L(``);
  L(`local function S(m) return m * SCALE end   -- metres to studs`);
  L(``);
  L(`task.spawn(function()`);
  L(``);
  L(`-- ── 0. Fetch tile ──────────────────────────────────────────────`);
  L(`print("[Yesp] fetching tile…")`);
  L(`local ok, raw = pcall(function() return HttpService:GetAsync(ENDPOINT, true) end)`);
  L(`if not ok then warn("[Yesp] fetch failed: "..tostring(raw)); return end`);
  L(`local tile = HttpService:JSONDecode(raw)`);
  L(`local elev = tile.elevation`);
  L(`print(string.format(`);
  L(`  "[Yesp] %dx%d grid | %.1fm step | elev %.0f-%.0fm | %d bldg %d road %d water | SCALE=%d",`);
  L(`  elev.res, elev.res, elev.stepM, elev.minH, elev.maxH,`);
  L(`  tile.counts.buildings, tile.counts.roads, tile.counts.water, SCALE))`);
  L(``);
  L(`local halfM = tile.halfM   -- tile half-width in metres`);
  L(`local stepM = elev.stepM   -- elevation grid cell in metres`);
  L(`local minH  = elev.minH    -- minimum elevation of this tile`);
  L(`local res   = elev.res     -- samples per side`);
  L(``);
  L(`-- ── Elevation helpers (all internal maths in metres) ────────────`);
  L(`local function gridH(ix, iz)`);
  L(`  ix = math.clamp(ix, 0, res-1); iz = math.clamp(iz, 0, res-1)`);
  L(`  return (elev.heights[iz*res + ix + 1] or minH) - minH`);
  L(`end`);
  L(`local function bilinH(fx, fz)`);
  L(`  local ix, iz = math.floor(fx), math.floor(fz)`);
  L(`  local tx, tz = fx-ix, fz-iz`);
  L(`  return gridH(ix,  iz  )*(1-tx)*(1-tz)`);
  L(`       + gridH(ix+1,iz  )*   tx *(1-tz)`);
  L(`       + gridH(ix,  iz+1)*(1-tx)*   tz`);
  L(`       + gridH(ix+1,iz+1)*   tx *   tz`);
  L(`end`);
  L(`-- surfM: terrain surface in metres above tile min, at metre coords`);
  L(`local function surfM(xm, zm)`);
  L(`  local fx = math.clamp((xm + halfM) / stepM, 0, res-2)`);
  L(`  local fz = math.clamp((zm + halfM) / stepM, 0, res-2)`);
  L(`  return bilinH(fx, fz)`);
  L(`end`);
  L(`-- worldY: terrain surface in STUDS at metre coords`);
  L(`local function worldY(xm, zm)`);
  L(`  return BASE_Y + S(surfM(xm, zm))`);
  L(`end`);
  L(``);
  L(`-- ── 1. Terrain (WriteVoxels smooth heightmap) ───────────────────`);
  L(`print("[Yesp] building terrain…")`);
  L(`local VRES  = 4            -- real-world metres per voxel`);
  L(`local VSTU  = VRES * SCALE -- voxel edge in studs (multiple of 4 for any integer SCALE)`);
  L(`local FLOOR = 60           -- metres of solid earth below the minimum elevation`);
  L(``);
  L(`local function snapM(v) return math.floor(v / VRES) * VRES end`);
  L(`local oxM = snapM(-halfM)  -- tile origin in metres, aligned to voxel grid`);
  L(`local ozM = snapM(-halfM)`);
  L(`local oyM = snapM(-FLOOR)`);
  L(`local nx = math.ceil((halfM*2) / VRES) + 2`);
  L(`local nz = math.ceil((halfM*2) / VRES) + 2`);
  L(`local ny = math.ceil(((elev.maxH - minH) + FLOOR) / VRES) + 2`);
  L(``);
  L(`local GRASS = Enum.Material.Grass`);
  L(`local AIR   = Enum.Material.Air`);
  L(`local BAND  = 24`);
  L(``);
  L(`for z0 = 0, nz-1, BAND do`);
  L(`  local zc = math.min(BAND, nz - z0)`);
  L(`  local region = Region3.new(`);
  L(`    Vector3.new(S(oxM),             BASE_Y + S(oyM),             S(ozM + z0*VRES)),`);
  L(`    Vector3.new(S(oxM + nx*VRES),   BASE_Y + S(oyM + ny*VRES),   S(ozM + (z0+zc)*VRES))`);
  L(`  )`);
  L(`  local mat, occ = {}, {}`);
  L(`  for xi = 1, nx do`);
  L(`    local mcol, ocol = {}, {}`);
  L(`    local wxM = oxM + (xi - 0.5)*VRES`);
  L(`    for yi = 1, ny do`);
  L(`      local mrow, orow = {}, {}`);
  L(`      local voxBotM = oyM + (yi-1)*VRES`);
  L(`      for zi = 1, zc do`);
  L(`        local wzM  = ozM + (z0 + zi - 0.5)*VRES`);
  L(`        local sm   = surfM(wxM, wzM)`);
  L(`        local frac = (sm - voxBotM) / VRES`);
  L(`        if frac >= 1 then`);
  L(`          mrow[zi] = GRASS; orow[zi] = 1`);
  L(`        elseif frac <= 0 then`);
  L(`          mrow[zi] = AIR;   orow[zi] = 0`);
  L(`        else`);
  L(`          mrow[zi] = GRASS; orow[zi] = frac`);
  L(`        end`);
  L(`      end`);
  L(`      mcol[yi] = mrow; ocol[yi] = orow`);
  L(`    end`);
  L(`    mat[xi] = mcol; occ[xi] = ocol`);
  L(`  end`);
  L(`  Terrain:WriteVoxels(region, VSTU, mat, occ)`);
  L(`  task.wait()`);
  L(`end`);
  L(``);
  L(`-- ── 2. Water ────────────────────────────────────────────────────`);
  L(`print("[Yesp] placing water…")`);
  L(`local function pip(poly, px, pz)`);
  L(`  local inside, n, j = false, #poly, #poly`);
  L(`  for i = 1, n do`);
  L(`    local a, b = poly[i], poly[j]`);
  L(`    if ((a.z > pz) ~= (b.z > pz)) and`);
  L(`       (px < (b.x - a.x)*(pz - a.z)/(b.z - a.z) + a.x) then`);
  L(`      inside = not inside`);
  L(`    end`);
  L(`    j = i`);
  L(`  end`);
  L(`  return inside`);
  L(`end`);
  L(`for _, poly in ipairs(tile.water) do`);
  L(`  local minx, maxx, minz, maxz = math.huge, -math.huge, math.huge, -math.huge`);
  L(`  for _, pt in ipairs(poly) do`);
  L(`    if pt.x < minx then minx = pt.x end; if pt.x > maxx then maxx = pt.x end`);
  L(`    if pt.z < minz then minz = pt.z end; if pt.z > maxz then maxz = pt.z end`);
  L(`  end`);
  L(`  local cell = 8`);
  L(`  for wz = minz, maxz, cell do`);
  L(`    for wx = minx, maxx, cell do`);
  L(`      local cx, cz = wx + cell*0.5, wz + cell*0.5`);
  L(`      if pip(poly, cx, cz) then`);
  L(`        Terrain:FillBlock(`);
  L(`          CFrame.new(S(cx), worldY(cx, cz) - S(5), S(cz)),`);
  L(`          Vector3.new(S(cell), S(12), S(cell)), Enum.Material.Water)`);
  L(`      end`);
  L(`    end`);
  L(`  end`);
  L(`  task.wait()`);
  L(`end`);
  L(``);
  L(`-- ── 3. Roads & footpaths ────────────────────────────────────────`);
  L(`print("[Yesp] placing roads…")`);
  L(`local roadFolder = Instance.new("Folder")`);
  L(`roadFolder.Name = "Roads"; roadFolder.Parent = Workspace`);
  L(`local ROAD_COL = Color3.fromRGB(50, 52, 56)`);
  L(`local PATH_COL = Color3.fromRGB(138, 132, 116)`);
  L(``);
  L(`-- Render lower-priority roads first so major roads paint on top`);
  L(`table.sort(tile.roads, function(a, b) return (a.pri or 1) < (b.pri or 1) end)`);
  L(``);
  L(`local rSeg = 0`);
  L(`for _, road in ipairs(tile.roads) do`);
  L(`  local pts = road.pts`);
  L(`  local n   = #pts`);
  L(`  if n < 2 then continue end`);
  L(``);
  L(`  -- Sample raw terrain heights in metres at every node`);
  L(`  local ys = {}`);
  L(`  for i = 1, n do ys[i] = surfM(pts[i].x, pts[i].z) end`);
  L(``);
  L(`  -- Grade smoothing: weighted 5-point average so the road profile`);
  L(`  -- follows gentle curves rather than stair-stepping every bump`);
  L(`  if road.bridge ~= 1 then`);
  L(`    local sm = {}`);
  L(`    for i = 1, n do`);
  L(`      local h0 = ys[math.max(1, i-2)]`);
  L(`      local h1 = ys[math.max(1, i-1)]`);
  L(`      local h2 = ys[i]`);
  L(`      local h3 = ys[math.min(n, i+1)]`);
  L(`      local h4 = ys[math.min(n, i+2)]`);
  L(`      sm[i] = (h0 + 2*h1 + 4*h2 + 2*h3 + h4) / 10`);
  L(`    end`);
  L(`    ys = sm`);
  L(`  else`);
  L(`    -- Bridge: flat deck at the highest vertex`);
  L(`    local mx = -math.huge`);
  L(`    for i = 1, n do if ys[i] > mx then mx = ys[i] end end`);
  L(`    for i = 1, n do ys[i] = mx end`);
  L(`  end`);
  L(``);
  L(`  local isPath  = (road.kind == "path")`);
  L(`  local col     = isPath and PATH_COL or ROAD_COL`);
  L(`  local rMat    = isPath and Enum.Material.Concrete or Enum.Material.Asphalt`);
  L(`  local thickM  = isPath and 0.8 or 3.0    -- body depth in metres (sinks into terrain)`);
  L(`  local riseM   = isPath and 0.15 or 0.4   -- top face sits this far above ground (m)`);
  L(`  local biasSt  = S((road.pri or 1) * 0.02)  -- tiny per-class anti-z-fight lift (studs)`);
  L(`  local capM    = road.w * 0.6              -- end-cap in metres to fill corner gaps`);
  L(``);
  L(`  for i = 1, n-1 do`);
  L(`    local a, b = pts[i], pts[i+1]`);
  L(`    local dxM = b.x - a.x`);
  L(`    local dzM = b.z - a.z`);
  L(`    if math.sqrt(dxM*dxM + dzM*dzM) < 0.05 then continue end`);
  L(``);
  L(`    -- Road surface top positions in studs`);
  L(`    local paY = BASE_Y + S(ys[i]   + riseM) + biasSt`);
  L(`    local pbY = BASE_Y + S(ys[i+1] + riseM) + biasSt`);
  L(`    local pa  = Vector3.new(S(a.x), paY, S(a.z))`);
  L(`    local pb  = Vector3.new(S(b.x), pbY, S(b.z))`);
  L(``);
  L(`    local dir3D = pb - pa`);
  L(`    local lenSt = dir3D.Magnitude`);
  L(`    if lenSt < 0.01 then continue end`);
  L(``);
  L(`    -- Centre: midpoint of the top surface, dropped by half-thickness`);
  L(`    -- so the TOP face of the part aligns with the road surface`);
  L(`    local midTop   = (pa + pb) * 0.5`);
  L(`    local centrePt = midTop - Vector3.new(0, S(thickM) * 0.5, 0)`);
  L(``);
  L(`    local p = Instance.new("Part")`);
  L(`    p.Anchored      = true`);
  L(`    p.CanCollide    = true`);
  L(`    p.CastShadow    = false`);
  L(`    p.TopSurface    = Enum.SurfaceType.Smooth`);
  L(`    p.BottomSurface = Enum.SurfaceType.Smooth`);
  L(`    p.Size          = Vector3.new(S(road.w), S(thickM), lenSt + S(capM))`);
  L(`    p.Color         = col`);
  L(`    p.Material      = rMat`);
  L(`    -- CFrame.new(pos, lookAt): -Z axis faces toward pa+dir3D`);
  L(`    -- → part depth (Z) aligns with the road direction, tilted to follow grade`);
  L(`    p.CFrame        = CFrame.new(centrePt, centrePt + dir3D)`);
  L(`    p.Parent        = roadFolder`);
  L(``);
  L(`    rSeg += 1`);
  L(`    if rSeg % 300 == 0 then task.wait() end`);
  L(`  end`);
  L(`end`);
  L(``);
  L(`-- ── 4. Buildings ────────────────────────────────────────────────`);
  L(`print("[Yesp] placing buildings…")`);
  L(`local bldFolder = Instance.new("Folder")`);
  L(`bldFolder.Name = "Buildings"; bldFolder.Parent = Workspace`);
  L(`local palette = {`);
  L(`  Color3.fromRGB(198,190,178), Color3.fromRGB(178,172,162),`);
  L(`  Color3.fromRGB(160,153,143), Color3.fromRGB(188,180,168),`);
  L(`  Color3.fromRGB(152,150,152), Color3.fromRGB(174,168,156),`);
  L(`}`);
  L(`local bCount = 0`);
  L(`for _, b in ipairs(tile.buildings) do`);
  L(`  if b.w < 1 or b.d < 1 then continue end`);
  L(``);
  L(`  -- Find the lowest terrain point under the four OBB corners + centre`);
  L(`  local hw, hd = b.w*0.5, b.d*0.5`);
  L(`  local cr, sr = math.cos(-b.rot), math.sin(-b.rot)`);
  L(`  local gyM = math.huge`);
  L(`  local checks = {`);
  L(`    {b.cx+cr*hw+sr*hd, b.cz-sr*hw+cr*hd},`);
  L(`    {b.cx+cr*hw-sr*hd, b.cz-sr*hw-cr*hd},`);
  L(`    {b.cx-cr*hw+sr*hd, b.cz+sr*hw+cr*hd},`);
  L(`    {b.cx-cr*hw-sr*hd, b.cz+sr*hw-cr*hd},`);
  L(`    {b.cx, b.cz},`);
  L(`  }`);
  L(`  for _, c in ipairs(checks) do`);
  L(`    local y = surfM(c[1], c[2])`);
  L(`    if y < gyM then gyM = y end`);
  L(`  end`);
  L(``);
  L(`  local part = Instance.new("Part")`);
  L(`  part.Anchored      = true`);
  L(`  part.TopSurface    = Enum.SurfaceType.Smooth`);
  L(`  part.BottomSurface = Enum.SurfaceType.Smooth`);
  L(`  -- Sizes straight from OSM footprint (metres) × SCALE → studs. No inflation.`);
  L(`  part.Size  = Vector3.new(S(b.w), S(b.h), S(b.d))`);
  L(`  -- Base is 1 m below the lowest corner so no gap on slopes`);
  L(`  part.CFrame = CFrame.new(S(b.cx), BASE_Y + S(gyM + b.h*0.5 - 1.0), S(b.cz))`);
  L(`             * CFrame.Angles(0, -b.rot, 0)`);
  L(`  part.Color    = palette[(bCount % #palette) + 1]`);
  L(`  part.Material = Enum.Material.Concrete`);
  L(`  part.Parent   = bldFolder`);
  L(``);
  L(`  bCount += 1`);
  L(`  if bCount % 200 == 0 then task.wait() end`);
  L(`end`);
  L(``);
  L(`print(string.format(`);
  L(`  "[Yesp] done — %d buildings · %d road segs · %d water  (SCALE=%d, 1 stud=%.2fm)",`);
  L(`  tile.counts.buildings, rSeg, tile.counts.water, SCALE, 1/SCALE))`);
  L(`end)`);

  return lines.join("\n");
}

module.exports = { buildTile, robloxScript, MAX_SIZE, MIN_SIZE };
