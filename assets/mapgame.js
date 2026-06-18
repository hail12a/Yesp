/* =========================================================
   mapgame.js — Satellite Map Drive
   ---------------------------------------------------------
   A real-map driving + walking game built on Leaflet.
   • Esri World Imagery satellite basemap (no key).
   • Right-click → route on real roads (OSRM) → car drives it
     with acceleration, cornering limits and braking.
   • Animated speedometer + tachometer, gear + km/h readout.
   • Leave the car to walk around as a person (WASD / click).
   The camera is locked to the active entity (GPS style): the
   world scrolls under a centred car/person overlay.
   Exposes window.wireMapGame(); called by app.js on render.
   ========================================================= */
(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // physics (metres, seconds)
  const ACCEL = 4.2;     // engine accel
  const BRAKE = 7.5;     // braking decel
  const LAT_A = 4.8;     // cornering grip → corner speed = sqrt(LAT_A * R)
  const WALK  = 1.7;     // walking m/s (~6 km/h)
  const RUN   = 4.6;     // running m/s (~16 km/h)
  const WACC  = 12;      // foot acceleration

  const GEAR_TOP = [0, 28, 55, 92, 138, 290]; // km/h ceiling per gear 1..5
  const IDLE = 900, REDLINE = 6900;

  const EARTH_M_PER_DEG = 111320;

  let G = null; // active game state

  function teardown() {
    if (!G) return;
    cancelAnimationFrame(G.raf);
    window.removeEventListener('keydown', G.onKey);
    window.removeEventListener('keyup', G.onKeyUp);
    try { G.map.remove(); } catch (e) {}
    G = null;
  }

  window.wireMapGame = function wireMapGame() {
    const mapEl = $('#mg-map');
    if (!mapEl) { teardown(); return; }          // left the page
    if (G && G.mapEl === mapEl) return;           // already running here
    teardown();
    init(mapEl);
  };

  function init(mapEl) {
    if (typeof L === 'undefined') {
      mapEl.innerHTML =
        '<div style="padding:24px;color:#ccc;font:14px sans-serif">Map library failed to load. Check your internet connection and refresh.</div>';
      return;
    }
    const start = { lat: 48.2082, lng: 16.3738 }; // Vienna

    const map = L.map(mapEl, {
      center: [start.lat, start.lng],
      zoom: 17,
      zoomControl: true,
      attributionControl: false,
      doubleClickZoom: false,
    });
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, maxNativeZoom: 19 }
    ).addTo(map);
    // faint road labels on top so streets are readable
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, maxNativeZoom: 19, opacity: 0.9 }
    ).addTo(map);

    setTimeout(() => map.invalidateSize(), 60);

    G = {
      mapEl, map,
      mode: 'drive',                 // 'drive' | 'walk'
      pos: { ...start },
      heading: 0,                    // degrees, 0 = north, CW
      speed: 0,                      // m/s
      setSpeed: 50 / 3.6,            // target limit (m/s)
      route: null,                   // {rlat,rlng,seg,cum,vlim,total,n}
      distAlong: 0,
      walkVel: { e: 0, n: 0 },       // foot velocity (m/s)
      walkTarget: null,              // {lat,lng}
      keys: {},
      routeLine: null,
      destMarker: null,
      last: performance.now(),
      raf: 0,
      onKey: null, onKeyUp: null,
    };

    // ---- input ----
    map.on('contextmenu', (e) => {
      if (G.mode !== 'drive') return;
      routeTo(e.latlng);
    });
    map.on('click', (e) => {
      if (G.mode !== 'walk') return;
      G.walkTarget = { lat: e.latlng.lat, lng: e.latlng.lng };
    });

    G.onKey = (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        if (G.mode === 'walk') { G.keys[k] = true; G.walkTarget = null; }
      }
    };
    G.onKeyUp = (e) => { G.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', G.onKey);
    window.addEventListener('keyup', G.onKeyUp);

    // ---- HUD buttons ----
    const setSpeedFromBox = () => {
      const v = parseFloat($('#mg-setspeed').value);
      if (isFinite(v)) G.setSpeed = Math.max(0, v) / 3.6;
    };
    $('#mg-setbtn').addEventListener('click', setSpeedFromBox);
    $('#mg-setspeed').addEventListener('keydown', (e) => { if (e.key === 'Enter') setSpeedFromBox(); });
    $('#mg-presets').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        $('#mg-setspeed').value = b.dataset.v;
        G.setSpeed = parseFloat(b.dataset.v) / 3.6;
      })
    );
    $('#mg-stop').addEventListener('click', () => {
      G.route = null; G.distAlong = 0; G.speed = 0; G.walkTarget = null;
      clearRoute();
    });
    $('#mg-toggle').addEventListener('click', toggleMode);

    G.raf = requestAnimationFrame(loop);
  }

  // ---------- mode switching ----------
  function toggleMode() {
    if (!G) return;
    if (G.mode === 'drive') {
      G.mode = 'walk';
      G.route = null; clearRoute();
      G.speed = 0;
      $('#mg-car').hidden = true;
      $('#mg-person').hidden = false;
      $('#mg-mode').textContent = '🚶 On foot';
      $('#mg-toggle').textContent = '🚗 Enter car';
      G.carPos = { ...G.pos };            // remember where the car waits
      $('#mg-hint').textContent = 'WASD to walk · Shift to run · click to walk-to. Reach the car to enter.';
    } else {
      // only enter if near the parked car
      if (G.carPos && haversine(G.pos, G.carPos) > 12) {
        $('#mg-hint').textContent = 'Too far from the car — walk back to it.';
        return;
      }
      G.mode = 'drive';
      if (G.carPos) G.pos = { ...G.carPos };
      G.walkVel = { e: 0, n: 0 };
      $('#mg-car').hidden = false;
      $('#mg-person').hidden = true;
      $('#mg-mode').textContent = '🚗 Driving';
      $('#mg-toggle').textContent = '🚶 Leave car';
      $('#mg-hint').textContent = 'Right-click the map → drive there. Scroll to zoom.';
    }
  }

  // ---------- routing ----------
  async function routeTo(dest) {
    const o = G.pos;
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    let coords = null;
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (d.routes && d.routes[0]) {
        coords = d.routes[0].geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] }));
      }
    } catch (e) { /* fall through */ }
    if (!coords || coords.length < 2) coords = [{ ...o }, { lat: dest.lat, lng: dest.lng }];
    setRoute(coords, dest);
  }

  function setRoute(coords, dest) {
    if (!G) return;
    const n = coords.length;
    const lat0 = coords[0].lat, lng0 = coords[0].lng;
    const cosLat = Math.cos((lat0 * Math.PI) / 180);
    const mx = new Array(n), my = new Array(n);
    for (let i = 0; i < n; i++) {
      mx[i] = (coords[i].lng - lng0) * EARTH_M_PER_DEG * cosLat;
      my[i] = (coords[i].lat - lat0) * EARTH_M_PER_DEG;
    }
    const seg = new Array(n - 1), cum = new Array(n);
    cum[0] = 0;
    for (let i = 0; i < n - 1; i++) {
      seg[i] = Math.hypot(mx[i + 1] - mx[i], my[i + 1] - my[i]);
      cum[i + 1] = cum[i] + seg[i];
    }
    // curvature-based speed limits + stop at the end
    const vlim = new Array(n).fill(120);
    for (let i = 1; i < n - 1; i++) {
      const ax = mx[i - 1], ay = my[i - 1], bx = mx[i], by = my[i], cx = mx[i + 1], cy = my[i + 1];
      const A = Math.hypot(bx - cx, by - cy);
      const B = Math.hypot(ax - cx, ay - cy);
      const C = Math.hypot(ax - bx, ay - by);
      const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
      if (area > 1e-3) {
        const R = (A * B * C) / (4 * area);
        vlim[i] = Math.min(vlim[i], Math.sqrt(LAT_A * R));
      }
    }
    vlim[n - 1] = 0;
    // backward pass so we can always brake in time
    for (let i = n - 2; i >= 0; i--) {
      vlim[i] = Math.min(vlim[i], Math.sqrt(vlim[i + 1] * vlim[i + 1] + 2 * BRAKE * seg[i]));
    }

    G.route = {
      rlat: coords.map((c) => c.lat), rlng: coords.map((c) => c.lng),
      seg, cum, vlim, total: cum[n - 1], n,
    };
    G.distAlong = 0;
    // snap car to route start
    G.pos = { lat: coords[0].lat, lng: coords[0].lng };

    drawRoute(coords, dest);
  }

  function drawRoute(coords, dest) {
    clearRoute();
    G.routeLine = L.polyline(coords.map((c) => [c.lat, c.lng]),
      { color: '#37c0ff', weight: 5, opacity: 0.85 }).addTo(G.map);
    if (dest) {
      G.destMarker = L.circleMarker([dest.lat, dest.lng],
        { radius: 7, color: '#fff', weight: 2, fillColor: '#ff4d4d', fillOpacity: 1 }).addTo(G.map);
    }
  }
  function clearRoute() {
    if (G.routeLine) { G.map.removeLayer(G.routeLine); G.routeLine = null; }
    if (G.destMarker) { G.map.removeLayer(G.destMarker); G.destMarker = null; }
  }

  // ---------- helpers ----------
  function haversine(a, b) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const la1 = a.lat * toR, la2 = b.lat * toR;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function routePosition(d) {
    const r = G.route;
    let i = 0;
    while (i < r.n - 2 && r.cum[i + 1] < d) i++;
    const segLen = r.seg[i] || 1e-6;
    const t = Math.max(0, Math.min(1, (d - r.cum[i]) / segLen));
    const lat = r.rlat[i] + (r.rlat[i + 1] - r.rlat[i]) * t;
    const lng = r.rlng[i] + (r.rlng[i + 1] - r.rlng[i]) * t;
    // heading from this segment
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const dE = (r.rlng[i + 1] - r.rlng[i]) * cosLat;
    const dN = (r.rlat[i + 1] - r.rlat[i]);
    const heading = (Math.atan2(dE, dN) * 180) / Math.PI;
    return { lat, lng, heading, segIdx: i };
  }

  // ---------- main loop ----------
  function loop(now) {
    if (!G) return;
    let dt = (now - G.last) / 1000;
    G.last = now;
    if (dt > 0.1) dt = 0.1;

    if (G.mode === 'drive') stepDrive(dt);
    else stepWalk(dt);

    // camera locked to entity
    G.map.setView([G.pos.lat, G.pos.lng], G.map.getZoom(), { animate: false });

    // rotate overlays
    if (G.mode === 'drive') {
      $('#mg-car-rot').style.transform = `rotate(${G.heading}deg)`;
    } else {
      $('#mg-person-rot').style.transform = `rotate(${G.heading}deg)`;
    }

    updateHUD();
    G.raf = requestAnimationFrame(loop);
  }

  function stepDrive(dt) {
    const r = G.route;
    let target = G.setSpeed;

    if (r && G.distAlong < r.total) {
      const pos = routePosition(G.distAlong);
      const i = pos.segIdx;
      // braking bound: brake down to the (already backward-passed) limit at next vertex
      const remain = Math.max(0, r.cum[i + 1] - G.distAlong);
      const brakeBound = Math.sqrt(r.vlim[i + 1] * r.vlim[i + 1] + 2 * BRAKE * remain);
      target = Math.min(target, brakeBound);

      // accelerate / brake toward target
      if (G.speed < target) G.speed = Math.min(target, G.speed + ACCEL * dt);
      else G.speed = Math.max(target, G.speed - BRAKE * dt);

      G.distAlong += G.speed * dt;
      if (G.distAlong >= r.total) {
        G.distAlong = r.total; G.speed = 0;
        G.pos = { lat: r.rlat[r.n - 1], lng: r.rlng[r.n - 1] };
        G.route = null; clearRoute();
      } else {
        const p2 = routePosition(G.distAlong);
        G.pos = { lat: p2.lat, lng: p2.lng };
        G.heading = p2.heading;
      }
    } else {
      // no route → coast to stop
      G.speed = Math.max(0, G.speed - BRAKE * dt);
    }
  }

  function stepWalk(dt) {
    let dirE = 0, dirN = 0;
    const k = G.keys;
    if (k['w'] || k['arrowup']) dirN += 1;
    if (k['s'] || k['arrowdown']) dirN -= 1;
    if (k['a'] || k['arrowleft']) dirE -= 1;
    if (k['d'] || k['arrowright']) dirE += 1;

    let usingKeys = dirE || dirN;
    if (!usingKeys && G.walkTarget) {
      const cosLat = Math.cos((G.pos.lat * Math.PI) / 180);
      dirE = (G.walkTarget.lng - G.pos.lng) * cosLat;
      dirN = (G.walkTarget.lat - G.pos.lat);
      if (haversine(G.pos, G.walkTarget) < 1.2) { G.walkTarget = null; dirE = dirN = 0; }
    }

    const want = (k['shift'] ? RUN : WALK);
    const mag = Math.hypot(dirE, dirN);
    let tvE = 0, tvN = 0;
    if (mag > 1e-6) { tvE = (dirE / mag) * want; tvN = (dirN / mag) * want; }

    // accelerate velocity toward target (snappy)
    G.walkVel.e += (tvE - G.walkVel.e) * Math.min(1, WACC * dt);
    G.walkVel.n += (tvN - G.walkVel.n) * Math.min(1, WACC * dt);

    const vE = G.walkVel.e, vN = G.walkVel.n;
    const spd = Math.hypot(vE, vN);
    if (spd > 0.05) G.heading = (Math.atan2(vE, vN) * 180) / Math.PI;
    G.speed = spd;

    const cosLat = Math.cos((G.pos.lat * Math.PI) / 180);
    G.pos.lat += (vN * dt) / EARTH_M_PER_DEG;
    G.pos.lng += (vE * dt) / (EARTH_M_PER_DEG * cosLat);
  }

  // ---------- HUD / gauges ----------
  function gearRpm(kmh) {
    if (kmh < 1) return { gear: 'N', rpm: IDLE };
    let g = 1;
    for (let i = 1; i < GEAR_TOP.length; i++) if (kmh > GEAR_TOP[i]) g = i + 1;
    g = Math.min(g, GEAR_TOP.length - 1);
    const lo = GEAR_TOP[g - 1], hi = GEAR_TOP[g];
    const frac = Math.max(0, Math.min(1, (kmh - lo) / (hi - lo)));
    return { gear: String(g), rpm: IDLE + frac * (REDLINE - IDLE) };
  }

  function updateHUD() {
    const kmh = G.speed * 3.6;
    const { gear, rpm } = G.mode === 'drive' ? gearRpm(kmh) : { gear: '–', rpm: IDLE };
    $('#mg-kmh').textContent = Math.round(kmh);
    $('#mg-gear').textContent = gear;
    drawGauge($('#mg-speedo'), kmh, 220, ' ', 0.16);
    drawGauge($('#mg-tach'), rpm / 1000, 7, ' ', 0.74, true);
  }

  // sweep gauge: value over [0,max]; redFrac marks the red zone start
  function drawGauge(cv, value, max, label, redFrac, isTach) {
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 8;
    ctx.clearRect(0, 0, w, h);

    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25; // 270° sweep
    // track
    ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
    // red zone
    ctx.strokeStyle = 'rgba(231,76,60,0.85)';
    ctx.beginPath(); ctx.arc(cx, cy, R, a0 + (a1 - a0) * redFrac, a1); ctx.stroke();
    // ticks
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    const ticks = isTach ? 7 : 11;
    for (let i = 0; i <= ticks; i++) {
      const a = a0 + (a1 - a0) * (i / ticks);
      const r1 = R - 4, r2 = R - 12;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }
    // value arc
    const frac = Math.max(0, Math.min(1, value / max));
    ctx.lineWidth = 5;
    ctx.strokeStyle = frac > redFrac ? '#ff6b5e' : '#37c0ff';
    ctx.beginPath(); ctx.arc(cx, cy, R - 18, a0, a0 + (a1 - a0) * frac); ctx.stroke();
    // needle
    const a = a0 + (a1 - a0) * frac;
    ctx.strokeStyle = '#ffce47'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8);
    ctx.lineTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16));
    ctx.stroke();
    ctx.fillStyle = '#ffce47';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
  }
})();
