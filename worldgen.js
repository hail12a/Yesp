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

const MAX_SIZE = 8000;   // metres — now higher, RAM is not the limit
const MIN_SIZE = 100;
const M_PER_DEG_LAT = 111320;
const SRTM_N = 3601;    // SRTM1: 3601×3601 samples per 1° tile

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

  // AWS public elevation dataset (Skadi — SRTM1 + voids filled)
  const ns = ilat >= 0 ? "N" : "S", lat2 = String(Math.abs(ilat)).padStart(2, "0");
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/skadi/${ns}${lat2}/${name}.hgt.gz`;
  console.log("[srtm] downloading", url);
  const gz = await httpGetBuf(url);
  const buf = await gunzip(gz);
  fs.writeFileSync(file, buf);
  return buf;
}
function srtmSample(buf, fRow, fCol) {
  // bilinear interpolation over the INT16 big-endian grid
  const r0 = Math.max(0, Math.min(SRTM_N - 2, Math.floor(fRow)));
  const c0 = Math.max(0, Math.min(SRTM_N - 2, Math.floor(fCol)));
  const tr = fRow - r0, tc = fCol - c0;
  const r1 = r0 + 1, c1 = c0 + 1;
  const rd = (r, c) => { const v = buf.readInt16BE((r * SRTM_N + c) * 2); return v === -32768 ? 0 : v; };
  return rd(r0,c0)*(1-tc)*(1-tr) + rd(r0,c1)*tc*(1-tr) + rd(r1,c0)*(1-tc)*tr + rd(r1,c1)*tc*tr;
}

async function buildElevationGrid(clat, clng, halfM) {
  // choose resolution: aim for ~4 m step, max 1024 samples per side
  const stepM  = Math.max(4, halfM * 2 / 1024);
  const res    = Math.round(halfM * 2 / stepM) + 1; // samples per side
  const dLat   = halfM / M_PER_DEG_LAT;
  const mPerLng = M_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180);
  const dLng   = halfM / mPerLng;

  // collect all 1°×1° tiles needed (may span up to 4)
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
      // position within the tile: row 0 = north edge of the 1° tile
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
// Real-world carriageway widths in metres — used only when OSM lacks width/lanes tags.
// OSM highway=motorway/trunk is usually drawn per-direction (one carriageway).
const ROAD_W = {
  motorway:11, motorway_link:5, trunk:9, trunk_link:5,
  primary:7, primary_link:4, secondary:7, secondary_link:4,
  tertiary:6, tertiary_link:4, residential:5.5, living_street:4,
  unclassified:5.5, service:3.5, track:3,
  pedestrian:4, footway:2, path:1.5, cycleway:2,
};

/* ---- oriented bounding box (min-area rectangle) for a footprint ----
   Extruding the axis-aligned bbox turns rotated/L-shaped buildings into
   huge slabs. The minimum-area rectangle hugs the footprint and gives a
   properly oriented boxy building. */
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
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len; // edge dir
    const vx = -uz, vz = ux;                               // perpendicular
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
        // drop degenerate slivers and absurdly large polygons (mistagged landuse)
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
      // prefer explicit OSM width tag (metres), then lanes×3.5, then class default
      let w;
      const tw = parseFloat(t.width);
      if (isFinite(tw) && tw > 0) {
        w = tw;
      } else {
        const lanes = parseInt(t.lanes);
        w = (isFinite(lanes) && lanes > 0) ? lanes * 3.5 : (ROAD_W[t.highway] || 3);
      }
      const pts = simplify(el.geometry.map(p => proj(p.lat, p.lon)), 0.5);
      if (pts.length >= 2) roads.push({ cls: t.highway, w: +w.toFixed(1), pts });
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
        if (pts.length >= 3 && polyArea(pts) >= 150) water.push(pts); // skip tiny puddles that render as speckle
      }
    }
  }
  return { buildings, roads, water, ok: true };
}

/* =========================================================
   Main entry: build (or load) a tile
   ========================================================= */
function tileKey(lat, lng, size) {
  return crypto.createHash("sha1").update(`v4_${lat.toFixed(5)}_${lng.toFixed(5)}_${size}`).digest("hex").slice(0, 16);
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
    v: 2,
    center: { lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
    size, halfM,
    scale: 1,  // 1 stud = 1 metre
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
   Roblox Luau renderer script (server-fetches tile at runtime)
   ========================================================= */
function robloxScript(host, lat, lng, size) {
  const endpoint = `${host}/api/world/tile?lat=${lat}&lng=${lng}&size=${size}`;
  return `--[[
  Yesp Real-World Renderer — PASTE INTO THE STUDIO COMMAND BAR
  (View → Command Bar), then press Enter.

  Builds a real-world tile (${size}×${size} m around ${lat}, ${lng})
  directly in edit mode, so the result is BAKED INTO YOUR PLACE and
  saved — no runtime script, nothing to break on Play:
    • Terrain heightmap (SRTM1, bilinear-interpolated)
    • Water bodies (polygon raster fill)
    • Roads (asphalt parts)
    • Buildings (extruded footprint boxes)
  Scale: 1 stud = 1 metre.
  Requires: Game Settings → Security → Allow HTTP Requests = ON.
  The build runs on a background thread so Studio stays responsive.
--]]

local HttpService = game:GetService("HttpService")
local Workspace   = game:GetService("Workspace")
local Terrain     = Workspace.Terrain

local ENDPOINT = "${endpoint}"
local BASE_Y   = 0  -- world Y for the tile's minimum elevation (sea level)

task.spawn(function()
----- fetch & decode -----------------------------------------
print("[Yesp] fetching tile…")
local ok, raw = pcall(function() return HttpService:GetAsync(ENDPOINT, true) end)
if not ok then warn("[Yesp] fetch failed: "..tostring(raw)); return end
local tile = HttpService:JSONDecode(raw)
local elev = tile.elevation
print(string.format("[Yesp] %dx%d grid, %.1f m step, %d bldgs, %d roads, %d water, src=%s",
  elev.res, elev.res, elev.stepM,
  tile.counts.buildings, tile.counts.roads, tile.counts.water, elev.source))

local minH = elev.minH
local res  = elev.res
local step = elev.stepM   -- metres per grid cell
local half = tile.halfM

----- helpers -------------------------------------------------
local function gridH(ix, iz)
  ix = math.clamp(ix, 0, res-1); iz = math.clamp(iz, 0, res-1)
  return (elev.heights[iz*res + ix + 1] or minH) - minH
end
local function bilinH(fx, fz)
  local ix, iz = math.floor(fx), math.floor(fz)
  local tx, tz = fx-ix, fz-iz
  return gridH(ix,iz)*(1-tx)*(1-tz) + gridH(ix+1,iz)*(tx)*(1-tz)
       + gridH(ix,iz+1)*(1-tx)*tz   + gridH(ix+1,iz+1)*tx*tz
end
local function worldY(x, z)  -- terrain Y at a local-metre point
  local fx = math.clamp((x + half) / step, 0, res-2)
  local fz = math.clamp((z + half) / step, 0, res-2)
  return BASE_Y + bilinH(fx, fz)
end

----- 1. terrain (WriteVoxels heightmap, smooth occupancy) ---
print("[Yesp] building terrain…")
local VRES  = 4                   -- Roblox voxel resolution (studs)
local FLOOR = 60                  -- studs of solid ground below the lowest point
local function snap(v) return math.floor(v / VRES) * VRES end

-- grid-aligned origin so the region edges land exactly on voxel boundaries
local ox = snap(-half)
local oz = snap(-half)
local oy = snap(BASE_Y - FLOOR)
local nx = math.ceil((tile.size + (-half - ox)) / VRES) + 1
local nz = math.ceil((tile.size + (-half - oz)) / VRES) + 1
local ny = math.ceil(((elev.maxH - minH) + (BASE_Y - oy)) / VRES) + 1

local GRASS, AIR = Enum.Material.Grass, Enum.Material.Air
local BAND = 24                   -- voxels of Z processed per WriteVoxels call

for z0 = 0, nz - 1, BAND do
  local zc = math.min(BAND, nz - z0)
  local region = Region3.new(
    Vector3.new(ox, oy, oz + z0 * VRES),
    Vector3.new(ox + nx * VRES, oy + ny * VRES, oz + (z0 + zc) * VRES)
  )
  local mat, occ = {}, {}
  for xi = 1, nx do
    local mcol, ocol = {}, {}
    local wx = ox + (xi - 0.5) * VRES
    for yi = 1, ny do
      local mrow, orow = {}, {}
      local voxBottom = oy + (yi - 1) * VRES
      for zi = 1, zc do
        local wz = oz + (z0 + zi - 0.5) * VRES
        local surf = worldY(wx, wz)                 -- terrain top (studs)
        local frac = (surf - voxBottom) / VRES       -- how full this voxel is
        if frac >= 1 then
          mrow[zi] = GRASS; orow[zi] = 1
        elseif frac <= 0 then
          mrow[zi] = AIR;   orow[zi] = 0
        else
          mrow[zi] = GRASS; orow[zi] = frac           -- partial = smooth surface
        end
      end
      mcol[yi] = mrow; ocol[yi] = orow
    end
    mat[xi] = mcol; occ[xi] = ocol
  end
  Terrain:WriteVoxels(region, VRES, mat, occ)
  task.wait()
end

----- 2. water -----------------------------------------------
print("[Yesp] placing water…")
local function pip(poly, px, pz)
  local c, n, j = false, #poly, #poly
  for i = 1, n do
    local a, b = poly[i], poly[j]
    if ((a.z>pz)~=(b.z>pz)) and px < (b.x-a.x)*(pz-a.z)/(b.z-a.z)+a.x then c=not c end
    j=i
  end
  return c
end
for _, poly in ipairs(tile.water) do
  local minx,maxx,minz,maxz = math.huge,-math.huge,math.huge,-math.huge
  for _,p in ipairs(poly) do
    if p.x<minx then minx=p.x end; if p.x>maxx then maxx=p.x end
    if p.z<minz then minz=p.z end; if p.z>maxz then maxz=p.z end
  end
  local cell = 8
  for wz = minz, maxz, cell do for wx = minx, maxx, cell do
    if pip(poly, wx+cell/2, wz+cell/2) then
      local gy = worldY(wx+cell/2, wz+cell/2)
      Terrain:FillBlock(
        CFrame.new(wx+cell/2, gy-6, wz+cell/2),
        Vector3.new(cell, 14, cell), Enum.Material.Water)
    end
  end end
  task.wait()
end

----- 3. roads (raised flat ribbons that follow the terrain) -
print("[Yesp] placing roads…")
local roadFolder = Instance.new("Folder")
roadFolder.Name = "Roads"; roadFolder.Parent = Workspace
local rSeg = 0
for _, road in ipairs(tile.roads) do
  for i = 1, #road.pts - 1 do
    local a, b = road.pts[i], road.pts[i+1]
    local ax,az,bx,bz = a.x,a.z,b.x,b.z
    local len = math.sqrt((bx-ax)^2+(bz-az)^2)
    if len > 0.5 then
      local mx, mz = (ax+bx)/2, (az+bz)/2
      -- average the two endpoint ground heights and sit clearly on top
      local gy = (worldY(ax,az) + worldY(bx,bz)) / 2 + 0.9
      local p = Instance.new("Part")
      p.Anchored=true; p.CanCollide=false; p.CastShadow=false
      p.TopSurface=Enum.SurfaceType.Smooth; p.BottomSurface=Enum.SurfaceType.Smooth
      p.Size=Vector3.new(road.w, 1.0, len + road.w*0.5) -- overlap joints so corners connect
      p.Color=Color3.fromRGB(48,48,52); p.Material=Enum.Material.Asphalt
      p.CFrame=CFrame.new(Vector3.new(mx,gy,mz), Vector3.new(bx,gy,bz))
      p.Parent=roadFolder
      rSeg += 1
      if rSeg % 250 == 0 then task.wait() end
    end
  end
end

----- 4. buildings (oriented footprint boxes) ----------------
print("[Yesp] placing buildings…")
local bldFolder = Instance.new("Folder")
bldFolder.Name="Buildings"; bldFolder.Parent=Workspace
local palette = {
  Color3.fromRGB(196,188,176), Color3.fromRGB(176,170,162),
  Color3.fromRGB(158,150,140), Color3.fromRGB(184,176,168),
  Color3.fromRGB(150,148,150),
}
local batchCount = 0
for _, b in ipairs(tile.buildings) do
  if b.w >= 1 and b.d >= 1 then
    -- sample all four corners + centre and take the lowest ground point
    local hw, hd = b.w/2, b.d/2
    local cr, sr = math.cos(-b.rot), math.sin(-b.rot)
    local corners = {
      {b.cx + cr*hw + sr*hd,  b.cz - sr*hw + cr*hd},
      {b.cx + cr*hw - sr*hd,  b.cz - sr*hw - cr*hd},
      {b.cx - cr*hw + sr*hd,  b.cz + sr*hw + cr*hd},
      {b.cx - cr*hw - sr*hd,  b.cz + sr*hw - cr*hd},
      {b.cx, b.cz},
    }
    local gy = math.huge
    for _, c in ipairs(corners) do
      local y = worldY(c[1], c[2])
      if y < gy then gy = y end
    end
    local part = Instance.new("Part")
    part.Anchored=true
    part.TopSurface=Enum.SurfaceType.Smooth; part.BottomSurface=Enum.SurfaceType.Smooth
    part.Size=Vector3.new(b.w, b.h, b.d)
    -- base flush with (or slightly below) the lowest corner so no floating
    part.CFrame=CFrame.new(b.cx, gy + b.h/2 - 1.0, b.cz) * CFrame.Angles(0, -b.rot, 0)
    part.Color=palette[(batchCount % #palette) + 1]; part.Material=Enum.Material.Concrete
    part.Parent=bldFolder
  end
  batchCount += 1
  if batchCount % 200 == 0 then task.wait() end
end

print(string.format("[Yesp] world build complete: %d buildings, %d road segments, %d water polys",
  tile.counts.buildings, tile.counts.roads, tile.counts.water))
end)
`;
}

module.exports = { buildTile, robloxScript, MAX_SIZE, MIN_SIZE };
