/* =========================================================
   worldbuilder.js — Real-world terrain → Roblox Studio script
   ---------------------------------------------------------
   Pulls live elevation (AWS Terrarium tiles, SRTM/NASA based)
   and roads (OpenStreetMap Overpass), then writes a Lua script
   that rebuilds the area as Roblox Terrain + road parts at
   1 stud = 1 metre. 100% client-side, no API keys.
   Exposes window.wireWorldBuilder(); called by app.js on render.
   ========================================================= */
(function () {
  const $ = (s, r = document) => r.querySelector(s);

  const TILE_URL = (z, x, y) =>
    `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const OVERPASS = 'https://overpass-api.de/api/interpreter';

  // ---- web-mercator helpers (fractional global pixel coords) ----
  const lonToPx = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z) * 256;
  const latToPx = (lat, z) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z) * 256;
  };
  const mPerPx = (lat, z) =>
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);

  const loadImg = (url) =>
    new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('tile failed: ' + url));
      img.src = url;
    });

  function setStatus(el, msg, kind) {
    el.textContent = msg;
    el.className = 'wb-status' + (kind ? ' ' + kind : '');
  }

  // road widths (studs/metres) by OSM highway class
  const ROAD_W = {
    motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 7,
    residential: 5, unclassified: 5, service: 4, living_street: 5,
    pedestrian: 4, track: 4, path: 2, footway: 2, cycleway: 2,
  };

  window.wireWorldBuilder = function wireWorldBuilder() {
    const gen = $('#wb-gen');
    if (!gen) return; // not on this page

    const statusEl = $('#wb-status');
    const statsEl = $('#wb-stats');
    const outEl = $('#wb-out');
    const copyBtn = $('#wb-copy');
    const dlLink = $('#wb-dl');
    let lastScript = '';

    // city quick-picks
    $('#wb-cities').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        $('#wb-lat').value = b.dataset.lat;
        $('#wb-lon').value = b.dataset.lon;
      })
    );

    copyBtn.addEventListener('click', () => {
      if (!lastScript) return;
      navigator.clipboard.writeText(lastScript);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy script'), 1300);
    });

    gen.addEventListener('click', () => run().catch((e) => {
      console.error(e);
      setStatus(statusEl, '✖ ' + e.message, 'err');
    }));

    async function run() {
      gen.disabled = true;
      copyBtn.disabled = true;
      try {
        const lat = parseFloat($('#wb-lat').value);
        const lon = parseFloat($('#wb-lon').value);
        const sizeKm = parseFloat($('#wb-size').value);
        const detailM = parseFloat($('#wb-detail').value);
        const wantRoads = $('#wb-roads').checked;
        const wantWater = $('#wb-water').checked;

        if (!isFinite(lat) || !isFinite(lon)) throw new Error('Enter a valid latitude/longitude.');

        const sizeM = sizeKm * 1000;
        const half = sizeM / 2;

        // geographic bbox
        const mPerDegLat = 111320;
        const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
        const dLat = half / mPerDegLat;
        const dLon = half / mPerDegLon;
        const north = lat + dLat, south = lat - dLat;
        const east = lon + dLon, west = lon - dLon;

        // choose zoom so source resolution ≈ detail, capped by tile count
        let z = Math.ceil(Math.log2((156543.034 * Math.cos((lat * Math.PI) / 180)) / detailM));
        z = Math.max(10, Math.min(15, z));
        let txMin, txMax, tyMin, tyMax;
        while (z > 10) {
          txMin = Math.floor(lonToPx(west, z) / 256);
          txMax = Math.floor(lonToPx(east, z) / 256);
          tyMin = Math.floor(latToPx(north, z) / 256);
          tyMax = Math.floor(latToPx(south, z) / 256);
          if ((txMax - txMin + 1) * (tyMax - tyMin + 1) <= 64) break;
          z--;
        }
        txMin = Math.floor(lonToPx(west, z) / 256);
        txMax = Math.floor(lonToPx(east, z) / 256);
        tyMin = Math.floor(latToPx(north, z) / 256);
        tyMax = Math.floor(latToPx(south, z) / 256);

        const cols = txMax - txMin + 1, rows = tyMax - tyMin + 1;
        setStatus(statusEl, `Downloading ${cols * rows} elevation tiles (zoom ${z})…`);

        // stitch tiles into one canvas
        const cw = cols * 256, ch = rows * 256;
        const cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        const ctx = cv.getContext('2d', { willReadFrequently: true });

        const jobs = [];
        for (let ty = tyMin; ty <= tyMax; ty++)
          for (let tx = txMin; tx <= txMax; tx++)
            jobs.push(
              loadImg(TILE_URL(z, tx, ty)).then((img) =>
                ctx.drawImage(img, (tx - txMin) * 256, (ty - tyMin) * 256)
              )
            );
        await Promise.all(jobs);

        let imgData;
        try {
          imgData = ctx.getImageData(0, 0, cw, ch);
        } catch (e) {
          throw new Error('Browser blocked reading the elevation tiles (CORS). Try again or a different network.');
        }
        const px = imgData.data;
        const originPxX = txMin * 256, originPxY = tyMin * 256;

        // sample N×N output grid
        const N = Math.max(16, Math.min(513, Math.round(sizeM / detailM) + 1));
        const spacing = sizeM / (N - 1);
        setStatus(statusEl, `Sampling ${N}×${N} height grid…`);

        const elevAt = (gx, gy) => {
          // bilinear read of decoded elevation at global pixel (gx,gy)
          let x = gx - originPxX, y = gy - originPxY;
          x = Math.max(0, Math.min(cw - 1.001, x));
          y = Math.max(0, Math.min(ch - 1.001, y));
          const x0 = Math.floor(x), y0 = Math.floor(y);
          const x1 = Math.min(x0 + 1, cw - 1), y1 = Math.min(y0 + 1, ch - 1);
          const fx = x - x0, fy = y - y0;
          const dec = (xi, yi) => {
            const i = (yi * cw + xi) * 4;
            return px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
          };
          const a = dec(x0, y0) + (dec(x1, y0) - dec(x0, y0)) * fx;
          const b = dec(x0, y1) + (dec(x1, y1) - dec(x0, y1)) * fx;
          return a + (b - a) * fy;
        };

        const heights = new Float32Array(N * N);
        let minH = Infinity, maxH = -Infinity;
        for (let j = 0; j < N; j++) {
          const latJ = north - (north - south) * (j / (N - 1));
          const gy = latToPx(latJ, z);
          for (let i = 0; i < N; i++) {
            const lonI = west + (east - west) * (i / (N - 1));
            const gx = lonToPx(lonI, z);
            const h = elevAt(gx, gy);
            heights[j * N + i] = h;
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
          }
        }
        minH = Math.floor(minH);
        maxH = Math.ceil(maxH);

        // ---- roads (optional) ----
        let roads = [];
        if (wantRoads) {
          setStatus(statusEl, 'Fetching roads from OpenStreetMap…');
          try {
            const q =
              `[out:json][timeout:25];(way["highway"](${south},${west},${north},${east}););out geom;`;
            const resp = await fetch(OVERPASS, {
              method: 'POST',
              body: 'data=' + encodeURIComponent(q),
            });
            const data = await resp.json();
            for (const el of data.elements || []) {
              if (el.type !== 'way' || !el.geometry) continue;
              const w = ROAD_W[el.tags && el.tags.highway] || 4;
              const pts = [];
              for (const g of el.geometry) {
                const x = (g.lon - lon) * mPerDegLon;      // east = +X
                const zz = (lat - g.lat) * mPerDegLat;     // south = +Z
                if (x < -half - 50 || x > half + 50 || zz < -half - 50 || zz > half + 50) continue;
                pts.push(Math.round(x), Math.round(zz));
              }
              if (pts.length >= 4) roads.push({ w, p: pts });
            }
          } catch (e) {
            console.warn('roads failed', e);
          }
        }

        // ---- emit Lua ----
        setStatus(statusEl, 'Writing Studio script…');
        lastScript = buildLua({
          N, spacing, minH, maxH, heights, roads,
          wantWater, lat, lon, sizeKm, z,
        });

        outEl.textContent = lastScript;
        copyBtn.disabled = false;
        dlLink.removeAttribute('aria-disabled');
        const blob = new Blob([lastScript], { type: 'text/plain' });
        dlLink.href = URL.createObjectURL(blob);
        dlLink.download = `terrain_${sizeKm}km_${lat.toFixed(3)}_${lon.toFixed(3)}.lua`;

        const span = ((N - 1) * spacing).toFixed(0);
        statsEl.innerHTML =
          `<b>${N}×${N}</b> samples · spacing <b>${spacing.toFixed(1)} m</b> · world <b>${span}×${span} studs</b><br>` +
          `elevation <b>${minH}–${maxH} m</b> (range ${maxH - minH} m) · zoom ${z} · ` +
          `<b>${roads.length}</b> road segments · script ${(lastScript.length / 1024).toFixed(0)} KB`;
        setStatus(statusEl, '✔ Done — copy the script (or download for big areas) and run it in Studio.', 'ok');
      } finally {
        gen.disabled = false;
      }
    }

    // ---------- Lua emitter ----------
    function buildLua(o) {
      const { N, spacing, minH, maxH, heights, roads, wantWater, lat, lon, sizeKm, z } = o;

      // store heights as (h - minH) rounded ints, row-major j*N+i
      const hParts = new Array(N * N);
      for (let k = 0; k < N * N; k++) hParts[k] = Math.round(heights[k] - minH);

      const roadLua = roads
        .map((r) => `{w=${r.w},p={${r.p.join(',')}}}`)
        .join(',\n');

      return `--[[
  Real-world terrain — ${sizeKm}×${sizeKm} km around (${lat.toFixed(4)}, ${lon.toFixed(4)})
  Data: AWS Terrarium elevation (zoom ${z}) + OpenStreetMap roads.
  Scale: 1 stud = 1 metre.  Paste into the Studio Command Bar (small areas)
         or into a Script in ServerScriptService (large areas) and run once.
--]]
local Terrain = workspace.Terrain
local N, SPACING, BASE, MAXH = ${N}, ${spacing.toFixed(4)}, ${minH}, ${maxH}
local SIZE = (N - 1) * SPACING
local HALF = SIZE / 2
local WATER = ${wantWater ? 'true' : 'false'}
local SEA   = 0            -- real sea level (metres) for water fill

-- packed heightmap: (real - BASE), row-major j*N + i
local H = {${hParts.join(',')}}

-- bilinear ground height (studs) at world x,z
local function heightAt(x, z)
	local fx = (x + HALF) / SPACING
	local fz = (z + HALF) / SPACING
	if fx < 0 then fx = 0 elseif fx > N - 1 then fx = N - 1 end
	if fz < 0 then fz = 0 elseif fz > N - 1 then fz = N - 1 end
	local i0, j0 = math.floor(fx), math.floor(fz)
	local i1, j1 = math.min(i0 + 1, N - 1), math.min(j0 + 1, N - 1)
	local tx, tz = fx - i0, fz - j0
	local h00 = H[j0 * N + i0 + 1]; local h10 = H[j0 * N + i1 + 1]
	local h01 = H[j1 * N + i0 + 1]; local h11 = H[j1 * N + i1 + 1]
	local a = h00 + (h10 - h00) * tx
	local b = h01 + (h11 - h01) * tx
	return BASE + a + (b - a) * tz
end

-- ---- build terrain in chunks (4-stud voxels) ----
local VOX = 4
local FLOOR = BASE - 24
local CEIL  = MAXH + VOX
local CHUNK = 128                 -- studs per chunk side
local Grass, Rock, Sand, Wat = Enum.Material.Grass, Enum.Material.Rock,
	Enum.Material.Sand, Enum.Material.Water

local built = 0
local function buildChunk(ox, oz)
	local x1 = math.min(ox + CHUNK, HALF)
	local z1 = math.min(oz + CHUNK, HALF)
	local region = Region3.new(Vector3.new(ox, FLOOR, oz), Vector3.new(x1, CEIL, z1))
	region = region:ExpandToGrid(VOX)
	local size = region.Size
	local nx = math.floor(size.X / VOX)
	local ny = math.floor(size.Y / VOX)
	local nz = math.floor(size.Z / VOX)
	if nx < 1 or ny < 1 or nz < 1 then return end
	local base = region.CFrame.Position - size / 2

	-- WriteVoxels arrays are indexed [x][y][z], 1-based
	local mats, occ = {}, {}
	for xi = 1, nx do
		mats[xi], occ[xi] = {}, {}
		for yi = 1, ny do
			mats[xi][yi], occ[xi][yi] = {}, {}
		end
	end
	for xi = 1, nx do
		local wx = base.X + (xi - 0.5) * VOX
		for zi = 1, nz do
			local wz = base.Z + (zi - 0.5) * VOX
			local g = heightAt(wx, wz)
			for yi = 1, ny do
				local vb = base.Y + (yi - 1) * VOX     -- voxel bottom
				local fill = (g - vb) / VOX
				local m, o
				if fill >= 1 then
					o = 1
					m = (g - (vb + VOX) > 14) and Rock or Grass
				elseif fill > 0 then
					o = fill
					m = (g < SEA + 1) and Sand or Grass
				else
					o, m = 0, Grass
				end
				if WATER and o < 1 and (vb + VOX) <= SEA and g < SEA then
					o, m = 1, Wat        -- fill open space below sea level
				end
				mats[xi][yi][zi] = m
				occ[xi][yi][zi] = o
			end
		end
	end
	Terrain:WriteVoxels(region, VOX, mats, occ)
end

task.spawn(function()
	local t0 = os.clock()
	for oz = -HALF, HALF - 1, CHUNK do
		for ox = -HALF, HALF - 1, CHUNK do
			buildChunk(ox, oz)
			built += 1
			if built % 6 == 0 then task.wait() end
		end
	end
	print(("[WorldBuilder] terrain done: %d chunks in %.1fs"):format(built, os.clock() - t0))

	-- ---- roads ----
	local ROADS = {
${roadLua}
	}
	if #ROADS > 0 then
		local folder = workspace:FindFirstChild("Roads") or Instance.new("Folder")
		folder.Name = "Roads"; folder.Parent = workspace
		for _, road in ipairs(ROADS) do
			local p = road.p
			for k = 1, #p - 3, 2 do
				local x1, z1 = p[k], p[k + 1]
				local x2, z2 = p[k + 2], p[k + 3]
				local y1 = heightAt(x1, z1) + 0.4
				local y2 = heightAt(x2, z2) + 0.4
				local a = Vector3.new(x1, y1, z1)
				local b = Vector3.new(x2, y2, z2)
				local len = (b - a).Magnitude
				if len > 0.1 then
					local part = Instance.new("Part")
					part.Anchored = true
					part.Material = Enum.Material.Asphalt
					part.Color = Color3.fromRGB(58, 58, 64)
					part.TopSurface = Enum.SurfaceType.Smooth
					part.BottomSurface = Enum.SurfaceType.Smooth
					part.Size = Vector3.new(road.w, 0.4, len + road.w * 0.5)
					part.CFrame = CFrame.lookAt(a:Lerp(b, 0.5), b)
					part.Parent = folder
				end
			end
			task.wait()
		end
		print(("[WorldBuilder] roads done: %d ways"):format(#ROADS))
	end
end)
print("[WorldBuilder] building "..N.."x"..N.." terrain, 1 stud = 1 m …")
`;
    }
  };
})();
