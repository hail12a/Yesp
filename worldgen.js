/* =========================================================
   worldgen.js — real-world → Roblox tile builder.

   Given a lat/lng + size (metres), this module:
     1. fetches an elevation grid (open SRTM via opentopodata,
        with open-elevation as a fallback),
     2. fetches OSM data (water, roads, buildings) via Overpass,
     3. converts everything to minimal local-metre JSON (no meshes,
        just numbers), centred on the tile,
     4. caches the result to disk so the same tile is instant next time.

   It also generates a ready-to-paste Roblox Luau renderer Script that
   calls the tile endpoint and builds terrain / water / roads / buildings.

   All heavy lifting (parsing OSM, processing the elevation grid) happens
   here on the server; Roblox only ever receives light JSON text.
   ========================================================= */
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CACHE_DIR = path.join(__dirname, "tilecache");
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}

const MAX_SIZE = 6000;      // largest tile edge we allow (metres) — RAM guard
const MIN_SIZE = 250;
const ELEV_RES = 24;        // elevation samples per side (24×24 = 576 points)
const M_PER_DEG_LAT = 111320;

/* ---- tiny HTTPS helpers (self-contained so this module stands alone) ---- */
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "yesp-worldgen", ...headers }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(httpGet(res.headers.location, headers));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}
function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(body);
    const req = https.request({
      method: "POST", hostname: u.hostname, path: u.pathname + u.search,
      headers: { "User-Agent": "yesp-worldgen", "Content-Type": "application/x-www-form-urlencoded", "Content-Length": data.length, ...headers },
      timeout: 60000,
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(data); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- coordinate helpers: lat/lng → local metres centred on the tile ---- */
function projector(clat, clng) {
  const mPerLng = M_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180);
  return {
    mPerLng,
    toLocal: (lat, lng) => ({
      x: +((lng - clng) * mPerLng).toFixed(1),   // east
      z: +((lat - clat) * M_PER_DEG_LAT).toFixed(1), // north
    }),
  };
}

/* ---- elevation: a square grid of heights (metres) ---- */
async function fetchElevation(clat, clng, half, res) {
  // build the sample grid (south→north rows, west→east cols)
  const dLat = (half / M_PER_DEG_LAT);
  const mPerLng = M_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180);
  const dLng = (half / mPerLng);
  const pts = [];
  for (let r = 0; r < res; r++) {
    const lat = clat - dLat + (2 * dLat) * (r / (res - 1));
    for (let c = 0; c < res; c++) {
      const lng = clng - dLng + (2 * dLng) * (c / (res - 1));
      pts.push([lat, lng]);
    }
  }
  const heights = new Array(pts.length).fill(0);

  // opentopodata: 100 locations per GET, ~1 req/sec on the public instance
  async function tryOpentopo() {
    for (let i = 0; i < pts.length; i += 100) {
      const batch = pts.slice(i, i + 100);
      const locs = batch.map((p) => p[0].toFixed(5) + "," + p[1].toFixed(5)).join("|");
      const url = "https://api.opentopodata.org/v1/srtm30m?locations=" + encodeURIComponent(locs);
      const j = JSON.parse(await httpGet(url));
      if (!j.results) throw new Error("no results");
      for (let k = 0; k < j.results.length; k++) {
        const e = j.results[k].elevation;
        heights[i + k] = typeof e === "number" ? e : 0;
      }
      if (i + 100 < pts.length) await sleep(1100); // respect 1 req/sec
    }
    return true;
  }
  // open-elevation fallback (single POST of all points)
  async function tryOpenElevation() {
    const body = JSON.stringify({ locations: pts.map((p) => ({ latitude: p[0], longitude: p[1] })) });
    const txt = await httpPost("https://api.open-elevation.com/api/v1/lookup", body, { "Content-Type": "application/json" });
    const j = JSON.parse(txt);
    if (!j.results) throw new Error("no results");
    for (let k = 0; k < j.results.length; k++) heights[k] = typeof j.results[k].elevation === "number" ? j.results[k].elevation : 0;
    return true;
  }

  let source = "flat";
  try { await tryOpentopo(); source = "opentopodata-srtm30m"; }
  catch (_) {
    try { await tryOpenElevation(); source = "open-elevation"; }
    catch (__) { /* leave all-zero (flat) so the renderer still works */ }
  }

  let min = Infinity, max = -Infinity;
  for (const h of heights) { if (h < min) min = h; if (h > max) max = h; }
  if (!isFinite(min)) { min = 0; max = 0; }
  return { res, step: +((2 * half) / (res - 1)).toFixed(2), heights: heights.map((h) => +h.toFixed(1)), minH: +min.toFixed(1), maxH: +max.toFixed(1), source };
}

/* ---- OSM via Overpass: water, roads, buildings ---- */
function ringFromGeom(geom, proj) {
  return geom.map((p) => proj.toLocal(p.lat, p.lon));
}
function simplify(pts, tol) {
  // cheap distance-based decimation; keeps endpoints
  if (pts.length <= 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) >= tol) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const ROAD_WIDTH = {
  motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 8,
  residential: 6, unclassified: 6, service: 4, living_street: 5,
  pedestrian: 4, footway: 2, path: 2, cycleway: 2, track: 3,
};

async function fetchOSM(clat, clng, half, proj) {
  const dLat = half / M_PER_DEG_LAT;
  const dLng = half / (M_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180));
  const s = clat - dLat, n = clat + dLat, w = clng - dLng, e = clng + dLng;
  const bbox = `${s},${w},${n},${e}`;
  const q = `[out:json][timeout:60];(` +
    `way["building"](${bbox});relation["building"](${bbox});` +
    `way["highway"](${bbox});` +
    `way["natural"="water"](${bbox});relation["natural"="water"](${bbox});` +
    `way["water"](${bbox});way["waterway"="riverbank"](${bbox});` +
    `way["natural"="coastline"](${bbox});` +
    `);out geom;`;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ];
  let data = null;
  for (const url of endpoints) {
    try { data = JSON.parse(await httpPost(url, "data=" + encodeURIComponent(q))); break; }
    catch (_) { /* try next mirror */ }
  }
  const buildings = [], roads = [], water = [], coastlines = [];
  if (!data || !data.elements) return { buildings, roads, water, coastlines, ok: false };

  for (const el of data.elements) {
    const tags = el.tags || {};
    // BUILDINGS — footprint polygon extruded by height
    if (tags.building) {
      let rings = [];
      if (el.type === "way" && el.geometry) rings = [el.geometry];
      else if (el.type === "relation" && el.members) rings = el.members.filter((m) => m.geometry && m.role !== "inner").map((m) => m.geometry);
      for (const g of rings) {
        if (!g || g.length < 3) continue;
        let h = parseFloat(tags.height);
        if (!isFinite(h)) {
          const lv = parseFloat(tags["building:levels"]);
          h = isFinite(lv) ? lv * 3.2 : 8;
        }
        h = Math.max(3, Math.min(300, h));
        const pts = simplify(ringFromGeom(g, proj), 1.5);
        if (pts.length >= 3) buildings.push({ h: +h.toFixed(1), pts });
      }
      continue;
    }
    // ROADS
    if (tags.highway && el.geometry && el.geometry.length >= 2) {
      const width = ROAD_WIDTH[tags.highway] || 5;
      const pts = simplify(ringFromGeom(el.geometry, proj), 2.5);
      if (pts.length >= 2) roads.push({ cls: tags.highway, w: width, pts });
      continue;
    }
    // COASTLINE (open ways marking land/sea boundary)
    if (tags.natural === "coastline" && el.geometry && el.geometry.length >= 2) {
      coastlines.push(simplify(ringFromGeom(el.geometry, proj), 3));
      continue;
    }
    // WATER polygons
    if (tags.natural === "water" || tags.water || tags.waterway === "riverbank") {
      let rings = [];
      if (el.type === "way" && el.geometry) rings = [el.geometry];
      else if (el.type === "relation" && el.members) rings = el.members.filter((m) => m.geometry && m.role !== "inner").map((m) => m.geometry);
      for (const g of rings) {
        if (!g || g.length < 3) continue;
        const pts = simplify(ringFromGeom(g, proj), 3);
        if (pts.length >= 3) water.push(pts);
      }
    }
  }
  // RAM / payload guards
  buildings.length = Math.min(buildings.length, 4000);
  roads.length = Math.min(roads.length, 3000);
  water.length = Math.min(water.length, 600);
  coastlines.length = Math.min(coastlines.length, 600);
  return { buildings, roads, water, coastlines, ok: true };
}

/* ---- the public entry: build (or load) one tile ---- */
function tileKey(lat, lng, size) {
  return crypto.createHash("sha1").update(`${lat.toFixed(5)}_${lng.toFixed(5)}_${size}`).digest("hex").slice(0, 16);
}
async function buildTile(lat, lng, size) {
  size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(size) || 3000));
  const key = tileKey(lat, lng, size);
  const cacheFile = path.join(CACHE_DIR, key + ".json");
  try {
    const cached = fs.readFileSync(cacheFile, "utf8");
    return { ...JSON.parse(cached), cached: true };
  } catch (_) {}

  const half = size / 2;
  const proj = projector(lat, lng);
  const [elevation, osm] = await Promise.all([
    fetchElevation(lat, lng, half, ELEV_RES),
    fetchOSM(lat, lng, half, proj),
  ]);

  const tile = {
    center: { lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
    size, half,
    scale: 1,                       // 1 stud = 1 metre in Roblox
    elevation,
    water: osm.water,
    coastlines: osm.coastlines,
    roads: osm.roads,
    buildings: osm.buildings,
    counts: { water: osm.water.length, roads: osm.roads.length, buildings: osm.buildings.length },
    osmOk: osm.ok,
    built: Date.now(),
  };
  try { fs.writeFileSync(cacheFile, JSON.stringify(tile)); } catch (_) {}
  return { ...tile, cached: false };
}

/* ---- generate the Roblox Luau renderer Script (returned as text) ---- */
function robloxScript(host, lat, lng, size) {
  const endpoint = `${host}/api/world/tile?lat=${lat}&lng=${lng}&size=${size}`;
  return `--[[
  Yesp Real-World Tile Renderer  (paste into ServerScriptService)
  Builds a ${size}x${size} m slice of the real world around
  (${lat}, ${lng}) from open map data: terrain, water, roads, buildings.

  Requires: Game Settings -> Security -> "Allow HTTP Requests" = ON.
--]]

local HttpService = game:GetService("HttpService")
local Workspace   = game:GetService("Workspace")
local Terrain     = Workspace.Terrain

local ENDPOINT = "${endpoint}"
local STUD     = 1            -- 1 stud == 1 metre
local BASE_Y   = 0           -- world Y at the tile's minimum elevation

-- ---------- fetch ----------
local ok, raw = pcall(function() return HttpService:GetAsync(ENDPOINT) end)
if not ok then warn("Tile fetch failed: "..tostring(raw)); return end
local tile = HttpService:JSONDecode(raw)
print(string.format("Tile loaded: %d buildings, %d roads, %d water (%s elevation)",
  tile.counts.buildings, tile.counts.roads, tile.counts.water, tile.elevation.source))

local minH = tile.elevation.minH
local function heightAt(ix, iz) -- grid indices -> metres above BASE_Y
  local res = tile.elevation.res
  ix = math.clamp(ix, 0, res - 1); iz = math.clamp(iz, 0, res - 1)
  return tile.elevation.heights[iz * res + ix + 1] - minH
end

-- ---------- terrain (heightmap as filled columns) ----------
local res  = tile.elevation.res
local step = tile.elevation.step          -- metres between samples
local FLOOR = 40                          -- metres of solid ground below the surface
for iz = 0, res - 2 do
  for ix = 0, res - 2 do
    local h = (heightAt(ix,iz)+heightAt(ix+1,iz)+heightAt(ix,iz+1)+heightAt(ix+1,iz+1))/4
    local cx = (-tile.half + (ix + 0.5) * step) * STUD
    local cz = (-tile.half + (iz + 0.5) * step) * STUD
    local top = BASE_Y + h * STUD
    local colH = (top - (BASE_Y - FLOOR))
    Terrain:FillBlock(
      CFrame.new(cx, (top + BASE_Y - FLOOR) / 2, cz),
      Vector3.new(step * STUD, colH, step * STUD),
      Enum.Material.Grass
    )
  end
  task.wait()                             -- yield each row so Studio stays responsive
end

-- ground height (metres) for placing objects on the terrain
local function groundY(x, z)
  local ix = (x / STUD + tile.half) / step
  local iz = (z / STUD + tile.half) / step
  return BASE_Y + heightAt(math.floor(ix + 0.5), math.floor(iz + 0.5)) * STUD
end

-- ---------- water ----------
local function fillWater(poly)
  local minx, maxx, minz, maxz = math.huge, -math.huge, math.huge, -math.huge
  for _, p in ipairs(poly) do
    minx = math.min(minx, p.x); maxx = math.max(maxx, p.x)
    minz = math.min(minz, p.z); maxz = math.max(maxz, p.z)
  end
  local function inside(px, pz)
    local c = false; local n = #poly; local j = n
    for i = 1, n do
      local a, b = poly[i], poly[j]
      if ((a.z > pz) ~= (b.z > pz)) and (px < (b.x - a.x) * (pz - a.z) / (b.z - a.z) + a.x) then c = not c end
      j = i
    end
    return c
  end
  local cell = 8
  for z = minz, maxz, cell do
    for x = minx, maxx, cell do
      if inside(x + cell/2, z + cell/2) then
        local y = groundY(x, z)
        Terrain:FillBlock(
          CFrame.new(x*STUD + cell/2, y - 7, z*STUD + cell/2),
          Vector3.new(cell, 16, cell),
          Enum.Material.Water
        )
      end
    end
  end
end
for _, poly in ipairs(tile.water) do fillWater(poly) end

-- ---------- roads ----------
local roadFolder = Instance.new("Folder"); roadFolder.Name = "Roads"; roadFolder.Parent = Workspace
for _, road in ipairs(tile.roads) do
  for i = 1, #road.pts - 1 do
    local a, b = road.pts[i], road.pts[i+1]
    local ax, az, bx, bz = a.x*STUD, a.z*STUD, b.x*STUD, b.z*STUD
    local len = math.max(0.5, math.sqrt((bx-ax)^2 + (bz-az)^2))
    local mx, mz = (ax+bx)/2, (az+bz)/2
    local y = groundY((a.x+b.x)/2, (a.z+b.z)/2) + 0.2
    local p = Instance.new("Part")
    p.Anchored = true; p.CanCollide = false
    p.Size = Vector3.new(road.w, 0.4, len)
    p.Color = Color3.fromRGB(60, 60, 64)
    p.Material = Enum.Material.Asphalt
    p.CFrame = CFrame.new(Vector3.new(mx, y, mz), Vector3.new(bx, y, bz))
    p.Parent = roadFolder
  end
end

-- ---------- buildings (extruded boxy footprints) ----------
local bldFolder = Instance.new("Folder"); bldFolder.Name = "Buildings"; bldFolder.Parent = Workspace
for _, b in ipairs(tile.buildings) do
  local minx, maxx, minz, maxz = math.huge, -math.huge, math.huge, -math.huge
  for _, p in ipairs(b.pts) do
    minx = math.min(minx, p.x); maxx = math.max(maxx, p.x)
    minz = math.min(minz, p.z); maxz = math.max(maxz, p.z)
  end
  local w, d = (maxx - minx) * STUD, (maxz - minz) * STUD
  if w >= 1 and d >= 1 then
    local cx, cz = (minx + maxx)/2, (minz + maxz)/2
    local gy = groundY(cx, cz)
    local part = Instance.new("Part")
    part.Anchored = true
    part.Size = Vector3.new(w, b.h * STUD, d)
    part.Position = Vector3.new(cx*STUD, gy + (b.h*STUD)/2, cz*STUD)
    part.Color = Color3.fromRGB(150, 145, 135)
    part.Material = Enum.Material.Concrete
    part.Parent = bldFolder
  end
end

print("World build complete.")
`;
}

module.exports = { buildTile, robloxScript, MAX_SIZE, MIN_SIZE };
