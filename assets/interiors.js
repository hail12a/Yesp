/* =========================================================
   interiors.js — procedural building interiors for Map Drive
   ---------------------------------------------------------
   Project-Zomboid-style instanced interiors. Every building on
   Earth that the game has a collision footprint for can be
   entered through ONE realistic doorway. Stepping inside opens
   a generated top-down floor-plan you can walk around; stepping
   back out through the door returns you to the satellite world.

   Design goals
   ------------
   • DETERMINISTIC. An interior is a pure function of the
     building's identity (rounded centroid) + its footprint size.
     The same building always generates the exact same interior,
     so it never needs to be stored or re-rendered "freshly" —
     it is effectively saved forever. We additionally cache the
     generated plan object in memory (and the building's stable
     id in localStorage) so re-entry is instant.
   • SELF-CONTAINED. This file exposes a tiny API on
     window.Interiors and owns all generation, layout, furniture,
     collision and rendering. mapgame.js only orchestrates
     enter/exit and feeds it input each frame.
   • ROBUST. Pure geometry, no external calls, defensive clamps
     everywhere so a weird footprint can never throw mid-frame.

   Public API
   ----------
     Interiors.ensureEntry(building)
         Computes + caches the single doorway for a footprint:
         building._id, building._entry { lat,lng, x,y, nrm:{lat,lng} },
         building._W, building._H (interior size in metres).
         Safe to call every load; it is memoised per building.

     Interiors.getPlan(building)
         Returns the deterministic floor-plan for a building
         (generating + caching it on first use).

     Interiors.openSession(building, userName)
         Returns a live interior session:
           session.plan
           session.step(dt, input)   -> { exited:Boolean }
           session.render(canvas)
           session.pos()             -> { x, y }   (metres, local)
         `input` is { keys:{}, joy:{active,x,y} } shared with the
         outdoor walker so controls feel identical.
   ========================================================= */
(function () {
  'use strict';

  // ---- constants (metres) ----------------------------------
  const EARTH       = 111320;       // metres per degree latitude
  const WALL_TH     = 0.16;         // interior wall thickness
  const DOOR_W      = 1.15;         // doorway opening width
  const PLAYER_R    = 0.26;         // player collision radius
  const MIN_ROOM    = 2.6;          // smallest allowed room side
  const SPLIT_STOP  = 7.2;          // below this a region usually stops splitting
  const MAX_DEPTH   = 6;            // BSP recursion cap
  const MAX_SIDE    = 110;          // clamp monstrous footprints
  const MIN_SIDE    = 4;            // clamp slivers up to something walkable

  // walk feel — mirrors the outdoor walker so it reads the same
  const WALK = 1.7, RUN = 4.6, WACC = 12;

  /* =======================================================
     1 · DETERMINISTIC RANDOMNESS
     ======================================================= */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
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
  // a small bundle of seeded helpers
  function rng(seed) {
    const r = mulberry32(seed);
    return {
      f: r,                                   // [0,1)
      range: (lo, hi) => lo + (hi - lo) * r(), // float in [lo,hi)
      int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * r()),
      pick: (arr) => arr[Math.floor(r() * arr.length) % arr.length],
      chance: (p) => r() < p,
    };
  }

  /* =======================================================
     2 · BUILDING IDENTITY + DOORWAY
     -------------------------------------------------------
     The footprint comes from mapgame's Overpass loader as
       { minLat, maxLat, minLng, maxLng, pts:[{lat,lng}…] }
     We treat the interior as the axis-aligned bounding box of
     that footprint (north-up), sized in metres. The doorway is
     placed on the perimeter facing the street — approximated,
     with no road data, as the midpoint of the LONGEST façade
     (front doors overwhelmingly sit on the longest street-facing
     wall), then snapped to the nearest bounding-box edge so it
     lines up with the rectangular interior shell.
     ======================================================= */
  function centroid(pts) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].lng, yi = pts[i].lat, xj = pts[j].lng, yj = pts[j].lat;
      const f = xi * yj - xj * yi;
      a += f; cx += (xi + xj) * f; cy += (yi + yj) * f;
    }
    if (Math.abs(a) < 1e-12) { // degenerate — fall back to vertex mean
      let sx = 0, sy = 0;
      for (const p of pts) { sx += p.lng; sy += p.lat; }
      return { lng: sx / pts.length, lat: sy / pts.length };
    }
    a *= 0.5;
    return { lng: cx / (6 * a), lat: cy / (6 * a) };
  }

  function metresPerLng(lat) { return EARTH * Math.cos((lat * Math.PI) / 180); }

  // Choose the façade (polygon edge) most likely to hold the door.
  function chooseDoorEdge(pts, cen, mLng) {
    let best = null, bestScore = -1;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const ax = pts[j].lng, ay = pts[j].lat, bx = pts[i].lng, by = pts[i].lat;
      const dxm = (bx - ax) * mLng, dym = (by - ay) * EARTH;
      const len = Math.hypot(dxm, dym);
      if (len < 1.4) continue; // too short to be a façade
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      // outward normal (rotate edge by -90°) in metres
      let nx = dym, ny = -dxm;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      // make sure it points AWAY from the centroid (outward)
      const ox = (mx - cen.lng) * mLng, oy = (my - cen.lat) * EARTH;
      if (nx * ox + ny * oy < 0) { nx = -nx; ny = -ny; }
      // prefer long edges; mild deterministic tie-break by orientation
      const score = len + 0.001 * (i + 1);
      if (score > bestScore) {
        bestScore = score;
        best = { mx, my, nx, ny, len };
      }
    }
    return best;
  }

  // Snap a door point to the nearest edge of the [0..W]x[0..H] shell.
  function snapToShell(dx, dy, W, H) {
    const cand = [
      { side: 'S', x: clamp(dx, DOOR_W, W - DOOR_W), y: 0,  d: dy },
      { side: 'N', x: clamp(dx, DOOR_W, W - DOOR_W), y: H,  d: H - dy },
      { side: 'W', x: 0, y: clamp(dy, DOOR_W, H - DOOR_W),  d: dx },
      { side: 'E', x: W, y: clamp(dy, DOOR_W, H - DOOR_W),  d: W - dx },
    ];
    cand.sort((a, b) => a.d - b.d);
    return cand[0];
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function ensureEntry(b) {
    if (b._entry) return b._entry;
    const cen = centroid(b.pts);
    const mLng = metresPerLng(cen.lat);

    // interior size = footprint bbox in metres, clamped to sane bounds
    let W = (b.maxLng - b.minLng) * mLng;
    let H = (b.maxLat - b.minLat) * EARTH;
    W = clamp(W, MIN_SIDE, MAX_SIDE);
    H = clamp(H, MIN_SIDE, MAX_SIDE);

    // stable id from centroid rounded to ~1 metre, plus rounded size
    const id = 'b' + Math.round(cen.lat * 1e5) + '_' + Math.round(cen.lng * 1e5) +
               '_' + Math.round(W) + 'x' + Math.round(H);

    // door point on the chosen façade, expressed in local metres
    const edge = chooseDoorEdge(b.pts, cen, mLng);
    let lx, ly, nrmLat, nrmLng;
    if (edge) {
      lx = (edge.mx - b.minLng) * mLng;
      ly = (edge.my - b.minLat) * EARTH;
      nrmLat = edge.ny / EARTH;           // outward normal back in degrees
      nrmLng = edge.nx / mLng;
    } else {
      lx = W / 2; ly = 0; nrmLat = -1 / EARTH; nrmLng = 0;
    }
    const shell = snapToShell(lx, ly, W, H);

    // doorway centre in real coordinates (for the map highlight)
    const eLat = b.minLat + shell.y / EARTH;
    const eLng = b.minLng + shell.x / mLng;

    // a normalized outward direction so we can pop the player just
    // outside when they leave (≈3 m clear of the wall)
    let onLat = nrmLat, onLng = nrmLng;
    const onl = Math.hypot(onLat * EARTH, onLng * mLng) || 1;
    onLat = (onLat * EARTH / onl) / EARTH;
    onLng = (onLng * mLng / onl) / mLng;

    b._id = id;
    b._W = W; b._H = H;
    b._entry = {
      lat: eLat, lng: eLng,
      x: shell.x, y: shell.y, side: shell.side,
      out: { lat: onLat, lng: onLng },
    };
    return b._entry;
  }

  /* =======================================================
     3 · FLOOR-PLAN GENERATION (binary space partitioning)
     -------------------------------------------------------
     Recursively split the rectangular shell into rooms. Every
     split line becomes an interior wall with exactly one door
     gap, which guarantees the whole plan is a connected tree of
     rooms (you can always reach the exit). Rooms are then typed
     by size/position and furnished.
     ======================================================= */

  // wall is an axis-aligned solid rectangle {x,y,w,h}
  function wallRect(x, y, w, h) { return { x, y, w: Math.max(w, 0), h: Math.max(h, 0) }; }

  // Build a wall along a line, leaving a door gap, as up to 2 rects.
  function wallWithGap(vertical, fixed, a0, a1, gapAt, walls) {
    const g0 = gapAt, g1 = gapAt + DOOR_W;
    const half = WALL_TH / 2;
    if (vertical) {
      // wall runs in y from a0..a1 at x = fixed
      if (g0 - a0 > 0.02) walls.push(wallRect(fixed - half, a0, WALL_TH, g0 - a0));
      if (a1 - g1 > 0.02) walls.push(wallRect(fixed - half, g1, WALL_TH, a1 - g1));
    } else {
      // wall runs in x from a0..a1 at y = fixed
      if (g0 - a0 > 0.02) walls.push(wallRect(a0, fixed - half, g0 - a0, WALL_TH));
      if (a1 - g1 > 0.02) walls.push(wallRect(g1, fixed - half, a1 - g1, WALL_TH));
    }
  }

  function splitRegion(R, depth, rnd, walls, rooms) {
    const { x, y, w, h } = R;
    const canV = w >= 2 * MIN_ROOM + WALL_TH;
    const canH = h >= 2 * MIN_ROOM + WALL_TH;
    const small = w < SPLIT_STOP && h < SPLIT_STOP;

    // stop conditions → this region becomes a leaf room
    const stopRoll = small && rnd.chance(0.55);
    if (depth >= MAX_DEPTH || (!canV && !canH) || stopRoll) {
      rooms.push({ x, y, w, h, area: w * h });
      return;
    }

    // choose orientation: split across the longer dimension, jittered
    let vertical;
    if (canV && canH) vertical = (w > h) ? rnd.chance(0.8) : rnd.chance(0.2);
    else vertical = canV;

    if (vertical) {
      const lo = x + MIN_ROOM, hi = x + w - MIN_ROOM;
      const sx = clamp(rnd.range(lo + (hi - lo) * 0.3, lo + (hi - lo) * 0.7), lo, hi);
      const gapLo = y + 0.5, gapHi = y + h - 0.5 - DOOR_W;
      const gap = gapHi > gapLo ? rnd.range(gapLo, gapHi) : y + (h - DOOR_W) / 2;
      wallWithGap(true, sx, y, y + h, gap, walls);
      splitRegion({ x, y, w: sx - x, h }, depth + 1, rnd, walls, rooms);
      splitRegion({ x: sx, y, w: x + w - sx, h }, depth + 1, rnd, walls, rooms);
    } else {
      const lo = y + MIN_ROOM, hi = y + h - MIN_ROOM;
      const sy = clamp(rnd.range(lo + (hi - lo) * 0.3, lo + (hi - lo) * 0.7), lo, hi);
      const gapLo = x + 0.5, gapHi = x + w - 0.5 - DOOR_W;
      const gap = gapHi > gapLo ? rnd.range(gapLo, gapHi) : x + (w - DOOR_W) / 2;
      wallWithGap(false, sy, x, x + w, gap, walls);
      splitRegion({ x, y, w, h: y + h - sy }, depth + 1, rnd, walls, rooms);
      splitRegion({ x, y: sy, w, h: sy - y }, depth + 1, rnd, walls, rooms);
    }
  }

  // perimeter walls with a gap at the entry door
  function perimeterWalls(W, H, entry, walls) {
    const half = WALL_TH / 2;
    const side = entry.side, gx = entry.x, gy = entry.y;
    // South (y=0) and North (y=H)
    addEdge(false, 0, W, 0, side === 'S' ? gx : null);
    addEdge(false, 0, W, H, side === 'N' ? gx : null);
    // West (x=0) and East (x=W)
    addEdge(true, 0, H, 0, side === 'W' ? gy : null);
    addEdge(true, 0, H, W, side === 'E' ? gy : null);

    function addEdge(vertical, a0, a1, fixed, gapCenter) {
      if (gapCenter == null) {
        if (vertical) walls.push(wallRect(fixed - half, a0, WALL_TH, a1 - a0));
        else walls.push(wallRect(a0, fixed - half, a1 - a0, WALL_TH));
        return;
      }
      const g0 = clamp(gapCenter - DOOR_W / 2, a0 + 0.1, a1 - DOOR_W - 0.1);
      wallWithGap(vertical, fixed, a0, a1, g0, walls);
    }
  }

  /* ---- room typing + naming ---- */
  const HOUSE_TYPES = ['House', 'Townhouse', 'Cottage', 'Residence'];
  const BIG_TYPES   = ['Apartment Block', 'Office Building', 'Hotel', 'Department Store'];

  function classifyBuilding(W, H, rnd) {
    const area = W * H;
    if (area > 900) return rnd.pick(BIG_TYPES);
    return rnd.pick(HOUSE_TYPES);
  }

  function typeRooms(rooms, entry, rnd) {
    if (!rooms.length) return;
    // entrance = room containing the door point
    let entRoom = rooms[0], entBest = 1e9;
    for (const r of rooms) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const d = Math.hypot(cx - entry.x, cy - entry.y);
      const inside = entry.x >= r.x && entry.x <= r.x + r.w && entry.y >= r.y && entry.y <= r.y + r.h;
      const score = inside ? -1 : d;
      if (score < entBest) { entBest = score; entRoom = r; }
    }
    entRoom.type = 'Entrance';

    const rest = rooms.filter((r) => r !== entRoom).sort((a, b) => b.area - a.area);
    const assigned = new Set();
    if (rest[0]) { rest[0].type = 'Living Room'; assigned.add(rest[0]); }
    // smallest → bathroom
    const bySmall = rest.slice().sort((a, b) => a.area - b.area);
    for (const r of bySmall) { if (!assigned.has(r)) { r.type = 'Bathroom'; assigned.add(r); break; } }
    // next smallest → kitchen
    for (const r of bySmall) { if (!assigned.has(r)) { r.type = 'Kitchen'; assigned.add(r); break; } }
    // remaining → bedrooms / generic rooms
    let bed = 1;
    for (const r of rest) {
      if (assigned.has(r)) continue;
      r.type = r.area > 14 ? ('Bedroom ' + bed++) : (rnd.chance(0.5) ? 'Study' : 'Storeroom');
      assigned.add(r);
    }
  }

  /* ---- furniture ----
     Furniture rects are local metres { x,y,w,h, kind, color, solid }.
     Solid pieces block the player; rugs/mats do not. Everything is
     clamped to sit inside the room with a wall margin. */
  const PALETTE = {
    floorEntrance: '#3b3026', floorLiving: '#5a4632', floorBedroom: '#4d3b2a',
    floorKitchen: '#37414a', floorBathroom: '#2f4750', floorStudy: '#3c3a30',
    floorStore: '#2d2a26', floorGeneric: '#473a2c',
  };
  function floorColor(type) {
    if (!type) return PALETTE.floorGeneric;
    if (type === 'Entrance') return PALETTE.floorEntrance;
    if (type === 'Living Room') return PALETTE.floorLiving;
    if (type.startsWith('Bedroom')) return PALETTE.floorBedroom;
    if (type === 'Kitchen') return PALETTE.floorKitchen;
    if (type === 'Bathroom') return PALETTE.floorBathroom;
    if (type === 'Study') return PALETTE.floorStudy;
    if (type === 'Storeroom') return PALETTE.floorStore;
    return PALETTE.floorGeneric;
  }

  function furnish(room, rnd, out) {
    const m = 0.45;                       // margin from walls
    const ix = room.x + m, iy = room.y + m;
    const iw = room.w - 2 * m, ih = room.h - 2 * m;
    if (iw < 0.8 || ih < 0.8) return;     // too tight to furnish
    const put = (x, y, w, h, kind, color, solid) => {
      if (w <= 0 || h <= 0) return;
      out.push({
        x: clamp(x, ix, ix + iw - w), y: clamp(y, iy, iy + ih - h),
        w: Math.min(w, iw), h: Math.min(h, ih), kind, color, solid: solid !== false,
      });
    };
    const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
    const t = room.type || 'Generic';

    if (t === 'Living Room') {
      put(ix, iy, Math.min(2.2, iw), 0.85, 'sofa', '#7d5a3c', true);
      put(cx - 0.6, cy - 0.4, 1.2, 0.7, 'table', '#9b6b3a', true);
      put(ix, iy + ih - 0.5, Math.min(1.6, iw), 0.45, 'tv', '#15181c', true);
      if (iw > 2.4 && ih > 2.4) put(cx - 1.1, cy - 0.9, 2.2, 1.6, 'rug', '#6f4b6a', false);
    } else if (t && t.startsWith('Bedroom')) {
      put(ix, iy, Math.min(2.0, iw), Math.min(1.5, ih), 'bed', '#5b6f86', true);
      put(ix + Math.min(2.0, iw) + 0.1, iy, 0.5, 0.5, 'nightstand', '#7a5536', true);
      put(ix + iw - 0.6, iy + ih - 1.4, 0.6, 1.4, 'wardrobe', '#6a4a30', true);
    } else if (t === 'Kitchen') {
      // counter wraps two walls (L-shape)
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
    }
  }

  /* ---- assemble a complete plan ---- */
  const PLAN_CACHE = new Map();

  function getPlan(b) {
    ensureEntry(b);
    if (PLAN_CACHE.has(b._id)) return PLAN_CACHE.get(b._id);

    const W = b._W, H = b._H, entry = b._entry;
    const rnd = rng(hashStr(b._id));

    const walls = [];
    const rooms = [];
    perimeterWalls(W, H, entry, walls);
    splitRegion({ x: 0, y: 0, w: W, h: H }, 0, rnd, walls, rooms);
    typeRooms(rooms, entry, rnd);

    const furniture = [];
    for (const r of rooms) {
      r.color = floorColor(r.type);
      furnish(r, rnd, furniture);
    }

    // spawn just inside the door, nudged toward the building centre
    const spawn = innerSpawn(entry, W, H, walls);

    const title = classifyBuilding(W, H, rnd);
    const plan = { id: b._id, title, W, H, walls, rooms, furniture, entry, spawn };
    PLAN_CACHE.set(b._id, plan);
    // record that this interior has been visited (deterministic, but
    // handy for any future "places you've been" feature)
    try {
      const seen = JSON.parse(localStorage.getItem('yesp-mg-interiors') || '{}');
      if (!seen[b._id]) { seen[b._id] = Date.now(); localStorage.setItem('yesp-mg-interiors', JSON.stringify(seen)); }
    } catch (e) {}
    return plan;
  }

  // a clear point ~1.1 m inward from the doorway
  function innerSpawn(entry, W, H, walls) {
    let dx = 0, dy = 0;
    if (entry.side === 'S') dy = 1.1;
    else if (entry.side === 'N') dy = -1.1;
    else if (entry.side === 'W') dx = 1.1;
    else dx = -1.1;
    let sx = clamp(entry.x + dx, 0.4, W - 0.4);
    let sy = clamp(entry.y + dy, 0.4, H - 0.4);
    // if that lands in a wall, walk it toward the centre until clear
    for (let i = 0; i < 24 && hitWalls(sx, sy, walls); i++) {
      sx += (W / 2 - sx) * 0.12;
      sy += (H / 2 - sy) * 0.12;
    }
    return { x: sx, y: sy };
  }

  /* =======================================================
     4 · COLLISION
     ======================================================= */
  function hitRects(x, y, rects, r) {
    for (const w of rects) {
      if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) return true;
    }
    return false;
  }
  function hitWalls(x, y, walls) { return hitRects(x, y, walls, PLAYER_R); }

  /* =======================================================
     5 · LIVE SESSION (step + render)
     ======================================================= */
  function openSession(b, userName) {
    const plan = getPlan(b);
    const solids = plan.walls.concat(plan.furniture.filter((f) => f.solid));
    const s = {
      px: plan.spawn.x, py: plan.spawn.y,
      vx: 0, vy: 0, heading: 180, user: userName || 'you',
      // exit only arms once the player has stepped away from the door,
      // so you don't instantly pop back out the instant you enter
      armed: false,
    };

    function hit(x, y) { return hitRects(x, y, solids, PLAYER_R); }

    function step(dt, input) {
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
      let want;
      if (joy.active) want = WALK + (RUN - WALK) * Math.max(0, (mag - 0.6) / 0.4);
      else want = keys['shift'] ? RUN : WALK;
      let tvx = 0, tvy = 0;
      if (mag > 1e-6) { tvx = (dE / mag) * want; tvy = (dN / mag) * want; }
      s.vx += (tvx - s.vx) * Math.min(1, WACC * dt);
      s.vy += (tvy - s.vy) * Math.min(1, WACC * dt);
      if (Math.hypot(s.vx, s.vy) > 0.05) s.heading = (Math.atan2(s.vx, s.vy) * 180) / Math.PI;

      // axis-separated movement → slide along walls
      let nx = s.px + s.vx * dt;
      if (!hit(nx, s.py)) s.px = nx; else s.vx = 0;
      let ny = s.py + s.vy * dt;
      if (!hit(s.px, ny)) s.py = ny; else s.vy = 0;
      s.px = clamp(s.px, PLAYER_R, plan.W - PLAYER_R);
      s.py = clamp(s.py, PLAYER_R, plan.H - PLAYER_R);

      // arm the exit once we've moved a little inside
      const dDoor = Math.hypot(s.px - plan.entry.x, s.py - plan.entry.y);
      if (dDoor > 2.0) s.armed = true;
      // walking back into the doorway leaves the building
      const exited = s.armed && dDoor < 1.0;
      return { exited };
    }

    // camera + draw
    function render(canvas) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      const dpr = canvas._dpr || 1;
      const vw = w / dpr, vh = h / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // pick a zoom that frames the player nicely but stays "indoors"
      const PXM = clamp(Math.min(vw, vh) / 13, 16, 34); // px per metre
      const camX = s.px, camY = s.py;
      // world→screen: y is flipped (north up)
      const toX = (mx) => (mx - camX) * PXM + vw / 2;
      const toY = (my) => vh / 2 - (my - camY) * PXM;

      // backdrop (outside the building = dark void)
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(0, 0, vw, vh);

      // building shell shadow
      ctx.fillStyle = '#16130f';
      ctx.fillRect(toX(0) - 6, toY(plan.H) - 6, plan.W * PXM + 12, plan.H * PXM + 12);

      // room floors
      for (const r of plan.rooms) {
        ctx.fillStyle = r.color || PALETTE.floorGeneric;
        ctx.fillRect(toX(r.x), toY(r.y + r.h), r.w * PXM, r.h * PXM);
        // subtle floorboards / tiles
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 1;
        const step = (r.type === 'Kitchen' || r.type === 'Bathroom') ? 0.6 : 0.9;
        for (let gx = r.x; gx < r.x + r.w; gx += step) {
          ctx.beginPath(); ctx.moveTo(toX(gx), toY(r.y)); ctx.lineTo(toX(gx), toY(r.y + r.h)); ctx.stroke();
        }
      }

      // room labels
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 11px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
      for (const r of plan.rooms) {
        if (!r.type) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.fillText(r.type, toX(r.x + r.w / 2), toY(r.y + r.h - 0.35));
      }

      // furniture
      for (const f of plan.furniture) {
        if (f.kind === 'rug') {
          ctx.fillStyle = f.color; ctx.globalAlpha = 0.5;
          ctx.fillRect(toX(f.x), toY(f.y + f.h), f.w * PXM, f.h * PXM);
          ctx.globalAlpha = 1;
          continue;
        }
        ctx.fillStyle = f.color;
        ctx.fillRect(toX(f.x), toY(f.y + f.h), f.w * PXM, f.h * PXM);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.strokeRect(toX(f.x), toY(f.y + f.h), f.w * PXM, f.h * PXM);
        // a hint of highlight on the top face
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(toX(f.x), toY(f.y + f.h), f.w * PXM, Math.min(4, f.h * PXM * 0.3));
      }

      // walls
      ctx.fillStyle = '#cdd2d8';
      for (const wl of plan.walls) {
        ctx.fillRect(toX(wl.x), toY(wl.y + wl.h), Math.max(2, wl.w * PXM), Math.max(2, wl.h * PXM));
      }
      // wall edge shading for depth
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
      for (const wl of plan.walls) {
        ctx.strokeRect(toX(wl.x), toY(wl.y + wl.h), Math.max(2, wl.w * PXM), Math.max(2, wl.h * PXM));
      }

      // entry door — glowing threshold + arrow
      const ex = toX(plan.entry.x), ey = toY(plan.entry.y);
      ctx.save();
      ctx.shadowColor = '#7fe0a0'; ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(127,224,160,0.85)';
      ctx.beginPath(); ctx.arc(ex, ey, Math.max(7, DOOR_W * PXM * 0.5), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#0a0c10';
      ctx.font = '700 12px sans-serif';
      ctx.fillText('EXIT', ex, ey);

      // the player
      const pxX = vw / 2, pxY = vh / 2;
      ctx.save();
      ctx.translate(pxX, pxY);
      ctx.rotate((s.heading * Math.PI) / 180);
      ctx.fillStyle = '#4aa3f0';
      ctx.strokeStyle = '#14202e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER_R * PXM + 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // facing nub
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(0, -(PLAYER_R * PXM + 1), 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // name tag
      ctx.fillStyle = '#fff';
      ctx.font = '700 12px sans-serif';
      ctx.fillText(s.user, pxX, pxY - (PLAYER_R * PXM + 16));

      // vignette so it reads as enclosed
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }

    return { plan, step, render, pos: () => ({ x: s.px, y: s.py }) };
  }

  /* ---- export ---- */
  window.Interiors = { ensureEntry, getPlan, openSession };
})();
