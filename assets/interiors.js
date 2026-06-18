/* ================================================================
   INTERIORS.JS  —  procedural interior generator for Yesp Map Drive
   ================================================================ */
(function () {
  'use strict';

  const EARTH    = 111320;
  const WALL_TH  = 0.14;
  const DOOR_W   = 1.10;
  const PLAYER_R = 0.26;
  const MIN_SIDE = 6;
  const MAX_SIDE = 200;
  const WALK = 1.7, RUN = 4.6, WACC = 12;

  /* ---- RNG ---- */
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
    return { f: r, range: (a, b) => a + (b - a) * r(), int: (a, b) => Math.floor(a + (b - a + 1) * r()), pick: (arr) => arr[Math.floor(r() * arr.length) % arr.length], chance: (p) => r() < p };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ---- geometry helpers ---- */
  function centroid(pts) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].lng, yi = pts[i].lat, xj = pts[j].lng, yj = pts[j].lat;
      const f = xi * yj - xj * yi; a += f; cx += (xi + xj) * f; cy += (yi + yj) * f;
    }
    if (Math.abs(a) < 1e-12) { let sx = 0, sy = 0; for (const p of pts) { sx += p.lng; sy += p.lat; } return { lng: sx / pts.length, lat: sy / pts.length }; }
    a *= 0.5; return { lng: cx / (6 * a), lat: cy / (6 * a) };
  }
  function metresPerLng(lat) { return EARTH * Math.cos((lat * Math.PI) / 180); }

  function chooseDoorEdge(pts, cen, mLng) {
    let best = null, bestScore = -1;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const ax = pts[j].lng, ay = pts[j].lat, bx = pts[i].lng, by = pts[i].lat;
      const dxm = (bx - ax) * mLng, dym = (by - ay) * EARTH, len = Math.hypot(dxm, dym);
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
      { side: 'S', x: clamp(dx, DOOR_W, W - DOOR_W), y: 0,  d: dy },
      { side: 'N', x: clamp(dx, DOOR_W, W - DOOR_W), y: H,  d: H - dy },
      { side: 'W', x: 0, y: clamp(dy, DOOR_W, H - DOOR_W),  d: dx },
      { side: 'E', x: W, y: clamp(dy, DOOR_W, H - DOOR_W),  d: W - dx },
    ];
    cand.sort((a, b) => a.d - b.d); return cand[0];
  }

  /* ---- archetype classification ---- */
  function classify(tags, W, H) {
    const area = W * H, bt = String(tags.building || '').toLowerCase();
    const levels = parseInt(tags['building:levels'], 10);
    const looksTall = isFinite(levels) ? levels >= 4 : area > 700;
    if (tags.shop || ['retail','commercial','supermarket','kiosk','mall','shop'].includes(bt)) return 'shop';
    if (bt === 'hotel' || tags.tourism === 'hotel' || tags.tourism === 'motel') return 'hotel';
    if (bt === 'office' || tags.office) return 'office';
    if (['apartments','residential','dormitory','terrace'].includes(bt))
      return (bt === 'residential' && !looksTall && area < 380) ? 'house' : 'apartments';
    if (['house','detached','bungalow','cottage','semidetached_house','cabin','hut','farm'].includes(bt)) return 'house';
    if (area > 650 || looksTall) return 'apartments';
    return 'house';
  }
  function buildingTitle(kind, tags, rnd) {
    if (tags && tags.name) return String(tags.name).slice(0, 40);
    if (kind === 'apartments') return rnd.pick(['Apartment Block','Residences','Housing Block']);
    if (kind === 'hotel') return rnd.pick(['Hotel','Grand Hotel','Inn']);
    if (kind === 'office') return rnd.pick(['Office Building','Business Centre','Chambers']);
    if (kind === 'shop') return rnd.pick(['Corner Shop','Market','Department Store']);
    return rnd.pick(['House','Townhouse','Cottage','Residence']);
  }
  const KIND_ICON = { house: '🏠', apartments: '🏢', hotel: '🏨', office: '🏢', shop: '🏪' };

  function ensureEntry(b) {
    if (b._entry) return b._entry;
    const cen = centroid(b.pts), mLng = metresPerLng(cen.lat);
    let W = clamp((b.maxLng - b.minLng) * mLng, MIN_SIDE, MAX_SIDE);
    let H = clamp((b.maxLat - b.minLat) * EARTH, MIN_SIDE, MAX_SIDE);
    const tags = b.tags || {}, kind = classify(tags, W, H);
    const id = 'b' + Math.round(cen.lat * 1e5) + '_' + Math.round(cen.lng * 1e5) + '_' + Math.round(W) + 'x' + Math.round(H) + '_' + kind;
    const edge = chooseDoorEdge(b.pts, cen, mLng);
    let lx, ly, nrmLat, nrmLng;
    if (edge) { lx = (edge.mx - b.minLng) * mLng; ly = (edge.my - b.minLat) * EARTH; nrmLat = edge.ny / EARTH; nrmLng = edge.nx / mLng; }
    else { lx = W / 2; ly = 0; nrmLat = -1 / EARTH; nrmLng = 0; }
    const shell = snapToShell(lx, ly, W, H);
    b._id = id; b._W = W; b._H = H; b._kind = kind; b._info = { tags, title: null };
    b._entry = { lat: b.minLat + shell.y / EARTH, lng: b.minLng + shell.x / mLng, x: shell.x, y: shell.y, side: shell.side, out: { lat: nrmLat, lng: nrmLng } };
    return b._entry;
  }
  function describe(b) {
    ensureEntry(b);
    const name = b._info && b._info.tags && b._info.tags.name;
    return (KIND_ICON[b._kind] || '🏠') + ' ' + (name || ({ house:'House',apartments:'Apartments',hotel:'Hotel',office:'Office',shop:'Shop' })[b._kind] || 'Building');
  }

  /* ================================================================
     WALL / ROOM PRIMITIVES
     ================================================================ */
  function wallRect(x, y, w, h) { return { x, y, w: Math.max(w, 0), h: Math.max(h, 0) }; }

  // Build a wall segment with a door gap; records gap centre in `gaps` array
  function gapWall(vertical, fixed, a0, a1, gapAt, walls, gaps) {
    const g0 = clamp(gapAt, a0 + 0.1, a1 - DOOR_W - 0.1), g1 = g0 + DOOR_W;
    const half = WALL_TH / 2;
    if (vertical) {
      if (g0 - a0 > 0.02) walls.push(wallRect(fixed - half, a0, WALL_TH, g0 - a0));
      if (a1 - g1 > 0.02) walls.push(wallRect(fixed - half, g1, WALL_TH, a1 - g1));
      if (gaps) gaps.push({ cx: fixed, cy: (g0 + g1) / 2, vert: true });
    } else {
      if (g0 - a0 > 0.02) walls.push(wallRect(a0, fixed - half, g0 - a0, WALL_TH));
      if (a1 - g1 > 0.02) walls.push(wallRect(g1, fixed - half, a1 - g1, WALL_TH));
      if (gaps) gaps.push({ cx: (g0 + g1) / 2, cy: fixed, vert: false });
    }
  }

  function perimeterWalls(W, H, entry, walls, gaps) {
    const half = WALL_TH / 2;
    add(false, 0, W, 0,   entry && entry.side === 'S' ? entry.x : null);
    add(false, 0, W, H,   entry && entry.side === 'N' ? entry.x : null);
    add(true,  0, H, 0,   entry && entry.side === 'W' ? entry.y : null);
    add(true,  0, H, W,   entry && entry.side === 'E' ? entry.y : null);
    function add(vert, a0, a1, fixed, gc) {
      if (gc == null) { if (vert) walls.push(wallRect(fixed - half, a0, WALL_TH, a1 - a0)); else walls.push(wallRect(a0, fixed - half, a1 - a0, WALL_TH)); return; }
      gapWall(vert, fixed, a0, a1, gc - DOOR_W / 2, walls, gaps);
    }
  }

  function hitRects(x, y, rects, r) {
    for (const w of rects) if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) return true;
    return false;
  }
  function innerSpawn(entry, W, H, walls) {
    let dx = 0, dy = 0;
    if (entry.side === 'S') dy = 1.2; else if (entry.side === 'N') dy = -1.2;
    else if (entry.side === 'W') dx = 1.2; else dx = -1.2;
    let sx = clamp(entry.x + dx, 0.5, W - 0.5), sy = clamp(entry.y + dy, 0.5, H - 0.5);
    for (let i = 0; i < 28 && hitRects(sx, sy, walls, PLAYER_R); i++) { sx += (W / 2 - sx) * 0.12; sy += (H / 2 - sy) * 0.12; }
    return { x: sx, y: sy };
  }

  /* ================================================================
     FLOOR COLOUR PALETTE  —  region-aware warm tones
     ================================================================ */
  const FLOOR_STYLES = {
    vienna: { living: '#C8A870', kitchen: '#D0CCC2', bath: '#C8D4DC', bed: '#C4A46A', entry: '#BEB8AE', hall: '#C6C2BA', sofa: '#7A5C38', bed_frame: '#4E6278', wood: '#6A4A2E', counter: '#9EA8B2', rug: '#6A3E7A' },
    eastern:{ living: '#BEB090', kitchen: '#CCCAC4', bath: '#C4D0D8', bed: '#B8A862', entry: '#B6B2AA', hall: '#C0BCB4', sofa: '#5A5848', bed_frame: '#485868', wood: '#5A4828', counter: '#8A9298', rug: '#5A3060' },
    med:    { living: '#D4B080', kitchen: '#D8D2C4', bath: '#CAD8D0', bed: '#CEA868', entry: '#C4BEB2', hall: '#CCC8C0', sofa: '#8A6848', bed_frame: '#4A5A78', wood: '#784E2A', counter: '#A0A8A0', rug: '#7A4E3A' },
  };
  function getStyle(opts) { return FLOOR_STYLES[opts && opts.style] || FLOOR_STYLES.vienna; }

  function floorColor(type, style) {
    const s = FLOOR_STYLES[style] || FLOOR_STYLES.vienna;
    if (!type) return '#C0B8A8';
    if (type.startsWith('Bedroom')) return s.bed;
    if (type.startsWith('Office') || type.startsWith('Room')) return '#BAC0C8';
    const m = { 'Living Room': s.living, 'Kitchen': s.kitchen, 'Bathroom': s.bath, 'Entrance': s.entry, 'Hallway': s.hall, 'Shop floor': '#C8C4BC' };
    return m[type] || '#C0B8A8';
  }

  // Detect region style from lat/lng
  function detectStyle(lat, lng) {
    // Vienna + Central Europe
    if (lat > 47.0 && lat < 49.5 && lng > 13.0 && lng < 18.0) return 'vienna';
    // Russia / Eastern Europe
    if (lng > 25 && (lat > 50 || (lat > 44 && lng > 36))) return 'eastern';
    // Mediterranean
    if (lat > 35 && lat < 46 && lng > -5 && lng < 28) return 'med';
    return 'vienna';
  }

  /* ================================================================
     FURNITURE  —  wall-hugging, door-gap-aware, region-styled
     ================================================================ */
  const GAP_CLEAR = 1.0;

  function doorBlocked(fx, fy, fw, fh, gaps) {
    for (const g of gaps) {
      if (g.vert) {
        if (fx < g.cx + 0.9 && fx + fw > g.cx - 0.9 && fy < g.cy + DOOR_W / 2 + GAP_CLEAR && fy + fh > g.cy - DOOR_W / 2 - GAP_CLEAR) return true;
      } else {
        if (fx < g.cx + DOOR_W / 2 + GAP_CLEAR && fx + fw > g.cx - DOOR_W / 2 - GAP_CLEAR && fy < g.cy + 0.9 && fy + fh > g.cy - 0.9) return true;
      }
    }
    return false;
  }

  function furnish(room, rnd, out, gaps, style) {
    const { x: rx, y: ry, w: rw, h: rh, type: t } = room;
    if (!t) return;
    const S = getStyle({ style });
    const ok = (fx, fy, fw, fh) => fw > 0 && fh > 0 && !doorBlocked(fx, fy, fw, fh, gaps);
    const push = (fx, fy, fw, fh, kind, color, solid) => { if (ok(fx, fy, fw, fh)) out.push({ x: fx, y: fy, w: fw, h: fh, kind, color, solid: solid !== false }); };
    const dec = (fx, fy, fw, fh, kind, color) => out.push({ x: fx, y: fy, w: fw, h: fh, kind, color, solid: false });

    if (t === 'Kitchen') {
      const cT = 0.65;
      // South-wall counter (full run, L-join corner)
      push(rx + cT, ry + 0.04, rw - cT - 0.05, cT, 'counter', S.counter, true);
      // West-wall counter arm
      const armH = Math.min(rh * 0.52, 3.0);
      push(rx + 0.04, ry + 0.04, cT, armH, 'counter', S.counter, true);
      // Stove on south counter
      push(rx + cT + 0.15, ry + 0.10, 0.78, 0.46, 'stove', '#383E46', true);
      // Fridge: far W corner
      push(rx + 0.04, ry + armH + 0.05, cT, Math.min(0.80, rh - armH - 0.15), 'fridge', '#D0D8DC', true);
      // Upper cabinets on N wall
      const cabW = Math.min(rw * 0.60, 2.6);
      dec(rx + (rw - cabW) / 2, ry + rh - 0.05 - 0.52, cabW, 0.52, 'cabinet', '#909AA4');
      // Sink marker (inset on south counter)
      push(rx + rw - 0.04 - 0.72, ry + 0.12, 0.68, 0.40, 'sink', '#B8C8D4', true);

    } else if (t === 'Bathroom') {
      // Toilet: always far corner from door
      push(rx + 0.04, ry + rh - 0.05 - 0.72, 0.46, 0.72, 'toilet', '#EAF2F6', true);
      // Sink vanity unit: opposite side
      push(rx + rw - 0.05 - 0.70, ry + rh - 0.05 - 0.52, 0.70, 0.52, 'sink', '#D4E4EE', true);
      // Bathtub / shower: along W wall
      if (rw > 2.0 && rh > 2.4) {
        const tubH = Math.min(rh * 0.46, 1.80);
        push(rx + 0.04, ry + 0.04, Math.min(0.90, rw * 0.42), tubH, 'tub', '#C4DCE8', true);
      }
      // Small mirror / shelf above sink (non-solid)
      dec(rx + rw - 0.05 - 0.65, ry + rh - 0.05 - 0.52 - 0.22, 0.60, 0.18, 'mirror', '#C0D8E8');

    } else if (t === 'Entrance') {
      push(rx + 0.04, ry + 0.04, 0.28, Math.min(rh * 0.48, 1.20), 'coatrack', S.wood, true);
      push(rx + rw - 0.05 - 0.90, ry + 0.04, 0.90, 0.30, 'shoecab', S.wood, true);
      // Hall mirror (non-solid)
      dec(rx + rw * 0.3, ry + rh * 0.15, rw * 0.35, rh * 0.45, 'mirror', '#C8D4DC');

    } else if (t.startsWith('Bedroom')) {
      const isFirst = t === 'Bedroom 1';
      // Bed centred against N wall (away from entry side)
      const bW = Math.min(1.90, rw - 1.0), bH = Math.min(2.10, rh - 0.9);
      const bX = rx + (rw - bW) / 2;
      push(bX, ry + rh - 0.05 - bH, bW, bH, 'bed', S.bed_frame, true);
      // Headboard visual
      dec(bX, ry + rh - 0.05 - bH, bW, 0.28, 'headboard', S.wood);
      // Nightstand(s)
      push(bX - 0.50, ry + rh - 0.05 - 0.50, 0.46, 0.46, 'nightstand', S.wood, true);
      push(bX + bW + 0.04, ry + rh - 0.05 - 0.50, 0.46, 0.46, 'nightstand', S.wood, true);
      // Wardrobe: NW corner (sliding)
      const wW = Math.min(1.60, rw * 0.42);
      push(rx + 0.04, ry + rh - 0.05 - 0.60, wW, 0.60, 'wardrobe', S.wood, true);
      // Desk in NE corner for bedroom 2 / study feel
      if (!isFirst && rw > 3.2) {
        push(rx + rw - 0.05 - 1.20, ry + 0.04, 1.20, 0.65, 'desk', S.wood, true);
        push(rx + rw - 0.05 - 0.80, ry + 0.04 + 0.70, 0.50, 0.50, 'chair', '#4A4840', true);
      }
      // Rug under bed
      dec(bX - 0.25, ry + rh - 0.05 - bH - 0.40, bW + 0.50, bH + 0.45, 'rug', S.rug);

    } else if (t === 'Living Room') {
      const sfW = Math.min(2.80, rw - 0.9), sfH = 0.92;
      // Sofa against S wall
      push(rx + (rw - sfW) / 2, ry + 0.04, sfW, sfH, 'sofa', S.sofa, true);
      // Armchair on one side
      push(rx + 0.04, ry + 0.04 + sfH + 0.25, 0.80, 0.80, 'armchair', S.sofa, true);
      // TV unit on N wall
      const tvW = Math.min(1.90, rw * 0.50), tvH = 0.38;
      push(rx + (rw - tvW) / 2, ry + rh - 0.05 - tvH, tvW, tvH, 'tv-unit', '#282C34', true);
      // Bookshelf on E wall (tall, narrow)
      if (rh > 4.0) push(rx + rw - 0.05 - 0.42, ry + 0.04 + sfH + 0.10, 0.42, Math.min(rh * 0.45, 1.80), 'bookshelf', S.wood, true);
      // Decorative: rug, coffee table
      const tbW = Math.min(1.20, rw * 0.32), tbH = 0.60;
      dec(rx + (rw - tbW - 0.6) / 2, ry + 0.04 + sfH + 0.08, tbW + 0.6, tbH + 0.8, 'rug', S.rug);
      dec(rx + (rw - tbW) / 2, ry + 0.04 + sfH + 0.36, tbW, tbH, 'table', '#9A7050');
      // Plant in corner
      dec(rx + rw - 0.05 - 0.38, ry + 0.04, 0.38, 0.38, 'plant', '#3A6830');
    }
  }

  /* ================================================================
     ZONE-BASED FLOOR PLAN
     Day zone (entry side):   Living Room + Kitchen
     Night zone (far side):   Bedroom(s) + Bathroom
     ================================================================ */
  function buildZonedPlan(seed, W, H, entry, opts) {
    opts = opts || {};
    const rnd = rng(seed);
    const walls = [], rooms = [], furniture = [], gaps = [];

    perimeterWalls(W, H, entry, walls, gaps);

    const onNS     = entry.side === 'S' || entry.side === 'N';
    const entryLow = entry.side === 'S' || entry.side === 'W';
    const dayFrac  = rnd.range(0.50, 0.60);

    if (onNS) {
      const splitY  = entryLow ? H * dayFrac : H * (1 - dayFrac);
      const dayY    = entryLow ? 0 : splitY,  dayH  = entryLow ? splitY : H - splitY;
      const nightY  = entryLow ? splitY : 0,  nightH = H - dayH;

      // Zone wall
      const zdX = clamp(rnd.range(W * 0.28, W * 0.72), DOOR_W + 0.3, W - DOOR_W - 0.3);
      gapWall(false, splitY, 0, W, zdX - DOOR_W / 2, walls, gaps);

      // Day zone — Kitchen left or right, Living Room fills rest
      const kW = clamp(rnd.range(W * 0.35, W * 0.46), 3.4, W - 3.8);
      const kitL = rnd.chance(0.5);
      const kitX = kitL ? 0 : W - kW, livX = kitL ? kW : 0, livW = W - kW;
      rooms.push({ x: kitX, y: dayY, w: kW, h: dayH, type: 'Kitchen' });
      rooms.push({ x: livX, y: dayY, w: livW, h: dayH, type: 'Living Room' });
      gapWall(true, kitL ? kW : W - kW, dayY, dayY + dayH, dayY + dayH * rnd.range(0.35, 0.65) - DOOR_W / 2, walls, gaps);

      // Night zone — Bathroom corner, then 1-2 bedrooms
      const bathW = clamp(rnd.range(2.3, 2.9), 2.1, W * 0.32);
      const batL  = rnd.chance(0.5);
      const bathX = batL ? 0 : W - bathW, bedX = batL ? bathW : 0, bedW = W - bathW;
      rooms.push({ x: bathX, y: nightY, w: bathW, h: nightH, type: 'Bathroom' });
      gapWall(true, batL ? bathW : W - bathW, nightY, nightY + nightH, nightY + nightH * rnd.range(0.35, 0.65) - DOOR_W / 2, walls, gaps);

      if (bedW >= 5.8 && nightH >= 3.2) {
        const b1W = bedW * rnd.range(0.44, 0.56);
        gapWall(true, bedX + b1W, nightY, nightY + nightH, nightY + nightH * rnd.range(0.35, 0.65) - DOOR_W / 2, walls, gaps);
        rooms.push({ x: bedX,        y: nightY, w: b1W,        h: nightH, type: 'Bedroom 1' });
        rooms.push({ x: bedX + b1W,  y: nightY, w: bedW - b1W, h: nightH, type: 'Bedroom 2' });
      } else {
        rooms.push({ x: bedX, y: nightY, w: bedW, h: nightH, type: 'Bedroom 1' });
      }

    } else {
      // E/W entry: split vertically
      const splitX  = entryLow ? W * dayFrac : W * (1 - dayFrac);
      const dayX    = entryLow ? 0 : splitX,  dayW  = entryLow ? splitX : W - splitX;
      const nightX  = entryLow ? splitX : 0,  nightW = W - dayW;

      const zdY = clamp(rnd.range(H * 0.28, H * 0.72), DOOR_W + 0.3, H - DOOR_W - 0.3);
      gapWall(true, splitX, 0, H, zdY - DOOR_W / 2, walls, gaps);

      const kH = clamp(rnd.range(H * 0.36, H * 0.48), 3.4, H - 3.8);
      const kitB = rnd.chance(0.5);
      const kitY = kitB ? 0 : H - kH, livY = kitB ? kH : 0, livH = H - kH;
      rooms.push({ x: dayX, y: kitY, w: dayW, h: kH,  type: 'Kitchen' });
      rooms.push({ x: dayX, y: livY, w: dayW, h: livH, type: 'Living Room' });
      gapWall(false, kitB ? kH : H - kH, dayX, dayX + dayW, dayX + dayW * rnd.range(0.35, 0.65) - DOOR_W / 2, walls, gaps);

      const bathH = clamp(rnd.range(2.3, 2.9), 2.1, H * 0.32);
      const batB  = rnd.chance(0.5);
      const bathY = batB ? 0 : H - bathH, bedY = batB ? bathH : 0, bedH = H - bathH;
      rooms.push({ x: nightX, y: bathY, w: nightW, h: bathH, type: 'Bathroom' });
      gapWall(false, batB ? bathH : H - bathH, nightX, nightX + nightW, nightX + nightW * rnd.range(0.35, 0.65) - DOOR_W / 2, walls, gaps);

      if (bedH >= 5.8 && nightW >= 3.2) {
        const b1H = bedH * rnd.range(0.44, 0.56);
        gapWall(false, bedY + b1H, nightX, nightX + nightW, nightX + nightW * rnd.range(0.35, 0.65) - DOOR_W / 2, walls, gaps);
        rooms.push({ x: nightX, y: bedY,        w: nightW, h: b1H,        type: 'Bedroom 1' });
        rooms.push({ x: nightX, y: bedY + b1H,  w: nightW, h: bedH - b1H, type: 'Bedroom 2' });
      } else {
        rooms.push({ x: nightX, y: bedY, w: nightW, h: bedH, type: 'Bedroom 1' });
      }
    }

    const style = opts.style || 'vienna';
    for (const r of rooms) { r.area = r.w * r.h; r.color = floorColor(r.type, style); furnish(r, rnd, furniture, gaps, style); }

    // Spawn in the centre of the Living Room — guaranteed open, away from all walls
    const lr = rooms.find(r => r.type === 'Living Room');
    const spawn = lr ? { x: lr.x + lr.w / 2, y: lr.y + lr.h / 2 } : innerSpawn(entry, W, H, walls);
    const portals = [{ kind: 'exit', x: entry.x, y: entry.y, label: opts.exitLabel || 'EXIT' }];
    return { W, H, walls, rooms, furniture, portals, spawn, gaps };
  }

  /* ================================================================
     ARCHETYPE BUILDERS
     ================================================================ */
  function buildHouse(seed, W, H, entry, opts) {
    const plan = buildZonedPlan(seed, W, H, entry, opts);
    plan.kind = 'house'; return plan;
  }

  function buildShop(seed, W, H, entry) {
    const rnd = rng(seed), walls = [], rooms = [], furniture = [], gaps = [];
    perimeterWalls(W, H, entry, walls, gaps);
    rooms.push({ x: 0, y: 0, w: W, h: H, type: 'Shop floor', area: W * H, color: floorColor('Shop floor') });
    const cnLen = Math.min(3.2, W * 0.4);
    if (entry.side === 'S' || entry.side === 'N') {
      const cy = entry.side === 'S' ? 1.4 : H - 2.0;
      furniture.push({ x: clamp(entry.x + 1.0, 0.5, W - cnLen - 0.5), y: cy, w: cnLen, h: 0.6, kind: 'counter', color: '#8A939C', solid: true });
    } else {
      const cx = entry.side === 'W' ? 1.4 : W - 2.0;
      furniture.push({ x: cx, y: clamp(entry.y + 1.0, 0.5, H - cnLen - 0.5), w: 0.6, h: cnLen, kind: 'counter', color: '#8A939C', solid: true });
    }
    const horiz = W >= H, span = horiz ? H : W, run = horiz ? W : H;
    const rows = clamp(Math.floor((span - 2.5) / 2.4), 1, 8), gap = (span - 1.6) / (rows + 1);
    for (let i = 1; i <= rows; i++) {
      const t = 1.0 + i * gap, segs = clamp(Math.floor((run - 2.4) / 1.6), 1, 12), segLen = (run - 2.4) / segs;
      for (let s = 0; s < segs; s++) {
        if (rnd.chance(0.18)) continue;
        const u = 1.2 + s * segLen + 0.1;
        if (horiz) furniture.push({ x: u, y: t - 0.25, w: segLen - 0.4, h: 0.5, kind: 'shelf', color: '#6B5A3C', solid: true });
        else furniture.push({ x: t - 0.25, y: u, w: 0.5, h: segLen - 0.4, kind: 'shelf', color: '#6B5A3C', solid: true });
      }
    }
    const spawn = innerSpawn(entry, W, H, walls);
    return { kind: 'shop', W, H, walls, rooms, furniture, portals: [{ kind: 'exit', x: entry.x, y: entry.y, label: 'EXIT' }], spawn };
  }

  function buildHallway(seed, W, H, entry, kind, opts) {
    opts = opts || {};
    const style = opts.style || 'vienna';
    const rnd = rng(seed), walls = [], rooms = [], furniture = [], portals = [];
    const unitWord = kind === 'hotel' ? 'Room' : kind === 'office' ? 'Office' : 'Apt';
    const horiz = W >= H, longLen = horiz ? W : H, shortLen = horiz ? H : W;
    const HW = clamp(shortLen * 0.19, 2.2, 2.8);
    const unitDepthMin = 4.5, twoSided = shortLen >= 2 * unitDepthMin + HW;
    let c0 = twoSided ? (shortLen - HW) / 2 : ((horiz ? entry.y : entry.x) > shortLen / 2 ? shortLen - HW : 0);
    const c1 = c0 + HW;
    perimeterWalls(W, H, null, walls);
    const XY = (al, cr) => horiz ? { x: al, y: cr } : { x: cr, y: al };
    const corr = horiz ? { x: 0, y: c0, w: W, h: HW } : { x: c0, y: 0, w: HW, h: H };
    corr.type = 'Hallway'; corr.area = corr.w * corr.h; corr.color = floorColor('Hallway', style);
    rooms.push(corr);
    const K = clamp(Math.round(longLen / 10), 1, 8), secLen = longLen / K;
    const sides = twoSided ? ['low','high'] : [(c0 === 0) ? 'high' : 'low'];
    let uid = 0;
    for (const side of sides) {
      const bd = side === 'low' ? c0 : (shortLen - c1);
      if (bd < 3.0) continue;
      const cBase = side === 'low' ? 0 : c1, dCross = side === 'low' ? c0 : c1;
      for (let i = 0; i < K; i++) {
        const a0 = i * secLen;
        const blk = horiz ? { x: a0, y: cBase, w: secLen, h: bd } : { x: cBase, y: a0, w: bd, h: secLen };
        blk.type = unitWord + ' ' + (uid + 1); blk.closed = true; blk.color = '#8A8078'; blk.area = blk.w * blk.h;
        rooms.push(blk);
        const along = a0 + secLen / 2;
        const doorPt = XY(along, dCross);
        const inset = side === 'low' ? 0.45 : -0.45;
        const porPt = XY(along, dCross + inset);
        const uW = horiz ? secLen : bd, uH = horiz ? bd : secLen;
        let uE;
        if (horiz) uE = { side: side === 'low' ? 'N' : 'S', x: uW / 2, y: side === 'low' ? uH : 0 };
        else       uE = { side: side === 'low' ? 'E' : 'W', x: side === 'low' ? uW : 0, y: uH / 2 };
        portals.push({ kind: 'unit', unitIndex: uid, label: unitWord + ' ' + (uid + 1), x: porPt.x, y: porPt.y, door: { x: doorPt.x, y: doorPt.y, horiz }, fp: { w: uW, h: uH }, unitEntry: uE });
        uid++;
      }
    }
    const half = WALL_TH / 2;
    for (const side of sides) { const line = side === 'low' ? c0 : c1; if (horiz) walls.push(wallRect(0, line - half, longLen, WALL_TH)); else walls.push(wallRect(line - half, 0, WALL_TH, longLen)); }
    const aE = horiz ? entry.x : entry.y, exAl = (aE < longLen / 2) ? 0.7 : longLen - 0.7;
    const exPt = XY(exAl, c0 + HW / 2);
    portals.unshift({ kind: 'exit', x: exPt.x, y: exPt.y, label: 'EXIT' });
    if (horiz) furniture.push({ x: 1.2, y: c0 + HW * 0.22, w: W - 2.4, h: HW * 0.55, kind: 'rug', color: '#6A4E7A', solid: false });
    else       furniture.push({ x: c0 + HW * 0.22, y: 1.2, w: HW * 0.55, h: H - 2.4, kind: 'rug', color: '#6A4E7A', solid: false });
    const spAl = (aE < longLen / 2) ? exAl + 1.5 : exAl - 1.5;
    const sp = XY(clamp(spAl, 0.8, longLen - 0.8), c0 + HW / 2);
    return { kind, W, H, walls, rooms, furniture, portals, spawn: { x: sp.x, y: sp.y } };
  }

  /* ================================================================
     PLAN CACHE
     ================================================================ */
  const PLAN_CACHE = new Map();
  function logVisit(id) {
    try { const s = JSON.parse(localStorage.getItem('yesp-mg-interiors') || '{}'); if (!s[id]) { s[id] = Date.now(); localStorage.setItem('yesp-mg-interiors', JSON.stringify(s)); } } catch (e) {}
  }

  function getRootPlan(b) {
    ensureEntry(b);
    if (PLAN_CACHE.has(b._id)) return PLAN_CACHE.get(b._id);
    const seed = hashStr(b._id), rnd = rng(seed ^ 0x9e3779b9), title = buildingTitle(b._kind, b._info.tags, rnd);
    const style = detectStyle(b._entry.lat, b._entry.lng);
    let plan;
    if (b._kind === 'shop') plan = buildShop(seed, b._W, b._H, b._entry);
    else if (['apartments','hotel','office'].includes(b._kind)) plan = buildHallway(seed, b._W, b._H, b._entry, b._kind, { style });
    else plan = buildHouse(seed, b._W, b._H, b._entry, { style });
    plan.title = title; PLAN_CACHE.set(b._id, plan); logVisit(b._id); return plan;
  }

  // Apartment unit: always a generous Vienna-sized flat (13-18 × 10-14 m)
  function getUnitPlan(b, portal) {
    const key = b._id + '#u' + portal.unitIndex;
    if (PLAN_CACHE.has(key)) return PLAN_CACHE.get(key);
    const seed = hashStr(key), r2 = rng(seed ^ 0x1234);
    const UW = Math.round(r2.range(13, 18)), UH = Math.round(r2.range(10, 14));
    const e = portal.unitEntry;
    const entry = { side: e.side, x: 0, y: 0 };
    if (e.side === 'S') { entry.y = 0; entry.x = clamp(UW / 2, DOOR_W, UW - DOOR_W); }
    else if (e.side === 'N') { entry.y = UH; entry.x = clamp(UW / 2, DOOR_W, UW - DOOR_W); }
    else if (e.side === 'W') { entry.x = 0;  entry.y = clamp(UH / 2, DOOR_W, UH - DOOR_W); }
    else                     { entry.x = UW; entry.y = clamp(UH / 2, DOOR_W, UH - DOOR_W); }
    const style = detectStyle(b._entry.lat, b._entry.lng);
    const plan = buildHouse(seed, UW, UH, entry, { exitLabel: 'EXIT', style });
    plan.title = portal.label; PLAN_CACHE.set(key, plan); logVisit(key); return plan;
  }

  /* ================================================================
     LIVE SESSION  (nestable scene stack)
     ================================================================ */
  function openSession(b, userName) {
    const user = userName || 'you';
    const scenes = []; let exited = false;

    function makeScene(plan, fromPortal) {
      const solids = plan.walls.concat(plan.furniture.filter((f) => f.solid));
      return { plan, solids, fromPortal, px: plan.spawn.x, py: plan.spawn.y, vx: 0, vy: 0, heading: 180, cooldown: nearestPortal(plan, plan.spawn.x, plan.spawn.y) };
    }
    function cur() { return scenes[scenes.length - 1]; }
    function nearestPortal(plan, x, y) {
      let best = null, bd = 1e9;
      for (const p of plan.portals) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
      return bd < 1.8 ? best : null;
    }

    scenes.push(makeScene(getRootPlan(b), null));

    function activate(p) {
      if (p.kind === 'unit') { scenes.push(makeScene(getUnitPlan(b, p), p)); }
      else { if (scenes.length === 1) exited = true; else { const leaving = scenes.pop(); cur().cooldown = leaving.fromPortal; } }
    }

    function move(dt, input) {
      const s = cur(), keys = input.keys || {}, joy = input.joy || { active: false, x: 0, y: 0 };
      let dE = 0, dN = 0;
      if (joy.active) { dE = joy.x; dN = joy.y; }
      else {
        if (keys['w'] || keys['arrowup'])    dN += 1;
        if (keys['s'] || keys['arrowdown'])  dN -= 1;
        if (keys['a'] || keys['arrowleft'])  dE -= 1;
        if (keys['d'] || keys['arrowright']) dE += 1;
      }
      const mag = Math.hypot(dE, dN);
      const want = joy.active ? WALK + (RUN - WALK) * Math.max(0, (mag - 0.6) / 0.4) : (keys['shift'] ? RUN : WALK);
      let tvx = 0, tvy = 0;
      if (mag > 1e-6) { tvx = (dE / mag) * want; tvy = (dN / mag) * want; }
      s.vx += (tvx - s.vx) * Math.min(1, WACC * dt); s.vy += (tvy - s.vy) * Math.min(1, WACC * dt);
      if (Math.hypot(s.vx, s.vy) > 0.05) s.heading = (Math.atan2(s.vx, s.vy) * 180) / Math.PI;
      const hit = (x, y) => hitRects(x, y, s.solids, PLAYER_R);
      let nx = s.px + s.vx * dt; if (!hit(nx, s.py)) s.px = nx; else s.vx = 0;
      let ny = s.py + s.vy * dt; if (!hit(s.px, ny)) s.py = ny; else s.vy = 0;
      s.px = clamp(s.px, PLAYER_R, s.plan.W - PLAYER_R);
      s.py = clamp(s.py, PLAYER_R, s.plan.H - PLAYER_R);
      if (s.cooldown && Math.hypot(s.px - s.cooldown.x, s.py - s.cooldown.y) > 1.7) s.cooldown = null;
    }

    function step(dt, input) {
      if (exited) return { exited: true };
      move(dt, input);
      // No auto-activate — player must press F
      return { exited };
    }

    function interact() {
      if (exited) return;
      const s = cur(); if (s.cooldown) return;
      let best = null, bd = 2.2;
      for (const p of s.plan.portals) { const d = Math.hypot(p.x - s.px, p.y - s.py); if (d < bd) { bd = d; best = p; } }
      if (best) activate(best);
    }

    function title() { return scenes[scenes.length - 1]?.plan?.title || ''; }

    /* ---- RENDER ---- */
    function render(canvas) {
      const s = cur(), plan = s.plan;
      const ctx = canvas.getContext('2d');
      const dpr = canvas._dpr || 1, vw = canvas.width / dpr, vh = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const PXM = clamp(Math.min(vw, vh) / 14, 18, 40);
      const toX = (mx) => (mx - s.px) * PXM + vw / 2;
      const toY = (my) => vh / 2 - (my - s.py) * PXM;
      const fam = getComputedStyle(document.body).fontFamily || 'Inter,sans-serif';

      // Exterior void
      ctx.fillStyle = '#1C1A16'; ctx.fillRect(0, 0, vw, vh);
      // Building footprint shadow
      ctx.fillStyle = '#2E2820';
      ctx.fillRect(toX(0) - 10, toY(plan.H) - 10, plan.W * PXM + 20, plan.H * PXM + 20);

      // Floor fill per room
      for (const r of plan.rooms) {
        const rx = toX(r.x), ry = toY(r.y + r.h), rw = r.w * PXM, rh = r.h * PXM;
        if (r.closed) {
          // Apartment block door: dark face with label
          ctx.fillStyle = '#6A6258'; ctx.fillRect(rx, ry, rw, rh);
          ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '500 10px ' + fam;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(r.type, rx + rw / 2, ry + rh / 2);
          continue;
        }
        // Floor colour
        ctx.fillStyle = r.color || FLOOR_CLR.generic; ctx.fillRect(rx, ry, rw, rh);
        // Floor texture lines
        const isKB = r.type === 'Kitchen' || r.type === 'Bathroom' || r.type === 'Entrance';
        ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
        if (isKB) {
          // Square tile grid
          const stp = 0.55;
          for (let gx = r.x; gx < r.x + r.w; gx += stp) { ctx.beginPath(); ctx.moveTo(toX(gx), ry); ctx.lineTo(toX(gx), ry + rh); ctx.stroke(); }
          for (let gy = r.y; gy < r.y + r.h; gy += stp) { ctx.beginPath(); ctx.moveTo(rx, toY(gy)); ctx.lineTo(rx + rw, toY(gy)); ctx.stroke(); }
        } else {
          // Parquet planks
          const stp = 0.80;
          for (let gy = r.y; gy < r.y + r.h; gy += stp) { ctx.beginPath(); ctx.moveTo(rx, toY(gy)); ctx.lineTo(rx + rw, toY(gy)); ctx.stroke(); }
        }
        // Subtle room border/skirting
        ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 2;
        ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
      }

      // Room labels (faint, understated)
      ctx.font = '500 9px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const r of plan.rooms) {
        if (!r.type || r.closed) continue;
        ctx.fillStyle = 'rgba(20,14,8,0.38)';
        ctx.fillText(r.type.toUpperCase(), toX(r.x + r.w / 2), toY(r.y + r.h / 2));
      }

      // Furniture
      for (const f of plan.furniture) {
        const fx = toX(f.x), fy = toY(f.y + f.h), fw = f.w * PXM, fh = f.h * PXM;
        if (f.kind === 'rug') {
          ctx.globalAlpha = 0.42; ctx.fillStyle = f.color; ctx.fillRect(fx, fy, fw, fh); ctx.globalAlpha = 1; continue;
        }
        if (f.kind === 'table') {
          ctx.globalAlpha = 0.72; ctx.fillStyle = f.color; ctx.fillRect(fx, fy, fw, fh);
          ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.strokeRect(fx, fy, fw, fh); ctx.globalAlpha = 1; continue;
        }
        if (f.kind === 'cabinet') {
          ctx.globalAlpha = 0.6; ctx.fillStyle = f.color; ctx.fillRect(fx, fy, fw, fh);
          ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.strokeRect(fx, fy, fw, fh); ctx.globalAlpha = 1; continue;
        }
        // Solid furniture
        ctx.fillStyle = f.color; ctx.fillRect(fx, fy, fw, fh);
        ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(fx, fy, fw, Math.min(5, fh * 0.22));
        ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(fx, Math.max(fy, fy + fh - 4), fw, Math.min(4, fh * 0.16));
        ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.strokeRect(fx, fy, fw, fh);
      }

      // Walls — light plaster colour
      for (const wl of plan.walls) {
        const wx = toX(wl.x), wy = toY(wl.y + wl.h), ww = Math.max(2, wl.w * PXM), wh = Math.max(2, wl.h * PXM);
        ctx.fillStyle = '#EDEAE2'; ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(wx, wy + wh - Math.min(3, wh * 0.3), ww, Math.min(3, wh * 0.3));
        ctx.strokeStyle = 'rgba(100,90,78,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(wx, wy, ww, wh);
      }

      // Door frame arcs (quarter-circle showing door swing)
      if (plan.gaps) {
        ctx.save(); ctx.strokeStyle = 'rgba(170,148,100,0.65)'; ctx.lineWidth = 1.5;
        for (const g of plan.gaps) {
          ctx.beginPath(); ctx.arc(toX(g.cx), toY(g.cy), DOOR_W * PXM * 0.5, 0, Math.PI / 2); ctx.stroke();
        }
        ctx.restore();
      }

      // Portals
      let nearest = null, nd = 2.4;
      for (const p of plan.portals) { const d = Math.hypot(p.x - s.px, p.y - s.py); if (d < nd) { nd = d; nearest = p; } }

      for (const p of plan.portals) {
        if (p.kind !== 'unit') continue;
        const d = p.door, w = d.horiz ? DOOR_W : 0.18, h = d.horiz ? 0.18 : DOOR_W;
        const hot = p === nearest;
        ctx.save(); if (hot) { ctx.shadowColor = '#FFD040'; ctx.shadowBlur = 18; }
        ctx.fillStyle = hot ? '#FFD040' : '#C8A038';
        ctx.fillRect(toX(d.x - w / 2), toY(d.y + h / 2), w * PXM, h * PXM);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = '600 9px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.label, toX(p.x), toY(p.y) + (p.y > s.py ? -13 : 16));
      }
      for (const p of plan.portals) {
        if (p.kind !== 'exit') continue;
        const ex = toX(p.x), ey = toY(p.y);
        ctx.save(); ctx.shadowColor = '#50D878'; ctx.shadowBlur = 22;
        ctx.fillStyle = 'rgba(80,216,110,0.90)';
        ctx.beginPath(); ctx.arc(ex, ey, Math.max(9, DOOR_W * PXM * 0.44), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#0A200E'; ctx.font = '700 11px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('EXIT', ex, ey);
      }

      // Player
      const pxX = vw / 2, pxY = vh / 2;
      ctx.save(); ctx.translate(pxX, pxY); ctx.rotate((s.heading * Math.PI) / 180);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(3, 4, PLAYER_R * PXM + 4, PLAYER_R * PXM + 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4AAEF2'; ctx.strokeStyle = '#0A1830'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER_R * PXM + 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FFE080'; ctx.beginPath(); ctx.arc(0, -(PLAYER_R * PXM + 3), 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.font = '700 12px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 3; ctx.strokeText(user, pxX, pxY - (PLAYER_R * PXM + 18));
      ctx.fillStyle = '#FFFFFF'; ctx.fillText(user, pxX, pxY - (PLAYER_R * PXM + 18));
      ctx.restore();

      // "Press F" hint near a portal
      if (nearest && nd < 2.1) {
        const hint = nearest.kind === 'exit' ? 'F — exit building' : 'F — enter ' + nearest.label;
        ctx.save(); ctx.font = '700 13px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3; ctx.strokeText(hint, pxX, pxY + (PLAYER_R * PXM + 30));
        ctx.fillStyle = 'rgba(255,218,70,0.96)'; ctx.fillText(hint, pxX, pxY + (PLAYER_R * PXM + 30));
        ctx.restore();
      }

      // Vignette
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.36, vw / 2, vh / 2, Math.max(vw, vh) * 0.74);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }

    return { step, render, interact, title, depth: () => scenes.length };
  }

  window.Interiors = { ensureEntry, describe, openSession, getRootPlan };
})();
