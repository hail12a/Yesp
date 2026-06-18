/* =========================================================
   mapgame.js — Map Drive (multiplayer, accounts, cars)
   ---------------------------------------------------------
   • Account gate (register/login) → spawn select → play.
   • Esri satellite basemap (Leaflet). Click to drive on real
     roads (OSRM) with per-car acceleration, cornering + braking.
   • Garage shop: 3 sedans + a Golf 1.9 SDI, each with its own
     accel / top speed / gearing.
   • Leave the car to walk (WASD/Shift on PC, joystick on mobile).
   • Multiplayer: every player's car + person + name + parked car
     are synced through the server and drawn for everyone.
   ========================================================= */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const EARTH = 111320;

  // ---- car catalogue ----
  const CARS = {
    golf_sdi:      { name: 'Golf 1.9 SDI', color: '#cfd4d8', accel: 1.9, brake: 6.5, gears: [0, 28, 52, 80, 110, 150] },
    sedan_onyx:    { name: 'Sedan Onyx',   color: '#272b31', accel: 3.3, brake: 8.0, gears: [0, 42, 78, 118, 165, 215] },
    sedan_crimson: { name: 'Sedan Crimson',color: '#b5302a', accel: 3.9, brake: 8.5, gears: [0, 46, 84, 126, 176, 238] },
    sedan_azure:   { name: 'Sedan Azure',  color: '#2563c9', accel: 4.5, brake: 9.0, gears: [0, 50, 92, 138, 196, 260] },
  };
  const CAR_ORDER = ['golf_sdi', 'sedan_onyx', 'sedan_crimson', 'sedan_azure'];
  const topMs = (id) => CARS[id].gears[CARS[id].gears.length - 1] / 3.6;

  const LAT_A = 4.8, WALK = 1.7, RUN = 4.6, WACC = 12, IDLE = 850, REDLINE = 6800;

  let G = null;

  function teardown() {
    if (!G) return;
    cancelAnimationFrame(G.raf);
    clearInterval(G.syncTimer);
    window.removeEventListener('keydown', G.onKey);
    window.removeEventListener('keyup', G.onKeyUp);
    if (G.doorEls) for (const [, el] of G.doorEls) el.remove();
    try { G.map.remove(); } catch (e) {}
    G = null;
  }

  window.wireMapGame = function () {
    const mapEl = $('#mg-map');
    if (!mapEl) { teardown(); return; }
    if (G && G.mapEl === mapEl) return;
    teardown();
    init(mapEl);
  };

  function init(mapEl) {
    if (typeof L === 'undefined') {
      mapEl.innerHTML = '<div style="padding:24px;color:#ccc;font:14px sans-serif">Map library failed to load. Refresh.</div>';
      return;
    }
    const start = { lat: 48.2032, lng: 16.3695 }; // Opernring (Ringstraße) — a wide road in Vienna
    const map = L.map(mapEl, { center: [start.lat, start.lng], zoom: 17, zoomControl: true, attributionControl: false, doubleClickZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19 }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, opacity: 0.9 }).addTo(map);
    setTimeout(() => map.invalidateSize(), 60);

    G = {
      mapEl, map, token: null, user: null, playing: false,
      mode: 'drive', pos: { ...start }, heading: 0, speed: 0, setSpeed: 50 / 3.6,
      carModel: 'sedan_onyx', carPos: { ...start },
      route: null, distAlong: 0,
      walkVel: { e: 0, n: 0 }, walkTarget: null, keys: {}, joy: { active: false, x: 0, y: 0 },
      routeLine: null, destMarker: null, remotes: {}, parkedEl: null,
      last: performance.now(), raf: 0, syncTimer: 0, authMode: 'login',
      onKey: null, onKeyUp: null,
      buildings: [], bldgCenter: null, bldgLayer: null, bldgFetching: false,
      bldgLast: 0, buildingsOn: true, bldgRenderer: L.canvas({ padding: 0.5 }),
      inside: null, insideBld: null, doorEls: new Map(), nearDoor: null,
      intCv: null, intW: 0, intH: 0,
    };

    buildCarIcon($('#mg-car-rot'), G.carModel);
    wireAuth();
    wireGame();

    G.raf = requestAnimationFrame(loop);
  }

  /* ---------------- AUTH + SPAWN ---------------- */
  function wireAuth() {
    const saved = localStorage.getItem('yesp-mg-token');
    const savedUser = localStorage.getItem('yesp-mg-user');
    if (saved && savedUser) { G.token = saved; G.user = savedUser; showSpawn(true); }

    $('#mg-auth-tabs').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        $('#mg-auth-tabs').querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        G.authMode = b.dataset.at;
        $('#mg-auth-go').textContent = G.authMode === 'login' ? 'Log in & continue' : 'Create account & continue';
      })
    );
    $('#mg-auth-go').addEventListener('click', doAuth);
    $('#mg-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth(); });
    $('#mg-spawn-go').addEventListener('click', startSpawn);
  }

  async function doAuth() {
    const user = $('#mg-user').value.trim();
    const pass = $('#mg-pass').value;
    const msg = $('#mg-auth-msg');
    msg.textContent = '…';
    try {
      const r = await fetch('/api/' + (G.authMode === 'login' ? 'login' : 'register'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass }),
      });
      const d = await r.json();
      if (!d.ok) { msg.textContent = '✖ ' + (d.error || 'failed'); return; }
      G.token = d.token; G.user = d.user;
      localStorage.setItem('yesp-mg-token', d.token);
      localStorage.setItem('yesp-mg-user', d.user);
      showSpawn(false);
    } catch (e) { msg.textContent = '✖ server unreachable'; }
  }

  async function showSpawn(autoResumeIfSaved) {
    $('#mg-stage-auth').hidden = true;
    $('#mg-stage-spawn').hidden = false;
    $('#mg-welcome').textContent = 'Welcome, ' + G.user + '. Choose where to spawn.';
    const list = $('#mg-spawn-list');
    const savedPos = localStorage.getItem('yesp-mg-pos');
    let defaultVal = 'here';
    let items = '';
    if (savedPos) {
      items += `<label class="mg-spawn-opt"><input type="radio" name="mg-spawn" value="resume" checked> 📌 Resume where you left off</label>`;
      items += `<label class="mg-spawn-opt"><input type="radio" name="mg-spawn" value="here"> 📍 Vienna (default spawn)</label>`;
      defaultVal = 'resume';
    } else {
      items += `<label class="mg-spawn-opt"><input type="radio" name="mg-spawn" value="here" checked> 📍 Vienna (default spawn)</label>`;
    }
    list.innerHTML = items;
    try {
      const r = await fetch('/api/world/players');
      const players = await r.json();
      players.filter((p) => p.user !== G.user).forEach((p) => {
        const o = document.createElement('label');
        o.className = 'mg-spawn-opt';
        o.innerHTML = `<input type="radio" name="mg-spawn" value="${p.lat},${p.lng}"> 🧍 Spawn on ${escapeH(p.user)}`;
        list.appendChild(o);
      });
    } catch (e) {}
    // if already logged in (page load), auto-resume if there's a saved position
    if (autoResumeIfSaved && savedPos) startSpawn();
  }

  function startSpawn() {
    const sel = document.querySelector('input[name="mg-spawn"]:checked');
    if (sel && sel.value === 'resume') {
      try {
        const saved = JSON.parse(localStorage.getItem('yesp-mg-pos'));
        G.pos = { lat: saved.lat, lng: saved.lng };
      } catch (e) { G.pos = { lat: 48.2032, lng: 16.3695 }; }
    } else if (sel && sel.value !== 'here') {
      const [la, ln] = sel.value.split(',').map(Number);
      // offset slightly so we don't overlap the other player
      G.pos = { lat: la + 0.00015, lng: ln + 0.00015 };
    } else {
      G.pos = { lat: 48.2032, lng: 16.3695 };
    }
    G.carPos = { ...G.pos };
    $('#mg-auth').style.display = 'none';
    $('#mg-controls').hidden = false;
    $('#mg-dash2').hidden = false;
    $('#mg-car').hidden = false;
    $('#mg-mylabel').hidden = false;
    $('#mg-mylabel').textContent = G.user;
    G.playing = true;
    loadBuildings(G.pos);
    syncNow();
    G.syncTimer = setInterval(syncNow, 180);
  }

  /* ---------------- game UI wiring ---------------- */
  function wireGame() {
    G.map.on('click', (e) => {
      if (!G.playing) return;
      if (G.mode === 'drive') routeTo(e.latlng);
      else G.walkTarget = { lat: e.latlng.lat, lng: e.latlng.lng };
    });
    G.map.on('contextmenu', (e) => { if (G.playing && G.mode === 'drive') routeTo(e.latlng); });

    G.onKey = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'e') { primaryAction(); return; }
      if ((G.mode === 'walk' || G.inside) && ['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        G.keys[k] = true; G.walkTarget = null;
      }
    };
    G.onKeyUp = (e) => { G.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', G.onKey);
    window.addEventListener('keyup', G.onKeyUp);

    const setSp = () => { const v = parseFloat($('#mg-setspeed').value); if (isFinite(v)) G.setSpeed = Math.max(0, v) / 3.6; };
    $('#mg-setbtn').addEventListener('click', setSp);
    $('#mg-setspeed').addEventListener('keydown', (e) => { if (e.key === 'Enter') setSp(); });
    $('#mg-presets').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => { $('#mg-setspeed').value = b.dataset.v; G.setSpeed = parseFloat(b.dataset.v) / 3.6; }));
    $('#mg-stop').addEventListener('click', () => { G.route = null; G.distAlong = 0; G.speed = 0; G.walkTarget = null; clearRoute(); });
    $('#mg-toggle').addEventListener('click', primaryAction);
    $('#mg-action').addEventListener('click', primaryAction);

    // shop
    buildShop();
    $('#mg-shopbtn').addEventListener('click', () => { $('#mg-shop').hidden = !$('#mg-shop').hidden; });
    $('#mg-shop-close').addEventListener('click', () => { $('#mg-shop').hidden = true; });

    if (TOUCH) { $('#mg-action').hidden = false; wireJoystick(); }
  }

  function buildShop() {
    const list = $('#mg-shop-list');
    list.innerHTML = CAR_ORDER.map((id) => {
      const c = CARS[id];
      const top = c.gears[c.gears.length - 1];
      return `<button class="mg-car-card" data-car="${id}">
        <span class="mg-car-swatch" style="background:${c.color}"></span>
        <span class="mg-car-info"><b>${c.name}</b>
        <span>top ${top} km/h · ${c.accel < 2.5 ? 'slow' : c.accel < 4 ? 'brisk' : 'fast'}</span></span>
      </button>`;
    }).join('');
    list.querySelectorAll('.mg-car-card').forEach((b) =>
      b.addEventListener('click', () => {
        G.carModel = b.dataset.car;
        buildCarIcon($('#mg-car-rot'), G.carModel);
        list.querySelectorAll('.mg-car-card').forEach((x) => x.classList.toggle('sel', x === b));
        $('#mg-shop').hidden = true;
      }));
    list.querySelector(`[data-car="${G.carModel}"]`)?.classList.add('sel');
  }

  function wireJoystick() {
    const joy = $('#mg-joy'), thumb = $('#mg-joy-thumb');
    const R = 46;
    let id = null;
    const center = () => { const r = joy.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const move = (cx, cy) => {
      const c = center();
      let dx = cx - c.x, dy = cy - c.y;
      const m = Math.hypot(dx, dy);
      if (m > R) { dx = dx / m * R; dy = dy / m * R; }
      thumb.style.transform = `translate(${dx}px,${dy}px)`;
      G.joy.x = dx / R; G.joy.y = -dy / R; G.joy.active = true;
    };
    const end = () => { id = null; thumb.style.transform = 'translate(0,0)'; G.joy.active = false; G.joy.x = G.joy.y = 0; };
    joy.addEventListener('touchstart', (e) => { id = e.changedTouches[0].identifier; move(e.changedTouches[0].clientX, e.changedTouches[0].clientY); e.preventDefault(); }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) move(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    joy.addEventListener('touchend', end);
    joy.addEventListener('touchcancel', end);
  }

  /* ---------------- mode switching ---------------- */
  function toggleMode() {
    if (!G || !G.playing) return;
    if (G.mode === 'drive') {
      G.mode = 'walk'; G.route = null; clearRoute(); G.speed = 0;
      G.carPos = { ...G.pos };
      $('#mg-car').hidden = true;
      $('#mg-person').hidden = false;
      $('#mg-mode').textContent = '🚶 On foot';
      $('#mg-toggle').textContent = '🚗 Enter car (E)';
      $('#mg-action').textContent = 'Enter (T)';
      if (TOUCH) $('#mg-joy').hidden = false;
      $('#mg-hint').textContent = TOUCH ? 'Joystick to walk · reach the car · T to enter.' : 'WASD to walk · Shift to run · E to enter the car.';
    } else {
      if (haversine(G.pos, G.carPos) > 10) { $('#mg-hint').textContent = 'Walk closer to your car to enter.'; return; }
      G.mode = 'drive'; G.pos = { ...G.carPos }; G.walkVel = { e: 0, n: 0 };
      $('#mg-car').hidden = false;
      $('#mg-person').hidden = true;
      $('#mg-mode').textContent = '🚗 Driving';
      $('#mg-toggle').textContent = '🚶 Leave car (E)';
      $('#mg-action').textContent = 'Leave (T)';
      $('#mg-joy').hidden = true;
      $('#mg-hint').textContent = 'Click the map → drive there. Scroll to zoom.';
    }
  }

  /* ---------------- primary action dispatch ----------------
     One button / key (E on PC, T on mobile) does the right thing
     for the current context: leave an interior, enter a doorway,
     or enter/leave the car. Priority: inside > doorway > car. */
  function primaryAction() {
    if (!G || !G.playing) return;
    if (G.inside) { exitBuilding(); return; }
    if (G.mode === 'walk' && G.nearDoor) { enterBuilding(G.nearDoor); return; }
    toggleMode();
  }

  /* ---------------- building interiors ---------------- */
  function enterBuilding(bld) {
    if (typeof Interiors === 'undefined') return;
    let session;
    try { session = Interiors.openSession(bld, G.user); } catch (e) { return; }
    G.inside = session;
    G.insideBld = bld;
    G.keys = {}; G.joy.active = false; G.joy.x = G.joy.y = 0;
    // park the avatar in the doorway so other players see you there
    G.mode = 'walk';
    G.pos = { lat: bld._entry.lat, lng: bld._entry.lng };
    G.carPos = { ...G.pos };
    // swap the view
    $('#mg-car').hidden = true;
    $('#mg-person').hidden = true;
    $('#mg-mylabel').hidden = true;
    $('#mg-dash2').hidden = true;
    $('#mg-interior').hidden = false;
    hideDoors();
    $('#mg-mode').textContent = '🏠 ' + session.plan.title;
    $('#mg-toggle').textContent = '🚪 Leave building (E)';
    $('#mg-hint').textContent = TOUCH ? 'Joystick to walk · reach the glowing EXIT · tap T.'
                                      : 'WASD to walk · Shift to run · reach the glowing EXIT · press E.';
    if (TOUCH) { $('#mg-joy').hidden = false; $('#mg-action').hidden = false; $('#mg-action').textContent = 'Exit (T)'; }
    sizeInterior(true);
  }

  function exitBuilding() {
    const b = G.insideBld;
    G.inside = null; G.insideBld = null;
    G.keys = {};
    $('#mg-interior').hidden = true;
    // step out ≈3 m clear of the wall, on foot
    if (b && b._entry) {
      const o = b._entry.out;
      G.pos = { lat: b._entry.lat + o.lat * 3, lng: b._entry.lng + o.lng * 3 };
      G.carPos = { ...G.pos };
    }
    G.mode = 'walk';
    $('#mg-person').hidden = false;
    $('#mg-mylabel').hidden = false;
    $('#mg-dash2').hidden = false;
    $('#mg-mode').textContent = '🚶 On foot';
    $('#mg-toggle').textContent = '🚗 Enter car (E)';
    $('#mg-hint').textContent = TOUCH ? 'Joystick to walk · reach the car · T to enter.'
                                      : 'WASD to walk · Shift to run · E to enter the car.';
    if (TOUCH) { $('#mg-action').textContent = 'Enter (T)'; }
  }

  function sizeInterior(force) {
    const cv = $('#mg-interior');
    if (!cv) return;
    const rect = G.mapEl.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(rect.width), H = Math.round(rect.height);
    if (force || G.intW !== W || G.intH !== H) {
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      cv._dpr = dpr;
      G.intW = W; G.intH = H;
    }
  }

  function stepInterior(dt) {
    const res = G.inside.step(dt, { keys: G.keys, joy: G.joy });
    sizeInterior(false);
    G.inside.render($('#mg-interior'));
    if (res.exited) exitBuilding();
  }

  /* ---------------- doorway highlights on the map ----------------
     One entry marker per building, shown only when you're on foot
     and within 40 m. The closest within ~6 m becomes G.nearDoor and
     can be entered with E / T. */
  function updateDoors() {
    if (G.mode !== 'walk' || !G.buildingsOn || !G.buildings.length) { hideDoors(); G.nearDoor = null; return; }
    const layer = $('#mg-doors');
    if (!layer) { G.nearDoor = null; return; }
    const live = new Set();
    let near = null, nd = 1e9;
    for (const b of G.buildings) {
      let ent;
      try { ent = Interiors.ensureEntry(b); } catch (e) { continue; }
      const dist = haversine(G.pos, ent);
      if (dist > 40) continue;
      live.add(b._id);
      let el = G.doorEls.get(b._id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'mg-door';
        el.innerHTML = '<span class="mg-door-ring"></span><span class="mg-door-ico">🚪</span>';
        layer.appendChild(el);
        G.doorEls.set(b._id, el);
      }
      const p = G.map.latLngToContainerPoint([ent.lat, ent.lng]);
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      const enterable = dist < 6;
      el.classList.toggle('near', enterable);
      el.style.opacity = String(Math.max(0.25, 1 - dist / 48));
      if (enterable && dist < nd) { nd = dist; near = b; }
    }
    // prune doors that drifted out of range
    for (const [id, el] of G.doorEls) {
      if (!live.has(id)) { el.remove(); G.doorEls.delete(id); }
    }
    G.nearDoor = near;
  }
  function hideDoors() {
    for (const [, el] of G.doorEls) el.remove();
    G.doorEls.clear();
    G.nearDoor = null;
  }

  /* ---------------- routing ---------------- */
  async function routeTo(dest) {
    const o = G.pos;
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    let coords = null;
    try {
      const r = await fetch(url); const d = await r.json();
      if (d.routes && d.routes[0]) coords = d.routes[0].geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] }));
    } catch (e) {}
    if (!coords || coords.length < 2) coords = [{ ...o }, { lat: dest.lat, lng: dest.lng }];
    setRoute(coords, dest);
  }

  function setRoute(coords, dest) {
    const n = coords.length;
    const lat0 = coords[0].lat, lng0 = coords[0].lng;
    const cl = Math.cos((lat0 * Math.PI) / 180);
    const mx = [], my = [];
    for (let i = 0; i < n; i++) { mx.push((coords[i].lng - lng0) * EARTH * cl); my.push((coords[i].lat - lat0) * EARTH); }
    const seg = [], cum = [0];
    for (let i = 0; i < n - 1; i++) { seg.push(Math.hypot(mx[i + 1] - mx[i], my[i + 1] - my[i])); cum.push(cum[i] + seg[i]); }
    const vlim = new Array(n).fill(120);
    for (let i = 1; i < n - 1; i++) {
      const A = Math.hypot(mx[i] - mx[i + 1], my[i] - my[i + 1]);
      const B = Math.hypot(mx[i - 1] - mx[i + 1], my[i - 1] - my[i + 1]);
      const C = Math.hypot(mx[i - 1] - mx[i], my[i - 1] - my[i]);
      const area = Math.abs((mx[i] - mx[i - 1]) * (my[i + 1] - my[i - 1]) - (mx[i + 1] - mx[i - 1]) * (my[i] - my[i - 1])) / 2;
      if (area > 1e-3) vlim[i] = Math.min(vlim[i], Math.sqrt(LAT_A * (A * B * C) / (4 * area)));
    }
    vlim[n - 1] = 0;
    for (let i = n - 2; i >= 0; i--) vlim[i] = Math.min(vlim[i], Math.sqrt(vlim[i + 1] * vlim[i + 1] + 2 * CARS[G.carModel].brake * seg[i]));

    G.route = { rlat: coords.map((c) => c.lat), rlng: coords.map((c) => c.lng), seg, cum, vlim, total: cum[n - 1], n };
    G.distAlong = 0; G.pos = { lat: coords[0].lat, lng: coords[0].lng };
    drawRoute(coords, dest);
  }

  function drawRoute(coords, dest) {
    clearRoute();
    G.routeLine = L.polyline(coords.map((c) => [c.lat, c.lng]), { color: '#37c0ff', weight: 5, opacity: 0.85 }).addTo(G.map);
    if (dest) G.destMarker = L.circleMarker([dest.lat, dest.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#ff4d4d', fillOpacity: 1 }).addTo(G.map);
  }
  function clearRoute() {
    if (G.routeLine) { G.map.removeLayer(G.routeLine); G.routeLine = null; }
    if (G.destMarker) { G.map.removeLayer(G.destMarker); G.destMarker = null; }
  }

  /* ---------------- helpers ---------------- */
  function haversine(a, b) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function routePosition(d) {
    const r = G.route; let i = 0;
    while (i < r.n - 2 && r.cum[i + 1] < d) i++;
    const t = Math.max(0, Math.min(1, (d - r.cum[i]) / (r.seg[i] || 1e-6)));
    const lat = r.rlat[i] + (r.rlat[i + 1] - r.rlat[i]) * t;
    const lng = r.rlng[i] + (r.rlng[i + 1] - r.rlng[i]) * t;
    const cl = Math.cos((lat * Math.PI) / 180);
    const heading = (Math.atan2((r.rlng[i + 1] - r.rlng[i]) * cl, r.rlat[i + 1] - r.rlat[i]) * 180) / Math.PI;
    return { lat, lng, heading, segIdx: i };
  }
  function escapeH(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function carSVG(color) {
    return `<svg viewBox="0 0 40 72" width="30" height="54">
      <rect x="6" y="4" width="28" height="64" rx="10" fill="${color}" stroke="rgba(0,0,0,.55)" stroke-width="2"/>
      <rect x="9" y="10" width="22" height="15" rx="5" fill="#1c2230"/>
      <rect x="9" y="40" width="22" height="17" rx="5" fill="#2a3346"/>
      <rect x="2" y="14" width="5" height="12" rx="2" fill="#2a2020"/><rect x="33" y="14" width="5" height="12" rx="2" fill="#2a2020"/>
      <rect x="2" y="46" width="5" height="12" rx="2" fill="#2a2020"/><rect x="33" y="46" width="5" height="12" rx="2" fill="#2a2020"/>
    </svg>`;
  }
  function buildCarIcon(el, id) { if (el) el.innerHTML = carSVG(CARS[id].color); }

  /* ---------------- building collision (OSM footprints) ---------------- */
  async function loadBuildings(center) {
    if (!G.buildingsOn || G.bldgFetching) return;
    const now = Date.now();
    if (G.bldgCenter && haversine(center, G.bldgCenter) < 400 && now - G.bldgLast < 8000) return;
    G.bldgFetching = true;
    const d = 0.006, cl = Math.cos((center.lat * Math.PI) / 180);
    const s = center.lat - d, n = center.lat + d, w = center.lng - d / cl, e = center.lng + d / cl;
    const q = `[out:json][timeout:25];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out geom;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      const data = await r.json();
      const polys = [];
      for (const el of data.elements || []) {
        let rings = [];
        if (el.type === 'way' && el.geometry) rings = [el.geometry];
        else if (el.type === 'relation' && el.members) rings = el.members.filter((m) => m.geometry && m.role !== 'inner').map((m) => m.geometry);
        for (const g of rings) {
          if (!g || g.length < 3) continue;
          let minLat = 1e9, maxLat = -1e9, minLng = 1e9, maxLng = -1e9;
          const pts = g.map((p) => {
            if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
            if (p.lon < minLng) minLng = p.lon; if (p.lon > maxLng) maxLng = p.lon;
            return { lat: p.lat, lng: p.lon };
          });
          polys.push({ minLat, maxLat, minLng, maxLng, pts });
        }
      }
      G.buildings = polys; G.bldgCenter = { ...center }; G.bldgLast = Date.now();
      drawBuildings();
    } catch (e) {}
    G.bldgFetching = false;
  }

  function drawBuildings() {
    if (G.bldgLayer) { G.map.removeLayer(G.bldgLayer); G.bldgLayer = null; }
    if (!G.buildingsOn) return;
    G.bldgLayer = L.layerGroup();
    for (const b of G.buildings) {
      L.polygon(b.pts.map((p) => [p.lat, p.lng]), {
        renderer: G.bldgRenderer, interactive: false,
        color: '#ff6b5e', weight: 1, opacity: 0.45,
        fill: true, fillColor: '#ff6b5e', fillOpacity: 0.13,
      }).addTo(G.bldgLayer);
    }
    G.bldgLayer.addTo(G.map);
  }

  function pointInPoly(lat, lng, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const yi = pts[i].lat, xi = pts[i].lng, yj = pts[j].lat, xj = pts[j].lng;
      if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function blocked(lat, lng) {
    if (!G.buildingsOn) return false;
    for (const b of G.buildings) {
      if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) continue;
      if (pointInPoly(lat, lng, b.pts)) return true;
    }
    return false;
  }

  /* ---------------- multiplayer sync ---------------- */
  async function syncNow() {
    if (!G || !G.playing) return;
    loadBuildings(G.pos);
    localStorage.setItem('yesp-mg-pos', JSON.stringify({ lat: G.pos.lat, lng: G.pos.lng }));
    try {
      const r = await fetch('/api/world/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: G.token, lat: G.pos.lat, lng: G.pos.lng, heading: G.heading,
          speed: G.speed, mode: G.mode, car: G.carModel, carLat: G.carPos.lat, carLng: G.carPos.lng,
        }),
      });
      const d = await r.json();
      if (d.players) ingestRemotes(d.players);
    } catch (e) {}
  }

  function ingestRemotes(players) {
    const seen = {};
    for (const p of players) {
      seen[p.user] = true;
      let rm = G.remotes[p.user];
      if (!rm) {
        rm = makeRemote(p.user);
        G.remotes[p.user] = rm;
      }
      rm.tgtCar = { lat: p.carLat, lng: p.carLng };
      rm.tgtPos = { lat: p.lat, lng: p.lng };
      rm.heading = p.heading; rm.mode = p.mode; rm.car = CARS[p.car] ? p.car : 'sedan_onyx';
      if (!rm.curCar) rm.curCar = { ...rm.tgtCar };
      if (!rm.curPos) rm.curPos = { ...rm.tgtPos };
    }
    for (const u in G.remotes) if (!seen[u]) { destroyRemote(G.remotes[u]); delete G.remotes[u]; }
  }

  function makeRemote(user) {
    const layer = $('#mg-remotes');
    const carEl = document.createElement('div');
    carEl.className = 'mg-r';
    carEl.innerHTML = `<div class="mg-r-rot"></div><div class="mg-r-label"></div>`;
    layer.appendChild(carEl);
    const personEl = document.createElement('div');
    personEl.className = 'mg-r';
    personEl.innerHTML = `<div class="mg-r-rot"><div class="mg-p-body"></div><div class="mg-p-face"></div></div><div class="mg-r-label"></div>`;
    layer.appendChild(personEl);
    return { user, carEl, personEl, curCar: null, curPos: null, tgtCar: null, tgtPos: null, heading: 0, mode: 'drive', car: 'sedan_onyx' };
  }
  function destroyRemote(rm) { rm.carEl.remove(); rm.personEl.remove(); }

  /* ---------------- main loop ---------------- */
  function loop(now) {
    if (!G) return;
    let dt = (now - G.last) / 1000; G.last = now;
    if (dt > 0.1) dt = 0.1;

    if (G.playing) {
      if (G.inside) {
        stepInterior(dt);
        updateAction();
      } else {
        if (G.mode === 'drive') stepDrive(dt); else stepWalk(dt);
        G.map.setView([G.pos.lat, G.pos.lng], G.map.getZoom(), { animate: false });
        renderLocal();
        renderRemotes(dt);
        updateDoors();
        updateHUD();
        updateAction();
      }
    }
    G.raf = requestAnimationFrame(loop);
  }

  function stepDrive(dt) {
    const car = CARS[G.carModel];
    const r = G.route;
    const top = topMs(G.carModel);
    let target = Math.min(G.setSpeed, top);
    if (r && G.distAlong < r.total) {
      const pos = routePosition(G.distAlong);
      const remain = Math.max(0, r.cum[pos.segIdx + 1] - G.distAlong);
      const brakeBound = Math.sqrt(r.vlim[pos.segIdx + 1] ** 2 + 2 * car.brake * remain);
      target = Math.min(target, brakeBound);
      // drag-tapered acceleration → realistic per car
      const accel = car.accel * Math.max(0.12, 1 - (G.speed / top) ** 2);
      if (G.speed < target) G.speed = Math.min(target, G.speed + accel * dt);
      else G.speed = Math.max(target, G.speed - car.brake * dt);
      G.distAlong += G.speed * dt;
      if (G.distAlong >= r.total) {
        G.distAlong = r.total; G.speed = 0;
        G.pos = { lat: r.rlat[r.n - 1], lng: r.rlng[r.n - 1] };
        G.route = null; clearRoute();
      } else {
        const p2 = routePosition(G.distAlong);
        if (blocked(p2.lat, p2.lng)) {
          // wall ahead (e.g. straight-line shortcut) — stop, don't drive through
          G.distAlong -= G.speed * dt; G.speed = 0;
        } else {
          G.pos = { lat: p2.lat, lng: p2.lng }; G.heading = p2.heading;
        }
      }
    } else {
      G.speed = Math.max(0, G.speed - car.brake * dt);
    }
    G.carPos = { ...G.pos };
  }

  function stepWalk(dt) {
    let dE = 0, dN = 0; const k = G.keys;
    if (G.joy.active) { dE = G.joy.x; dN = G.joy.y; }
    else {
      if (k['w'] || k['arrowup']) dN += 1;
      if (k['s'] || k['arrowdown']) dN -= 1;
      if (k['a'] || k['arrowleft']) dE -= 1;
      if (k['d'] || k['arrowright']) dE += 1;
      if (!(dE || dN) && G.walkTarget) {
        const cl = Math.cos((G.pos.lat * Math.PI) / 180);
        dE = (G.walkTarget.lng - G.pos.lng) * cl; dN = (G.walkTarget.lat - G.pos.lat);
        if (haversine(G.pos, G.walkTarget) < 1.3) { G.walkTarget = null; dE = dN = 0; }
      }
    }
    const mag = Math.hypot(dE, dN);
    let want;
    if (G.joy.active) want = WALK + (RUN - WALK) * Math.max(0, (mag - 0.6) / 0.4);
    else want = k['shift'] ? RUN : WALK;
    let tvE = 0, tvN = 0;
    if (mag > 1e-6) { tvE = (dE / mag) * want; tvN = (dN / mag) * want; }
    G.walkVel.e += (tvE - G.walkVel.e) * Math.min(1, WACC * dt);
    G.walkVel.n += (tvN - G.walkVel.n) * Math.min(1, WACC * dt);
    const spd = Math.hypot(G.walkVel.e, G.walkVel.n);
    if (spd > 0.05) G.heading = (Math.atan2(G.walkVel.e, G.walkVel.n) * 180) / Math.PI;
    G.speed = spd;
    const cl = Math.cos((G.pos.lat * Math.PI) / 180);
    let nlat = G.pos.lat + (G.walkVel.n * dt) / EARTH;
    let nlng = G.pos.lng + (G.walkVel.e * dt) / (EARTH * cl);
    if (blocked(nlat, nlng)) {
      // slide along the wall instead of stopping dead
      if (!blocked(G.pos.lat, nlng)) { nlat = G.pos.lat; }
      else if (!blocked(nlat, G.pos.lng)) { nlng = G.pos.lng; }
      else { nlat = G.pos.lat; nlng = G.pos.lng; G.walkVel.e *= 0.2; G.walkVel.n *= 0.2; }
    }
    G.pos.lat = nlat; G.pos.lng = nlng;
  }

  /* ---------------- rendering ---------------- */
  function renderLocal() {
    const label = $('#mg-mylabel');
    if (G.mode === 'drive') {
      $('#mg-car-rot').style.transform = `rotate(${G.heading}deg)`;
      label.textContent = G.user;
      if (G.parkedEl) { G.parkedEl.remove(); G.parkedEl = null; }
    } else {
      $('#mg-person-rot').style.transform = `rotate(${G.heading}deg)`;
      label.textContent = G.user;
      // draw my parked car on the map
      if (!G.parkedEl) {
        G.parkedEl = document.createElement('div');
        G.parkedEl.className = 'mg-r';
        G.parkedEl.innerHTML = `<div class="mg-r-rot"></div><div class="mg-r-label"></div>`;
        $('#mg-remotes').appendChild(G.parkedEl);
        G.parkedEl.querySelector('.mg-r-rot').innerHTML = carSVG(CARS[G.carModel].color);
        G.parkedEl.querySelector('.mg-r-label').textContent = CARS[G.carModel].name;
      }
      place(G.parkedEl, G.carPos);
    }
  }

  function place(el, ll) {
    const p = G.map.latLngToContainerPoint([ll.lat, ll.lng]);
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  }

  function renderRemotes(dt) {
    const k = 1 - Math.exp(-dt * 10);
    for (const u in G.remotes) {
      const rm = G.remotes[u];
      if (!rm.curCar || !rm.tgtCar) continue;
      rm.curCar.lat += (rm.tgtCar.lat - rm.curCar.lat) * k;
      rm.curCar.lng += (rm.tgtCar.lng - rm.curCar.lng) * k;
      rm.curPos.lat += (rm.tgtPos.lat - rm.curPos.lat) * k;
      rm.curPos.lng += (rm.tgtPos.lng - rm.curPos.lng) * k;

      // car
      const carRot = rm.carEl.querySelector('.mg-r-rot');
      if (carRot.dataset.car !== rm.car) { carRot.innerHTML = carSVG(CARS[rm.car].color); carRot.dataset.car = rm.car; }
      carRot.style.transform = `rotate(${rm.heading}deg)`;
      rm.carEl.querySelector('.mg-r-label').textContent = rm.mode === 'drive' ? rm.user : CARS[rm.car].name;
      place(rm.carEl, rm.curCar);

      // person (only when they're on foot)
      if (rm.mode === 'walk') {
        rm.personEl.style.display = '';
        rm.personEl.querySelector('.mg-r-rot').style.transform = `rotate(${rm.heading}deg)`;
        rm.personEl.querySelector('.mg-r-label').textContent = rm.user;
        place(rm.personEl, rm.curPos);
      } else {
        rm.personEl.style.display = 'none';
      }
    }
  }

  function updateAction() {
    const a = $('#mg-action');
    if (!TOUCH) return;
    if (G.inside) { a.disabled = false; a.textContent = 'Exit (T)'; return; }
    if (G.mode === 'walk') {
      if (G.nearDoor) { a.disabled = false; a.textContent = 'Enter building (T)'; return; }
      const near = haversine(G.pos, G.carPos) <= 10;
      a.disabled = !near;
      a.textContent = near ? 'Enter car (T)' : 'Walk to a car/door';
    } else { a.disabled = false; a.textContent = 'Leave (T)'; }
  }

  /* ---------------- HUD ---------------- */
  function gearRpm(kmh) {
    const g = CARS[G.carModel].gears;
    if (kmh < 1) return { gear: 'N', rpm: IDLE };
    let gi = 1;
    for (let i = 1; i < g.length; i++) if (kmh > g[i]) gi = i + 1;
    gi = Math.min(gi, g.length - 1);
    const frac = Math.max(0, Math.min(1, (kmh - g[gi - 1]) / (g[gi] - g[gi - 1])));
    return { gear: String(gi), rpm: Math.round(IDLE + frac * (REDLINE - IDLE)) };
  }
  function updateHUD() {
    const kmh = G.speed * 3.6;
    const { gear, rpm } = G.mode === 'drive' ? gearRpm(kmh) : { gear: '–', rpm: IDLE };
    $('#mg-kmh').textContent = Math.round(kmh);
    $('#mg-rpm').textContent = rpm;
    $('#mg-gear').textContent = gear;
    drawGauge($('#mg-speedo'), kmh, 260, 0.82);
  }
  function drawGauge(cv, value, max, redFrac) {
    if (!cv) return;
    const ctx = cv.getContext('2d'), w = cv.width, h = cv.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 6;
    ctx.clearRect(0, 0, w, h);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
    ctx.strokeStyle = 'rgba(231,76,60,0.85)';
    ctx.beginPath(); ctx.arc(cx, cy, R, a0 + (a1 - a0) * redFrac, a1); ctx.stroke();
    const frac = Math.max(0, Math.min(1, value / max));
    ctx.lineWidth = 5; ctx.strokeStyle = frac > redFrac ? '#ff6b5e' : '#37c0ff';
    ctx.beginPath(); ctx.arc(cx, cy, R - 12, a0, a0 + (a1 - a0) * frac); ctx.stroke();
    const a = a0 + (a1 - a0) * frac;
    ctx.strokeStyle = '#ffce47'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 6, cy - Math.sin(a) * 6); ctx.lineTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10)); ctx.stroke();
    ctx.fillStyle = '#ffce47'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  }
})();
