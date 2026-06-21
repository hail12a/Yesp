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
  return crypto.createHash("sha1").update(`v8_${lat.toFixed(5)}_${lng.toFixed(5)}_${size}`).digest("hex").slice(0, 16);
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

   Flat-ground design (no WriteVoxels terrain):
     • One large flat Grass Part as the ground plane
     • Roads: thin asphalt/concrete Parts at real OSM width, exactly
              where OSM places them — no height jitter, no clipping
     • Buildings: concrete box Parts with base on the ground plane
     • Water: flat semi-transparent blue Parts where OSM shows water
   Scale: SCALE studs per metre (default 3 = matches default Roblox
   character proportions; change at top of the generated script).
   ========================================================= */
function robloxScript(host, lat, lng, size) {
  const ep = `${host}/api/world/tile?lat=${lat}&lng=${lng}&size=${size}`;
  const L = [];
  const l = s => L.push(s);

  l(`--[[`);
  l(`  Yesp Real-World Renderer v7  —  paste into Studio Command Bar`);
  l(`  (View → Command Bar) then press Enter.`);
  l(``);
  l(`  Tile: ${size} x ${size} m  centred on (${lat}, ${lng})`);
  l(`  Ground: flat Grass Part.  No terrain WriteVoxels.`);
  l(`  Roads: thin Parts, real OSM positions, real OSM widths.`);
  l(`  Buildings: box Parts, real OSM footprints, real OSM heights.`);
  l(`  Water: flat blue Parts over OSM water polygons.`);
  l(``);
  l(`  SCALE = 3.571  →  exact Roblox scale (1 stud = 0.28 m, matches default char)  ← default`);
  l(`  SCALE = 3      →  slightly loose, good for top-down overview`);
  l(`  SCALE = 1      →  true 1:1 metre (character looks enormous)`);
  l(`  Requires: Game Settings → Security → Allow HTTP Requests = ON`);
  l(`--]]`);
  l(``);
  l(`local HttpService = game:GetService("HttpService")`);
  l(`local Workspace   = game:GetService("Workspace")`);
  l(``);
  l(`local ENDPOINT = "${ep}"`);
  l(`-- Roblox: 1 stud = 0.28 m  →  1 m = 1/0.28 = 3.571 studs.`);
  l(`-- Using this value means every road width, segment length and building`);
  l(`-- dimension is the exact real-world size in Roblox's own unit system.`);
  l(`local SCALE = 3.571   -- studs per real-world metre  (DO NOT change unless you know why)`);
  l(``);
  l(`local function S(m) return m * SCALE end   -- metres → studs`);
  l(``);
  l(`task.spawn(function()`);
  l(``);
  l(`-- 0. Fetch ──────────────────────────────────────────────────────`);
  l(`print("[Yesp] fetching tile…")`);
  l(`local ok, raw = pcall(function() return HttpService:GetAsync(ENDPOINT, true) end)`);
  l(`if not ok then warn("[Yesp] fetch failed: "..tostring(raw)); return end`);
  l(`local tile = HttpService:JSONDecode(raw)`);
  l(`print(string.format(`);
  l(`  "[Yesp] %d bldgs  %d roads  %d water  |  tile %dx%d m  |  SCALE=%d (1 stud=%.2fm)",`);
  l(`  tile.counts.buildings, tile.counts.roads, tile.counts.water,`);
  l(`  tile.size, tile.size, SCALE, 1/SCALE))`);
  l(``);
  l(`-- 1. Ground plane ───────────────────────────────────────────────`);
  l(`-- One large flat Part with Grass material.  Top surface = Y 0.`);
  l(`-- Roads and buildings all sit on Y 0.`);
  l(`print("[Yesp] placing ground…")`);
  l(`local ground = Instance.new("Part")`);
  l(`ground.Anchored      = true`);
  l(`ground.CanCollide    = true`);
  l(`ground.TopSurface    = Enum.SurfaceType.Smooth`);
  l(`ground.BottomSurface = Enum.SurfaceType.Smooth`);
  l(`ground.Size          = Vector3.new(S(tile.size) + 200, 4, S(tile.size) + 200)`);
  l(`ground.CFrame        = CFrame.new(0, -2, 0)   -- top surface at Y = 0`);
  l(`ground.Material      = Enum.Material.Grass`);
  l(`ground.Color         = Color3.fromRGB(106, 127, 63)`);
  l(`ground.Name          = "Ground"`);
  l(`ground.Parent        = Workspace`);
  l(``);
  l(`-- 2. Water ───────────────────────────────────────────────────────`);
  l(`-- Flat blue Parts sitting just above the ground for each OSM water polygon.`);
  l(`print("[Yesp] placing water…")`);
  l(`local waterFolder = Instance.new("Folder")`);
  l(`waterFolder.Name = "Water"; waterFolder.Parent = Workspace`);
  l(`for _, poly in ipairs(tile.water) do`);
  l(`  local mnx, mxx, mnz, mxz = math.huge, -math.huge, math.huge, -math.huge`);
  l(`  for _, pt in ipairs(poly) do`);
  l(`    if pt.x < mnx then mnx = pt.x end; if pt.x > mxx then mxx = pt.x end`);
  l(`    if pt.z < mnz then mnz = pt.z end; if pt.z > mxz then mxz = pt.z end`);
  l(`  end`);
  l(`  if mxx > mnx and mxz > mnz then`);
  l(`    local wp = Instance.new("Part")`);
  l(`    wp.Anchored      = true`);
  l(`    wp.CanCollide    = false`);
  l(`    wp.TopSurface    = Enum.SurfaceType.Smooth`);
  l(`    wp.BottomSurface = Enum.SurfaceType.Smooth`);
  l(`    wp.Size          = Vector3.new(S(mxx-mnx), 0.5, S(mxz-mnz))`);
  l(`    wp.CFrame        = CFrame.new(S((mnx+mxx)*0.5), 0.25, S((mnz+mxz)*0.5))`);
  l(`    wp.Material      = Enum.Material.SmoothPlastic`);
  l(`    wp.Color         = Color3.fromRGB(28, 100, 168)`);
  l(`    wp.Transparency  = 0.35`);
  l(`    wp.Name          = "Water"`);
  l(`    wp.Parent        = waterFolder`);
  l(`  end`);
  l(`  task.wait()`);
  l(`end`);
  l(``);
  l(`-- 3. Roads & footpaths ──────────────────────────────────────────`);
  l(`-- Each OSM road centreline segment becomes a flat Part:`);
  l(`--   • Width  = road.w (metres * SCALE) — exact OSM carriageway width`);
  l(`--   • Length = segment length (exact OSM node positions)`);
  l(`--   • Height = ROAD_H (thin slab; high-priority roads sit slightly higher`);
  l(`--     so motorways paint over slip roads at junctions, no z-fighting)`);
  l(`--   • CFrame.new(midpoint, endpoint) — road lies flat in XZ; no Y tilt`);
  l(`print("[Yesp] placing roads…")`);
  l(`local roadFolder = Instance.new("Folder")`);
  l(`roadFolder.Name = "Roads"; roadFolder.Parent = Workspace`);
  l(``);
  l(`local ROAD_H = 1  -- slab thickness in studs (sits on Y 0; top at Y ROAD_H)`);
  l(``);
  l(`-- Render lower-priority roads first so major roads are on top`);
  l(`table.sort(tile.roads, function(a, b) return (a.pri or 1) < (b.pri or 1) end)`);
  l(``);
  l(`local ROAD_COL = Color3.fromRGB(50, 52, 56)`);
  l(`local PATH_COL = Color3.fromRGB(138, 130, 112)`);
  l(`local rSeg = 0`);
  l(``);
  l(`for _, road in ipairs(tile.roads) do`);
  l(`  local pts    = road.pts`);
  l(`  local n      = #pts`);
  l(`  if n < 2 then continue end`);
  l(``);
  l(`  local isPath = (road.kind == "path")`);
  l(`  local col    = isPath and PATH_COL or ROAD_COL`);
  l(`  local rMat   = isPath and Enum.Material.Concrete or Enum.Material.Asphalt`);
  l(`  local wSt    = S(road.w)          -- road width in studs`);
  l(`  -- Higher-priority roads sit fractionally higher to avoid z-fighting`);
  l(`  local centY  = ROAD_H * 0.5 + (road.pri or 1) * 0.04`);
  l(`  -- End-cap extension (studs): extends each segment beyond its endpoints`);
  l(`  -- so adjacent segments in the same way share a tiny overlap at the corner`);
  l(`  local capSt  = wSt * 0.5`);
  l(``);
  l(`  for i = 1, n - 1 do`);
  l(`    local a, b = pts[i], pts[i+1]`);
  l(`    -- Convert to studs (EXACT OSM positions * SCALE, no modification)`);
  l(`    local axS, azS = S(a.x), S(a.z)`);
  l(`    local bxS, bzS = S(b.x), S(b.z)`);
  l(`    local dx = bxS - axS`);
  l(`    local dz = bzS - azS`);
  l(`    local len = math.sqrt(dx*dx + dz*dz)`);
  l(`    if len < 0.05 then continue end`);
  l(``);
  l(`    local mx = (axS + bxS) * 0.5`);
  l(`    local mz = (azS + bzS) * 0.5`);
  l(``);
  l(`    local p = Instance.new("Part")`);
  l(`    p.Anchored      = true`);
  l(`    p.CanCollide    = true`);
  l(`    p.CastShadow    = false`);
  l(`    p.TopSurface    = Enum.SurfaceType.Smooth`);
  l(`    p.BottomSurface = Enum.SurfaceType.Smooth`);
  l(`    p.Size          = Vector3.new(wSt, ROAD_H, len + capSt)`);
  l(`    p.Color         = col`);
  l(`    p.Material      = rMat`);
  l(`    -- Road lies perfectly flat: midpoint and lookAt share the same Y (centY)`);
  l(`    -- so CFrame.new() produces a horizontal part aligned along the segment`);
  l(`    p.CFrame        = CFrame.new(`);
  l(`      Vector3.new(mx,  centY, mz),`);
  l(`      Vector3.new(bxS, centY, bzS))`);
  l(`    p.Parent        = roadFolder`);
  l(`    rSeg += 1`);
  l(`    if rSeg % 400 == 0 then task.wait() end`);
  l(`  end`);
  l(`end`);
  l(``);
  l(`-- 4. Buildings ───────────────────────────────────────────────────`);
  l(`-- Box Parts, base flush with the ground (Y 0), sized from the OSM`);
  l(`-- footprint OBB (width, depth) and height tag (or levels * 3.2 m).`);
  l(`-- Since ground is flat, no terrain lookup needed — zero clipping risk.`);
  l(`print("[Yesp] placing buildings…")`);
  l(`local bldFolder = Instance.new("Folder")`);
  l(`bldFolder.Name = "Buildings"; bldFolder.Parent = Workspace`);
  l(`local palette = {`);
  l(`  Color3.fromRGB(200,192,180), Color3.fromRGB(180,173,163),`);
  l(`  Color3.fromRGB(162,155,145), Color3.fromRGB(190,182,170),`);
  l(`  Color3.fromRGB(154,152,154), Color3.fromRGB(176,170,158),`);
  l(`}`);
  l(`local bCount = 0`);
  l(`for _, b in ipairs(tile.buildings) do`);
  l(`  if b.w < 1 or b.d < 1 then continue end`);
  l(`  local part = Instance.new("Part")`);
  l(`  part.Anchored      = true`);
  l(`  part.TopSurface    = Enum.SurfaceType.Smooth`);
  l(`  part.BottomSurface = Enum.SurfaceType.Smooth`);
  l(`  -- w, h, d are metres from the OSM footprint OBB — multiplied by SCALE for studs`);
  l(`  part.Size   = Vector3.new(S(b.w), S(b.h), S(b.d))`);
  l(`  -- Centre Y: half the height above Y 0 (base exactly on the ground)`);
  l(`  part.CFrame = CFrame.new(S(b.cx), S(b.h) * 0.5, S(b.cz))`);
  l(`             * CFrame.Angles(0, -b.rot, 0)`);
  l(`  part.Color    = palette[(bCount % #palette) + 1]`);
  l(`  part.Material = Enum.Material.Concrete`);
  l(`  part.Parent   = bldFolder`);
  l(`  bCount += 1`);
  l(`  if bCount % 200 == 0 then task.wait() end`);
  l(`end`);
  l(``);
  l(`print(string.format(`);
  l(`  "[Yesp] done — %d buildings  %d road segs  %d water  (SCALE=%d, 1 stud=%.2fm)",`);
  l(`  tile.counts.buildings, rSeg, tile.counts.water, SCALE, 1/SCALE))`);
  l(`end)`);

  return L.join("\n");
}

module.exports = { buildTile, robloxScript, MAX_SIZE, MIN_SIZE };
