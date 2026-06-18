/* =========================================================
   interiors.js — procedural building interiors for Map Drive
   ---------------------------------------------------------
   Walk up to ANY building on Earth, step through its one real
   doorway, and explore a generated interior — Project-Zomboid
   style, top-down.

   What decides the layout?  The building's REAL identity.
   ------------------------------------------------------------
   Every footprint we pull from OpenStreetMap carries tags that
   describe what the building actually is:
       building = house | apartments | hotel | office | retail …
       building:levels = 8
       shop = supermarket,  amenity = …,  name = "…"
   That tag set is the "street map" that tells the generator what
   to build, so a house becomes a house and an apartment block
   becomes a corridor lined with flats.

   Archetypes
   ------------------------------------------------------------
   • house      → a single home: BSP-split rooms (entrance, living
                  room, bedrooms, kitchen, bathroom …) sized to the
                  footprint.
   • apartments → enter into a HALLWAY. The block is split into N
                  sections along its long axis; the hallway runs
                  down the middle (units both sides) or along one
                  side (units opposite). Each section has a numbered
                  door — walk to it to enter that unit, which is its
                  own generated apartment of rooms. Step back out to
                  the hallway, or out of the hallway to the street.
   • hotel      → same hallway machinery, doors are "Room N".
   • office     → same hallway machinery, doors are "Office N".
   • shop       → one open retail floor with shelving + a counter.

   "Saved into a database"
   ------------------------------------------------------------
   Generation is fully DETERMINISTIC: every interior (and every
   unit inside it) is a pure function of the building's stable id
   (rounded centroid + size) plus the archetype. The same building
   — and the same flat within it — always generates identically,
   so it is effectively saved forever with zero storage. We also
   cache plans in memory and log visited ids to localStorage.

   Public API
   ------------------------------------------------------------
     Interiors.ensureEntry(building)
         Computes + caches the single doorway, size, stable id and
         archetype:  building._entry, _W, _H, _id, _kind, _info.
     Interiors.describe(building)   -> short human label for the map
     Interiors.openSession(building, userName)
         A live, nestable interior session:
           session.step(dt, input) -> { exited:Boolean }
           session.render(canvas)
           session.interact()      -> use the nearest door (E / T)
           session.title()         -> current room/scene label
   ========================================================= */
(function () {
  'use strict';

  // ---- constants (metres) ----------------------------------
  const EARTH      = 111320;
  const WALL_TH    = 0.16;
  const DOOR_W     = 1.15;
  const PLAYER_R   = 0.26;
  const MIN_ROOM   = 2.6;
  const SPLIT_STOP = 7.2;
  const MAX_DEPTH  = 6;
  const MIN_SIDE   = 4;
  const MAX_SIDE   = 170;
  const WALK = 1.7, RUN = 4.6, WACC = 12;

  /* =======================================================
     1 · DETERMINISTIC RANDOMNESS
     ======================================================= */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rng(seed) {
    const r = mulberry32(seed);
    return {
      f: r,
      range: (lo, hi) => lo + (hi - lo) * r(),
      int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * r()),
      pick: (arr) => arr[Math.floor(r() * arr.length) % arr.length],
      chance: (p) => r() < p,
    };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* =======================================================
     2 · GEOMETRY: identity, size, doorway, archetype
     ======================================================= */
  function centroid(pts) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].lng, yi = pts[i].lat, xj = pts[j].lng, yj = pts[j].lat;
      const f = xi * yj - xj * yi; a += f; cx += (xi + xj) * f; cy += (yi + yj) * f;
    }
    if (Math.abs(a) < 1e-12) {
      let sx = 0, sy = 0; for (const p of pts) { sx += p.lng; sy += p.lat; }
      return { lng: sx / pts.length, lat: sy / pts.length };
    }
    a *= 0.5;
    return { lng: cx / (6 * a), lat: cy / (6 * a) };
  }
  function metresPerLng(lat) { return EARTH * Math.cos((lat * Math.PI) / 180); }

  function chooseDoorEdge(pts, cen, mLng) {
    let best = null, bestScore = -1;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const ax = pts[j].lng, ay = pts[j].lat, bx = pts[i].lng, by = pts[i].lat;
      const dxm = (bx - ax) * mLng, dym = (by - ay) * EARTH;
      const len = Math.hypot(dxm, dym);
      if (len < 1.4) continue;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      let nx = dym, ny = -dxm; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const ox = (mx - cen.lng) * mLng, oy = (my - cen.lat) * EARTH;
      if (nx * ox + ny * oy < 0) { nx = -nx; ny = -ny; }
      const score = len + 0.001 * (i + 1);
      if (score > bestScore) { bestScore = score; best = { mx, my, nx, ny, len }; }
    }
    return best;
  }
  function snapToShell(dx, dy, W, H) {
    const cand = [
      { side: 'S', x: clamp(dx, DOOR_W, W - DOOR_W), y: 0, d: dy },
      { side: 'N', x: clamp(dx, DOOR_W, W - DOOR_W), y: H, d: H - dy },
      { side: 'W', x: 0, y: clamp(dy, DOOR_W, H - DOOR_W), d: dx },
      { side: 'E', x: W, y: clamp(dy, DOOR_W, H - DOOR_W), d: W - dx },
    ];
    cand.sort((a, b) => a.d - b.d);
    return cand[0];
  }

  /* ---- archetype from OSM tags + size ---- */
  function classify(tags, W, H) {
    const area = W * H;
    const bt = String(tags.building || '').toLowerCase();
    const levels = parseInt(tags['building:levels'], 10);
    const looksTall = isFinite(levels) ? levels >= 4 : area > 700;

    if (tags.shop || ['retail', 'commercial', 'supermarket', 'kiosk', 'mall', 'shop'].includes(bt))
      return 'shop';
    if (bt === 'hotel' || tags.tourism === 'hotel' || tags.tourism === 'motel') return 'hotel';
    if (bt === 'office' || tags.office) return 'office';
    if (['apartments', 'residential', 'dormitory', 'terrace'].includes(bt))
      return (bt === 'residential' && !looksTall && area < 380) ? 'house' : 'apartments';
    if (['house', 'detached', 'bungalow', 'cottage', 'semidetached_house', 'cabin', 'hut', 'farm'].includes(bt))
      return 'house';

    // no usable tag → fall back to footprint size
    if (area > 650 || looksTall) return 'apartments';
    return 'house';
  }
  function buildingTitle(kind, tags, rnd) {
    if (tags && tags.name) return String(tags.name).slice(0, 40);
    if (kind === 'apartments') return rnd.pick(['Apartment Block', 'Residences', 'Housing Block']);
    if (kind === 'hotel') return rnd.pick(['Hotel', 'Grand Hotel', 'Inn']);
    if (kind === 'office') return rnd.pick(['Office Building', 'Business Centre', 'Chambers']);
    if (kind === 'shop') return rnd.pick(['Corner Shop', 'Market', 'Department Store', 'Supermarket']);
    return rnd.pick(['House', 'Townhouse', 'Cottage', 'Residence']);
  }
  const KIND_ICON = { house: '🏠', apartments: '🏢', hotel: '🏨', office: '🏢', shop: '🏪' };

  function ensureEntry(b) {
    if (b._entry) return b._entry;
    const cen = centroid(b.pts);
    const mLng = metresPerLng(cen.lat);
    let W = clamp((b.maxLng - b.minLng) * mLng, MIN_SIDE, MAX_SIDE);
    let H = clamp((b.maxLat - b.minLat) * EARTH, MIN_SIDE, MAX_SIDE);
    const tags = b.tags || {};
    const kind = classify(tags, W, H);

    const id = 'b' + Math.round(cen.lat * 1e5) + '_' + Math.round(cen.lng * 1e5) +
               '_' + Math.round(W) + 'x' + Math.round(H) + '_' + kind;

    const edge = chooseDoorEdge(b.pts, cen, mLng);
    let lx, ly, nrmLat, nrmLng;
    if (edge) {
      lx = (edge.mx - b.minLng) * mLng; ly = (edge.my - b.minLat) * EARTH;
      nrmLat = edge.ny / EARTH; nrmLng = edge.nx / mLng;
    } else { lx = W / 2; ly = 0; nrmLat = -1 / EARTH; nrmLng = 0; }
    const shell = snapToShell(lx, ly, W, H);

    const eLat = b.minLat + shell.y / EARTH;
    const eLng = b.minLng + shell.x / mLng;

    b._id = id; b._W = W; b._H = H; b._kind = kind;
    b._info = { tags, title: null }; // title filled lazily in getRootPlan
    b._entry = {
      lat: eLat, lng: eLng, x: shell.x, y: shell.y, side: shell.side,
      out: { lat: nrmLat, lng: nrmLng },
    };
    return b._entry;
  }

  function describe(b) {
    ensureEntry(b);
    const name = b._info && b._info.tags && b._info.tags.name;
    return (KIND_ICON[b._kind] || '🏠') + ' ' + (name || prettyKind(b._kind));
  }
  function prettyKind(k) {
    return ({ house: 'House', apartments: 'Apartments', hotel: 'Hotel', office: 'Office', shop: 'Shop' })[k] || 'Building';
  }

  /* =======================================================
     3 · SHARED BUILD PRIMITIVES
     ======================================================= */
  function wallRect(x, y, w, h) { return { x, y, w: Math.max(w, 0), h: Math.max(h, 0) }; }

  function wallWithGap(vertical, fixed, a0, a1, gapAt, walls) {
    const g0 = gapAt, g1 = gapAt + DOOR_W, half = WALL_TH / 2;
    if (vertical) {
      if (g0 - a0 > 0.02) walls.push(wallRect(fixed - half, a0, WALL_TH, g0 - a0));
      if (a1 - g1 > 0.02) walls.push(wallRect(fixed - half, g1, WALL_TH, a1 - g1));
    } else {
      if (g0 - a0 > 0.02) walls.push(wallRect(a0, fixed - half, g0 - a0, WALL_TH));
      if (a1 - g1 > 0.02) walls.push(wallRect(g1, fixed - half, a1 - g1, WALL_TH));
    }
  }

  function perimeterWalls(W, H, entry, walls) {
    const half = WALL_TH / 2;
    add(false, 0, W, 0, entry && entry.side === 'S' ? entry.x : null);
    add(false, 0, W, H, entry && entry.side === 'N' ? entry.x : null);
    add(true, 0, H, 0, entry && entry.side === 'W' ? entry.y : null);
    add(true, 0, H, W, entry && entry.side === 'E' ? entry.y : null);
    function add(vertical, a0, a1, fixed, gapCenter) {
      if (gapCenter == null) {
        if (vertical) walls.push(wallRect(fixed - half, a0, WALL_TH, a1 - a0));
        else walls.push(wallRect(a0, fixed - half, a1 - a0, WALL_TH));
        return;
      }
      const g0 = clamp(gapCenter - DOOR_W / 2, a0 + 0.1, a1 - DOOR_W - 0.1);
      wallWithGap(vertical, fixed, a0, a1, g0, walls);
    }
  }

  function splitRegion(R, depth, rnd, walls, rooms) {
    const { x, y, w, h } = R;
    const canV = w >= 2 * MIN_ROOM + WALL_TH;
    const canH = h >= 2 * MIN_ROOM + WALL_TH;
    const small = w < SPLIT_STOP && h < SPLIT_STOP;
    if (depth >= MAX_DEPTH || (!canV && !canH) || (small && rnd.chance(0.55))) {
      rooms.push({ x, y, w, h, area: w * h }); return;
    }
    let vertical;
    if (canV && canH) vertical = (w > h) ? rnd.chance(0.8) : rnd.chance(0.2);
    else vertical = canV;
    if (vertical) {
      const lo = x + MIN_ROOM, hi = x + w - MIN_ROOM;
      const sx = clamp(rnd.range(lo + (hi - lo) * 0.3, lo + (hi - lo) * 0.7), lo, hi);
      const gl = y + 0.5, gh = y + h - 0.5 - DOOR_W;
      const gap = gh > gl ? rnd.range(gl, gh) : y + (h - DOOR_W) / 2;
      wallWithGap(true, sx, y, y + h, gap, walls);
      splitRegion({ x, y, w: sx - x, h }, depth + 1, rnd, walls, rooms);
      splitRegion({ x: sx, y, w: x + w - sx, h }, depth + 1, rnd, walls, rooms);
    } else {
      const lo = y + MIN_ROOM, hi = y + h - MIN_ROOM;
      const sy = clamp(rnd.range(lo + (hi - lo) * 0.3, lo + (hi - lo) * 0.7), lo, hi);
      const gl = x + 0.5, gh = x + w - 0.5 - DOOR_W;
      const gap = gh > gl ? rnd.range(gl, gh) : x + (w - DOOR_W) / 2;
      wallWithGap(false, sy, x, x + w, gap, walls);
      splitRegion({ x, y: sy, w, h: y + h - sy }, depth + 1, rnd, walls, rooms);
      splitRegion({ x, y, w, h: sy - y }, depth + 1, rnd, walls, rooms);
    }
  }

  /* ---- room typing + furniture ---- */
  const PALETTE = {
    Entrance: '#3b3026', 'Living Room': '#5a4632', Bedroom: '#4d3b2a',
    Kitchen: '#37414a', Bathroom: '#2f4750', Study: '#3c3a30',
    Storeroom: '#2d2a26', Hallway: '#2b2722', 'Shop floor': '#33302a',
    Office: '#36352f', generic: '#473a2c',
  };
  function floorColor(type) {
    if (!type) return PALETTE.generic;
    if (type.startsWith('Bedroom')) return PALETTE.Bedroom;
    if (type.startsWith('Office')) return PALETTE.Office;
    return PALETTE[type] || PALETTE.generic;
  }

  function typeRooms(rooms, entry, rnd) {
    if (!rooms.length) return;
    let entRoom = rooms[0], entBest = 1e9;
    for (const r of rooms) {
      const inside = entry.x >= r.x && entry.x <= r.x + r.w && entry.y >= r.y && entry.y <= r.y + r.h;
      const d = Math.hypot(r.x + r.w / 2 - entry.x, r.y + r.h / 2 - entry.y);
      const score = inside ? -1 : d;
      if (score < entBest) { entBest = score; entRoom = r; }
    }
    entRoom.type = 'Entrance';
    const rest = rooms.filter((r) => r !== entRoom).sort((a, b) => b.area - a.area);
    const done = new Set();
    if (rest[0]) { rest[0].type = 'Living Room'; done.add(rest[0]); }
    const small = rest.slice().sort((a, b) => a.area - b.area);
    for (const r of small) if (!done.has(r)) { r.type = 'Bathroom'; done.add(r); break; }
    for (const r of small) if (!done.has(r)) { r.type = 'Kitchen'; done.add(r); break; }
    let bed = 1;
    for (const r of rest) {
      if (done.has(r)) continue;
      r.type = r.area > 14 ? ('Bedroom ' + bed++) : (rnd.chance(0.5) ? 'Study' : 'Storeroom');
      done.add(r);
    }
  }

  function furnish(room, rnd, out) {
    const m = 0.45, ix = room.x + m, iy = room.y + m, iw = room.w - 2 * m, ih = room.h - 2 * m;
    if (iw < 0.8 || ih < 0.8) return;
    const cx = room.x + room.w / 2, cy = room.y + room.h / 2, t = room.type || 'Generic';
    const put = (x, y, w, h, kind, color, solid) => {
      if (w <= 0 || h <= 0) return;
      out.push({ x: clamp(x, ix, ix + iw - w), y: clamp(y, iy, iy + ih - h), w: Math.min(w, iw), h: Math.min(h, ih), kind, color, solid: solid !== false });
    };
    if (t === 'Living Room') {
      put(ix, iy, Math.min(2.2, iw), 0.85, 'sofa', '#7d5a3c', true);
      put(cx - 0.6, cy - 0.35, 1.2, 0.7, 'table', '#9b6b3a', true);
      put(ix, iy + ih - 0.5, Math.min(1.6, iw), 0.45, 'tv', '#15181c', true);
      if (iw > 2.4 && ih > 2.4) put(cx - 1.1, cy - 0.9, 2.2, 1.6, 'rug', '#6f4b6a', false);
    } else if (t.startsWith('Bedroom')) {
      put(ix, iy, Math.min(2.0, iw), Math.min(1.5, ih), 'bed', '#5b6f86', true);
      put(ix + Math.min(2.0, iw) + 0.1, iy, 0.5, 0.5, 'nightstand', '#7a5536', true);
      put(ix + iw - 0.6, iy + ih - 1.4, 0.6, 1.4, 'wardrobe', '#6a4a30', true);
    } else if (t === 'Kitchen') {
      put(ix, iy, iw, 0.6, 'counter', '#9aa3ac', true);
      put(ix, iy + 0.6, 0.6, Math.max(0, ih - 0.6), 'counter', '#9aa3ac', true);
      put(ix + 0.05, iy + 0.05, 0.5, 0.5, 'stove', '#3a3f45', true);
      if (iw > 2 && ih > 2) put(cx - 0.5, cy, 1.0, 1.0, 'island', '#7f8893', true);
    } else if (t === 'Bathroom') {
      put(ix, iy, 0.7, 0.7, 'toilet', '#dfe7ec', true);
      put(ix + iw - 1.0, iy, 1.0, 0.6, 'sink', '#cdd6dc', true);
      if (ih > 1.8) put(ix, iy + ih - 1.7, Math.min(1.7, iw), 0.8, 'tub', '#e7eef2', true);
    } else if (t === 'Study') {
      put(ix, iy, Math.min(1.6, iw), 0.7, 'desk', '#6a4a30', true);
      put(ix + iw - 0.5, iy, 0.5, Math.min(2.2, ih), 'shelf', '#5a3f2a', true);
    } else if (t === 'Storeroom') {
      put(ix, iy, 0.6, Math.min(2.5, ih), 'crates', '#5a4a34', true);
      put(ix + iw - 0.6, iy, 0.6, Math.min(2.5, ih), 'crates', '#5a4a34', true);
    } else if (t === 'Entrance') {
      put(ix, iy, 0.5, Math.min(1.4, ih), 'coatrack', '#4a3a2a', true);
    } else if (t.startsWith('Office')) {
      put(ix, iy, Math.min(1.6, iw), 0.7, 'desk', '#54585f', true);
      put(ix, iy + 0.75, 0.55, 0.55, 'chair', '#2c2f34', true);
      if (iw > 2.6) put(ix + iw - 1.6, iy, 1.6, 0.7, 'desk', '#54585f', true);
    }
  }

  function hitRects(x, y, rects, r) {
    for (const w of rects) if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) return true;
    return false;
  }

  function innerSpawn(entry, W, H, walls) {
    let dx = 0, dy = 0;
    if (entry.side === 'S') dy = 1.1; else if (entry.side === 'N') dy = -1.1;
    else if (entry.side === 'W') dx = 1.1; else dx = -1.1;
    let sx = clamp(entry.x + dx, 0.4, W - 0.4), sy = clamp(entry.y + dy, 0.4, H - 0.4);
    for (let i = 0; i < 24 && hitRects(sx, sy, walls, PLAYER_R); i++) {
      sx += (W / 2 - sx) * 0.12; sy += (H / 2 - sy) * 0.12;
    }
    return { x: sx, y: sy };
  }

  /* =======================================================
     4 · ARCHETYPE PLANS
     -------------------------------------------------------
     Each returns a plan:
       { kind, title, W, H, walls[], rooms[], furniture[],
         portals[], spawn{x,y} }
     A portal is a door the player can use:
       { kind:'exit'|'unit', x, y, label, door{…}, fp?, unitEntry? }
     ======================================================= */

  // ---- HOUSE / single dwelling ----
  function buildHouse(seed, W, H, entry, opts) {
    opts = opts || {};
    const rnd = rng(seed);
    const walls = [], rooms = [];
    perimeterWalls(W, H, entry, walls);
    splitRegion({ x: 0, y: 0, w: W, h: H }, 0, rnd, walls, rooms);
    typeRooms(rooms, entry, rnd);
    const furniture = [];
    for (const r of rooms) { r.color = floorColor(r.type); furnish(r, rnd, furniture); }
    const spawn = innerSpawn(entry, W, H, walls);
    const portals = [{ kind: 'exit', x: entry.x, y: entry.y, label: opts.exitLabel || 'EXIT' }];
    return { kind: 'house', W, H, walls, rooms, furniture, portals, spawn };
  }

  // ---- SHOP / open retail floor ----
  function buildShop(seed, W, H, entry) {
    const rnd = rng(seed);
    const walls = [], rooms = [], furniture = [];
    perimeterWalls(W, H, entry, walls);
    rooms.push({ x: 0, y: 0, w: W, h: H, type: 'Shop floor', color: floorColor('Shop floor') });
    // checkout counter beside the entrance
    const cnLen = Math.min(3.2, W * 0.4);
    if (entry.side === 'S' || entry.side === 'N') {
      const cy = entry.side === 'S' ? 1.4 : H - 2.0;
      furniture.push({ x: clamp(entry.x + 1.0, 0.5, W - cnLen - 0.5), y: cy, w: cnLen, h: 0.6, kind: 'counter', color: '#8a939c', solid: true });
    } else {
      const cx = entry.side === 'W' ? 1.4 : W - 2.0;
      furniture.push({ x: cx, y: clamp(entry.y + 1.0, 0.5, H - cnLen - 0.5), w: 0.6, h: cnLen, kind: 'counter', color: '#8a939c', solid: true });
    }
    // aisles of shelving along the long axis, with a margin from walls
    const horiz = W >= H;
    const span = horiz ? H : W, run = horiz ? W : H;
    const rows = clamp(Math.floor((span - 2.5) / 2.4), 1, 8);
    const gap = (span - 1.6) / (rows + 1);
    for (let i = 1; i <= rows; i++) {
      const t = 1.0 + i * gap;
      const segs = clamp(Math.floor((run - 2.4) / 1.6), 1, 12);
      const segLen = (run - 2.4) / segs;
      for (let s = 0; s < segs; s++) {
        if (rnd.chance(0.18)) continue; // a break in the aisle to walk through
        const u = 1.2 + s * segLen + 0.1;
        if (horiz) furniture.push({ x: u, y: t - 0.25, w: segLen - 0.4, h: 0.5, kind: 'shelf', color: '#6b5a3c', solid: true });
        else furniture.push({ x: t - 0.25, y: u, w: 0.5, h: segLen - 0.4, kind: 'shelf', color: '#6b5a3c', solid: true });
      }
    }
    const spawn = innerSpawn(entry, W, H, walls);
    const portals = [{ kind: 'exit', x: entry.x, y: entry.y, label: 'EXIT' }];
    return { kind: 'shop', W, H, walls, rooms, furniture, portals, spawn };
  }

  // ---- HALLWAY block (apartments / hotel / office) ----
  // Splits the footprint into sections along its long axis with a
  // corridor (central or side); each section is a numbered unit door.
  function buildHallway(seed, W, H, entry, kind) {
    const rnd = rng(seed);
    const walls = [], rooms = [], furniture = [], portals = [];
    const unitWord = kind === 'hotel' ? 'Room' : kind === 'office' ? 'Office' : 'Apt';

    const horiz = W >= H;                 // corridor runs along the longer axis
    const longLen = horiz ? W : H, shortLen = horiz ? H : W;
    const HW = clamp(shortLen * 0.26, 1.8, 3.0);          // corridor width
    const unitDepthMin = 3.0;
    const twoSided = shortLen >= 2 * unitDepthMin + HW;

    // corridor band position along the short axis
    let c0; // corridor start on short axis
    if (twoSided) c0 = (shortLen - HW) / 2;
    else {
      // single-sided: hug the side nearer the façade door
      const near = horiz ? entry.y : entry.x;
      c0 = (near > shortLen / 2) ? (shortLen - HW) : 0;
    }
    const c1 = c0 + HW;

    // perimeter (solid all round; the street door is just a portal trigger)
    perimeterWalls(W, H, null, walls);

    // helper to convert (along, cross) → (x,y) for the chosen orientation
    const XY = (along, cross) => horiz ? { x: along, y: cross } : { x: cross, y: along };

    // corridor floor room
    const corr = horiz
      ? { x: 0, y: c0, w: W, h: HW }
      : { x: c0, y: 0, w: HW, h: H };
    corr.type = 'Hallway'; corr.color = floorColor('Hallway');
    rooms.push(corr);

    // sections along the long axis
    const K = clamp(Math.round(longLen / 5.5), 2, 12);
    const secLen = longLen / K;

    // which sides hold units
    const sides = twoSided ? ['low', 'high'] : [(c0 === 0) ? 'high' : 'low'];
    // 'low'  band: cross in [0, c0]      (below/left of corridor)
    // 'high' band: cross in [c1, shortLen](above/right of corridor)

    let unitIdx = 0;
    for (const side of sides) {
      const bandDepth = side === 'low' ? c0 : (shortLen - c1);
      if (bandDepth < 2.0) continue;
      const crossBase = side === 'low' ? 0 : c1;           // band start on short axis
      const doorCross = side === 'low' ? c0 : c1;          // wall line touching corridor
      for (let i = 0; i < K; i++) {
        const a0 = i * secLen, a1 = (i + 1) * secLen;
        // closed unit block (visual room behind the door)
        const blk = horiz
          ? { x: a0, y: crossBase, w: secLen, h: bandDepth }
          : { x: crossBase, y: a0, w: bandDepth, h: secLen };
        blk.type = unitWord + ' ' + (unitIdx + 1); blk.closed = true; blk.color = '#1c1813';
        rooms.push(blk);

        // door centre on the corridor-facing wall
        const along = a0 + secLen / 2;
        const doorPt = XY(along, doorCross);
        // portal sits a touch INSIDE the corridor so you must approach it.
        // low band is below/left of the corridor → corridor is on the +side;
        // high band is above/right → corridor is on the -side.
        const inset = side === 'low' ? 0.45 : -0.45;
        const portalPt = XY(along, doorCross + inset);

        // unit-local entry: the door is on the side facing the corridor
        const uW = horiz ? secLen : bandDepth;
        const uH = horiz ? bandDepth : secLen;
        let uEntry;
        if (horiz) uEntry = { side: side === 'low' ? 'N' : 'S', x: uW / 2, y: side === 'low' ? uH : 0 };
        else uEntry = { side: side === 'low' ? 'E' : 'W', x: side === 'low' ? uW : 0, y: uH / 2 };

        portals.push({
          kind: 'unit', unitIndex: unitIdx, label: unitWord + ' ' + (unitIdx + 1),
          x: portalPt.x, y: portalPt.y,
          door: { x: doorPt.x, y: doorPt.y, horiz: horiz }, // door bar spans along the corridor wall
          fp: { w: uW, h: uH }, unitEntry: uEntry,
        });
        unitIdx++;
      }
    }

    // corridor boundary walls — CONTINUOUS (each unit is its own scene,
    // so the block stays sealed; the door is a teleport trigger drawn on
    // the wall, not a physical gap). This keeps you safely in the corridor.
    const half = WALL_TH / 2;
    for (const side of sides) {
      const line = side === 'low' ? c0 : c1;
      if (horiz) walls.push(wallRect(0, line - half, longLen, WALL_TH));
      else walls.push(wallRect(line - half, 0, WALL_TH, longLen));
    }

    // street exit portal: nearest corridor end to the façade door
    const alongEntry = horiz ? entry.x : entry.y;
    const exitAlong = (alongEntry < longLen / 2) ? 0.6 : longLen - 0.6;
    const exitPt = XY(exitAlong, c0 + HW / 2);
    portals.unshift({ kind: 'exit', x: exitPt.x, y: exitPt.y, label: 'EXIT' });

    // a runner rug + plant to dress the corridor
    const rugPt = XY(longLen / 2, c0 + HW / 2);
    if (horiz) furniture.push({ x: 0.8, y: rugPt.y - 0.5, w: W - 1.6, h: 1.0, kind: 'rug', color: '#5a3f55', solid: false });
    else furniture.push({ x: rugPt.x - 0.5, y: 0.8, w: 1.0, h: H - 1.6, kind: 'rug', color: '#5a3f55', solid: false });

    // spawn just inside the street door
    const spawnAlong = (alongEntry < longLen / 2) ? exitAlong + 1.2 : exitAlong - 1.2;
    const sp = XY(clamp(spawnAlong, 0.6, longLen - 0.6), c0 + HW / 2);

    return { kind, W, H, walls, rooms, furniture, portals, spawn: { x: sp.x, y: sp.y } };
  }

  /* =======================================================
     5 · PLAN CACHE  ("the database")
     ======================================================= */
  const PLAN_CACHE = new Map();
  function logVisit(id) {
    try {
      const seen = JSON.parse(localStorage.getItem('yesp-mg-interiors') || '{}');
      if (!seen[id]) { seen[id] = Date.now(); localStorage.setItem('yesp-mg-interiors', JSON.stringify(seen)); }
    } catch (e) {}
  }

  function getRootPlan(b) {
    ensureEntry(b);
    if (PLAN_CACHE.has(b._id)) return PLAN_CACHE.get(b._id);
    const seed = hashStr(b._id);
    const rnd = rng(seed ^ 0x9e3779b9);
    const title = buildingTitle(b._kind, b._info.tags, rnd);
    let plan;
    if (b._kind === 'shop') plan = buildShop(seed, b._W, b._H, b._entry);
    else if (b._kind === 'apartments' || b._kind === 'hotel' || b._kind === 'office')
      plan = buildHallway(seed, b._W, b._H, b._entry, b._kind);
    else plan = buildHouse(seed, b._W, b._H, b._entry);
    plan.title = title;
    PLAN_CACHE.set(b._id, plan);
    logVisit(b._id);
    return plan;
  }

  // a unit (flat / hotel room / office) inside a hallway block
  function getUnitPlan(b, portal) {
    const key = b._id + '#u' + portal.unitIndex;
    if (PLAN_CACHE.has(key)) return PLAN_CACHE.get(key);
    const seed = hashStr(key);
    const W = clamp(portal.fp.w, MIN_SIDE, MAX_SIDE);
    const H = clamp(portal.fp.h, MIN_SIDE, MAX_SIDE);
    // remap the unit entry onto the clamped shell
    const e = portal.unitEntry;
    const entry = {
      side: e.side,
      x: clamp(e.x * (W / portal.fp.w), DOOR_W, W - DOOR_W),
      y: clamp(e.y * (H / portal.fp.h), DOOR_W, H - DOOR_W),
    };
    if (e.side === 'S') entry.y = 0; else if (e.side === 'N') entry.y = H;
    else if (e.side === 'W') entry.x = 0; else entry.x = W;
    const plan = buildHouse(seed, W, H, entry, { exitLabel: 'EXIT' });
    plan.title = portal.label;
    PLAN_CACHE.set(key, plan);
    logVisit(key);
    return plan;
  }

  /* =======================================================
     6 · LIVE SESSION (nestable scene stack)
     ======================================================= */
  function openSession(b, userName) {
    const user = userName || 'you';
    const scenes = [];
    let exited = false;

    function makeScene(plan, fromPortal) {
      const solids = plan.walls.concat(plan.furniture.filter((f) => f.solid));
      return {
        plan, solids, fromPortal,
        px: plan.spawn.x, py: plan.spawn.y, vx: 0, vy: 0, heading: 180,
        // don't retrigger the door you just arrived through until you step off it
        cooldown: nearestPortal(plan, plan.spawn.x, plan.spawn.y),
      };
    }
    function cur() { return scenes[scenes.length - 1]; }
    function nearestPortal(plan, x, y) {
      let best = null, bd = 1e9;
      for (const p of plan.portals) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
      return (bd < 1.8) ? best : null;
    }

    // root scene
    scenes.push(makeScene(getRootPlan(b), null));

    function activate(p) {
      const s = cur();
      if (p.kind === 'unit') {
        const child = makeScene(getUnitPlan(b, p), p);
        scenes.push(child);
      } else { // exit
        if (scenes.length === 1) { exited = true; }
        else { const leaving = scenes.pop(); cur().cooldown = leaving.fromPortal; }
      }
    }

    function move(dt, input) {
      const s = cur();
      const keys = input.keys || {}, joy = input.joy || { active: false, x: 0, y: 0 };
      let dE = 0, dN = 0;
      if (joy.active) { dE = joy.x; dN = joy.y; }
      else {
        if (keys['w'] || keys['arrowup']) dN += 1;
        if (keys['s'] || keys['arrowdown']) dN -= 1;
        if (keys['a'] || keys['arrowleft']) dE -= 1;
        if (keys['d'] || keys['arrowright']) dE += 1;
      }
      const mag = Math.hypot(dE, dN);
      let want = joy.active ? WALK + (RUN - WALK) * Math.max(0, (mag - 0.6) / 0.4) : (keys['shift'] ? RUN : WALK);
      let tvx = 0, tvy = 0;
      if (mag > 1e-6) { tvx = (dE / mag) * want; tvy = (dN / mag) * want; }
      s.vx += (tvx - s.vx) * Math.min(1, WACC * dt);
      s.vy += (tvy - s.vy) * Math.min(1, WACC * dt);
      if (Math.hypot(s.vx, s.vy) > 0.05) s.heading = (Math.atan2(s.vx, s.vy) * 180) / Math.PI;
      const hit = (x, y) => hitRects(x, y, s.solids, PLAYER_R);
      let nx = s.px + s.vx * dt; if (!hit(nx, s.py)) s.px = nx; else s.vx = 0;
      let ny = s.py + s.vy * dt; if (!hit(s.px, ny)) s.py = ny; else s.vy = 0;
      s.px = clamp(s.px, PLAYER_R, s.plan.W - PLAYER_R);
      s.py = clamp(s.py, PLAYER_R, s.plan.H - PLAYER_R);
      // clear the arrival cooldown once we've stepped away from that door
      if (s.cooldown && Math.hypot(s.px - s.cooldown.x, s.py - s.cooldown.y) > 1.7) s.cooldown = null;
    }

    function step(dt, input) {
      if (exited) return { exited: true };
      move(dt, input);
      // auto-use a door you walk onto (tight radius so it's deliberate)
      const s = cur();
      if (!s.cooldown) {
        for (const p of s.plan.portals) {
          if (Math.hypot(p.x - s.px, p.y - s.py) < 0.95) { activate(p); break; }
        }
      }
      return { exited };
    }

    // E / T — use the nearest door within reach
    function interact() {
      if (exited) return;
      const s = cur();
      if (s.cooldown) return;
      let best = null, bd = 1.7;
      for (const p of s.plan.portals) { const d = Math.hypot(p.x - s.px, p.y - s.py); if (d < bd) { bd = d; best = p; } }
      if (best) activate(best);
    }

    function title() {
      const s = cur();
      return s.plan.title || '';
    }

    /* ---- render the current scene ---- */
    function render(canvas) {
      const s = cur();
      const plan = s.plan;
      const ctx = canvas.getContext('2d');
      const dpr = canvas._dpr || 1;
      const vw = canvas.width / dpr, vh = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const PXM = clamp(Math.min(vw, vh) / 13, 16, 34);
      const camX = s.px, camY = s.py;
      const toX = (mx) => (mx - camX) * PXM + vw / 2;
      const toY = (my) => vh / 2 - (my - camY) * PXM;

      ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = '#16130f';
      ctx.fillRect(toX(0) - 6, toY(plan.H) - 6, plan.W * PXM + 12, plan.H * PXM + 12);

      // floors
      for (const r of plan.rooms) {
        if (r.closed) {
          ctx.fillStyle = r.color || '#1c1813';
          ctx.fillRect(toX(r.x), toY(r.y + r.h), r.w * PXM, r.h * PXM);
          continue;
        }
        ctx.fillStyle = r.color || PALETTE.generic;
        ctx.fillRect(toX(r.x), toY(r.y + r.h), r.w * PXM, r.h * PXM);
        ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
        const stp = (r.type === 'Kitchen' || r.type === 'Bathroom') ? 0.6 : 0.9;
        for (let gx = r.x; gx < r.x + r.w; gx += stp) {
          ctx.beginPath(); ctx.moveTo(toX(gx), toY(r.y)); ctx.lineTo(toX(gx), toY(r.y + r.h)); ctx.stroke();
        }
      }

      // room / unit labels
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fam = (getComputedStyle(document.body).fontFamily || 'sans-serif');
      ctx.font = '600 11px ' + fam;
      for (const r of plan.rooms) {
        if (!r.type) continue;
        ctx.fillStyle = r.closed ? 'rgba(220,225,230,0.5)' : 'rgba(255,255,255,0.32)';
        ctx.fillText(r.type, toX(r.x + r.w / 2), toY(r.y + r.h / 2));
      }

      // furniture
      for (const f of plan.furniture) {
        if (f.kind === 'rug') {
          ctx.globalAlpha = 0.5; ctx.fillStyle = f.color;
          ctx.fillRect(toX(f.x), toY(f.y + f.h), f.w * PXM, f.h * PXM); ctx.globalAlpha = 1; continue;
        }
        ctx.fillStyle = f.color;
        ctx.fillRect(toX(f.x), toY(f.y + f.h), f.w * PXM, f.h * PXM);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.strokeRect(toX(f.x), toY(f.y + f.h), f.w * PXM, f.h * PXM);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(toX(f.x), toY(f.y + f.h), f.w * PXM, Math.min(4, f.h * PXM * 0.3));
      }

      // walls
      ctx.fillStyle = '#cdd2d8';
      for (const wl of plan.walls) ctx.fillRect(toX(wl.x), toY(wl.y + wl.h), Math.max(2, wl.w * PXM), Math.max(2, wl.h * PXM));
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
      for (const wl of plan.walls) ctx.strokeRect(toX(wl.x), toY(wl.y + wl.h), Math.max(2, wl.w * PXM), Math.max(2, wl.h * PXM));

      // portals: unit doors then the green exit
      let nearest = null, nd = 3.2;
      for (const p of plan.portals) { const d = Math.hypot(p.x - s.px, p.y - s.py); if (d < nd) { nd = d; nearest = p; } }
      for (const p of plan.portals) {
        if (p.kind === 'unit') {
          const d = p.door, w = d.horiz ? DOOR_W : 0.22, h = d.horiz ? 0.22 : DOOR_W;
          const hot = (p === nearest);
          ctx.save();
          if (hot) { ctx.shadowColor = '#ffd36b'; ctx.shadowBlur = 14; }
          ctx.fillStyle = hot ? '#ffce7a' : '#caa46a';
          ctx.fillRect(toX(d.x - w / 2), toY(d.y + h / 2), w * PXM, h * PXM);
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '700 10px ' + fam;
          ctx.fillText(p.label, toX(p.x), toY(p.y) + (p.y > s.py ? -10 : 14));
        }
      }
      for (const p of plan.portals) {
        if (p.kind !== 'exit') continue;
        const ex = toX(p.x), ey = toY(p.y);
        ctx.save(); ctx.shadowColor = '#7fe0a0'; ctx.shadowBlur = 18;
        ctx.fillStyle = 'rgba(127,224,160,0.85)';
        ctx.beginPath(); ctx.arc(ex, ey, Math.max(7, DOOR_W * PXM * 0.5), 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#0a0c10'; ctx.font = '700 12px ' + fam; ctx.fillText('EXIT', ex, ey);
      }

      // player
      const pxX = vw / 2, pxY = vh / 2;
      ctx.save(); ctx.translate(pxX, pxY); ctx.rotate((s.heading * Math.PI) / 180);
      ctx.fillStyle = '#4aa3f0'; ctx.strokeStyle = '#14202e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER_R * PXM + 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(0, -(PLAYER_R * PXM + 1), 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '700 12px ' + fam; ctx.textAlign = 'center';
      ctx.fillText(user, pxX, pxY - (PLAYER_R * PXM + 16));

      // a hint when a unit door is within reach
      if (nearest && nearest.kind === 'unit' && nd < 1.7) {
        ctx.fillStyle = 'rgba(255,211,107,0.95)'; ctx.font = '700 13px ' + fam;
        ctx.fillText('Enter ' + nearest.label, pxX, pxY + (PLAYER_R * PXM + 26));
      }

      // vignette
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }

    return { step, render, interact, title, depth: () => scenes.length };
  }

  window.Interiors = { ensureEntry, describe, openSession, getRootPlan };
})();
