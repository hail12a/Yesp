/* =========================================================
   cpubuilder.js — "Silicon" CPU Builder game.

   Loop:  buy components → place them on the blueprint canvas →
   wire their TYPED ports together correctly → the validator decides
   if the CPU "works" → live stats (clock, heat, throttle, power,
   stability, performance) → set a price → an AI buyer decides whether
   to buy based on stats vs price → profit → upgrade nm tech → repeat.

   Everything is self-contained and persists to localStorage.
   Exposes window.wireCpuBuilder(); called by app.js on every render.
   ========================================================= */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const money = n => '$' + Math.round(n).toLocaleString();

  /* ---------------------------------------------------------
     PORT TYPES — a wire is only valid between the SAME type.
     --------------------------------------------------------- */
  const PORT = {
    clk:  { label: 'clock',   color: '#e0a23c' },
    data: { label: 'data',    color: '#3c7fe0' },
    addr: { label: 'address', color: '#9b5de0' },
    ctrl: { label: 'control', color: '#3cb371' },
  };

  /* ---------------------------------------------------------
     COMPONENT CATALOG — each has typed ports with a direction.
       dir 'in'  → consumes a signal   (drawn on the left)
       dir 'out' → produces a signal   (drawn on the right)
       dir 'io'  → bidirectional bus   (drawn on the right)
     A valid wire needs matching TYPE and compatible DIRECTION
     (out↔in, out↔io, io↔in, io↔io — never in↔in or out↔out).
     --------------------------------------------------------- */
  const CATALOG = {
    clock: {
      name: 'Clock Generator', tag: 'CLK', price: 40, color: '#e0a23c',
      desc: 'Drives every timed block. Must reach the Control Unit, ALU, Registers and Memory Controller.',
      ports: [{ id: 'clk', label: 'clk out', type: 'clk', dir: 'out' }],
    },
    control: {
      name: 'Control Unit', tag: 'CU', price: 65, color: '#cf6f5a',
      desc: 'Decodes instructions and steers the ALU with control lines. Needs a clock.',
      ports: [
        { id: 'clk',  label: 'clk',      type: 'clk',  dir: 'in'  },
        { id: 'ctrl', label: 'ctrl out', type: 'ctrl', dir: 'out' },
        { id: 'data', label: 'data',     type: 'data', dir: 'io'  },
      ],
    },
    alu: {
      name: 'ALU', tag: 'ALU', price: 95, color: '#5a8fcf',
      desc: 'The math core. Needs the clock, control lines and a data link to the Registers.',
      ports: [
        { id: 'clk',  label: 'clk',     type: 'clk',  dir: 'in'  },
        { id: 'ctrl', label: 'ctrl',    type: 'ctrl', dir: 'in'  },
        { id: 'a',    label: 'A in',    type: 'data', dir: 'in'  },
        { id: 'data', label: 'result',  type: 'data', dir: 'out' },
      ],
    },
    registers: {
      name: 'Registers', tag: 'REG', price: 70, color: '#7a6fcf',
      desc: 'Fast working store. Sits between the ALU and the Cache.',
      ports: [
        { id: 'clk',  label: 'clk',  type: 'clk',  dir: 'in' },
        { id: 'addr', label: 'addr', type: 'addr', dir: 'in' },
        { id: 'data', label: 'data', type: 'data', dir: 'io' },
      ],
    },
    cacheL1: cacheDef('L1 Cache', 'L1', 55, 1.00, 3, 2, '#3cb38f'),
    cacheL2: cacheDef('L2 Cache', 'L2', 120, 1.16, 7, 5, '#34a37f'),
    cacheL3: cacheDef('L3 Cache', 'L3', 250, 1.34, 14, 10, '#2c8f6f'),
    memctrl: {
      name: 'Memory Controller', tag: 'MC', price: 125, color: '#cf8f5a',
      desc: 'Bridges Cache ↔ Memory ↔ Northbridge and drives the address bus.',
      ports: [
        { id: 'clk',  label: 'clk',      type: 'clk',  dir: 'in'  },
        { id: 'cache',label: 'cache',    type: 'data', dir: 'io'  },
        { id: 'addr', label: 'addr out', type: 'addr', dir: 'out' },
        { id: 'mem',  label: 'mem',      type: 'data', dir: 'io'  },
        { id: 'nb',   label: 'north',    type: 'data', dir: 'io'  },
      ],
    },
    memory: {
      name: 'Memory (RAM)', tag: 'RAM', price: 80, color: '#5acf9f',
      desc: 'Main memory. Addressed by the Memory Controller, reachable by the Northbridge.',
      ports: [
        { id: 'clk',  label: 'clk',  type: 'clk',  dir: 'in' },
        { id: 'addr', label: 'addr', type: 'addr', dir: 'in' },
        { id: 'data', label: 'data', type: 'data', dir: 'io' },
      ],
    },
    northbridge: {
      name: 'Northbridge', tag: 'NB', price: 100, color: '#cf5a8f',
      desc: 'High-speed hub linking the Memory Controller to Memory and the bus.',
      ports: [
        { id: 'clk', label: 'clk',  type: 'clk',  dir: 'in' },
        { id: 'mc',  label: 'mc',   type: 'data', dir: 'io' },
        { id: 'mem', label: 'mem',  type: 'data', dir: 'io' },
      ],
    },
    southbridge: {
      name: 'Southbridge', tag: 'SB', price: 55, color: '#8f8f8f', optional: true,
      desc: 'Optional low-speed I/O hub. Wire it to the Northbridge for a small stability bonus.',
      ports: [
        { id: 'data', label: 'data', type: 'data', dir: 'io' },
        { id: 'ctrl', label: 'io',   type: 'ctrl', dir: 'io' },
      ],
    },
  };
  function cacheDef(name, tag, price, mult, heat, power, color) {
    return {
      name, tag, price, color, cache: { mult, heat, power },
      desc: 'Sits between the Registers and the Memory Controller. Bigger = faster but hotter and pricier.',
      ports: [
        { id: 'clk', label: 'clk', type: 'clk',  dir: 'in' },
        { id: 'reg', label: 'reg', type: 'data', dir: 'io' },
        { id: 'mc',  label: 'mc',  type: 'data', dir: 'io' },
      ],
    };
  }
  // which catalog ids count as a given logical role (cache tiers all = 'cache')
  const roleOf = id => (id.startsWith('cache') ? 'cache' : id);

  /* ---------------------------------------------------------
     REQUIRED COMPONENTS + WIRING RULES — the heart of "it works".
     Each rule = a wire of a given TYPE must exist between a port
     of role `a` and a port of role `b` (either direction).
     --------------------------------------------------------- */
  const REQUIRED = ['clock', 'control', 'alu', 'registers', 'cache', 'memctrl', 'memory', 'northbridge'];
  const RULES = [
    { a: 'clock',   b: 'control',     type: 'clk',  desc: 'Clock → Control Unit' },
    { a: 'clock',   b: 'alu',         type: 'clk',  desc: 'Clock → ALU' },
    { a: 'clock',   b: 'registers',   type: 'clk',  desc: 'Clock → Registers' },
    { a: 'clock',   b: 'memctrl',     type: 'clk',  desc: 'Clock → Memory Controller' },
    { a: 'control', b: 'alu',         type: 'ctrl', desc: 'Control Unit → ALU (control lines)' },
    { a: 'alu',     b: 'registers',   type: 'data', desc: 'ALU ↔ Registers (data)' },
    { a: 'registers', b: 'cache',     type: 'data', desc: 'Registers ↔ Cache (data)' },
    { a: 'cache',   b: 'memctrl',     type: 'data', desc: 'Cache ↔ Memory Controller (data)' },
    { a: 'memctrl', b: 'memory',      type: 'data', desc: 'Memory Controller ↔ Memory (data)' },
    { a: 'memctrl', b: 'memory',      type: 'addr', desc: 'Memory Controller → Memory (address)' },
    { a: 'memctrl', b: 'northbridge', type: 'data', desc: 'Memory Controller ↔ Northbridge (data)' },
    { a: 'northbridge', b: 'memory',  type: 'data', desc: 'Northbridge ↔ Memory (data)' },
  ];

  /* ---------------------------------------------------------
     TECH TIERS (transistor size).  Lower nm = higher clock
     ceiling and far less heat, but each upgrade costs a lot.
     --------------------------------------------------------- */
  const NM_TIERS = [
    { nm: 14, clockCeil: 3.2, heatK: 1.00, upgrade: 0,    fab: 20  },
    { nm: 10, clockCeil: 3.8, heatK: 0.80, upgrade: 400,  fab: 40  },
    { nm: 7,  clockCeil: 4.4, heatK: 0.64, upgrade: 900,  fab: 80  },
    { nm: 5,  clockCeil: 5.0, heatK: 0.50, upgrade: 1800, fab: 160 },
    { nm: 3,  clockCeil: 5.6, heatK: 0.40, upgrade: 3500, fab: 320 },
  ];
  const AMBIENT_C = 35, THROTTLE_C = 88;

  /* ---------------------------------------------------------
     STATE  (persisted)
     --------------------------------------------------------- */
  const SAVE_KEY = 'yesp-cpu-v1';
  const NODE_W = 158, HEAD_H = 34, ROW_H = 26, CANVAS_W = 1280, CANVAS_H = 860;
  let state, pending = null, uidSeq = 1;

  function freshState() {
    return { money: 800, tierIdx: 0, nodes: [], wires: [], price: 1000, log: [] };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s.money === 'number' && Array.isArray(s.nodes)) {
        state = Object.assign(freshState(), s);
        uidSeq = state.nodes.reduce((m, n) => Math.max(m, n.uid + 1), 1);
        return;
      }
    } catch (_) {}
    state = freshState();
  }
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {} };
  const tier = () => NM_TIERS[state.tierIdx];

  /* ---------------------------------------------------------
     GEOMETRY — port positions in canvas pixels.
     --------------------------------------------------------- */
  function portLayout(node) {
    const def = CATALOG[node.type];
    const left = [], right = [];
    def.ports.forEach(p => (p.dir === 'in' ? left : right).push(p));
    const h = HEAD_H + Math.max(left.length, right.length) * ROW_H + 10;
    return { left, right, h, w: NODE_W };
  }
  function portPos(node, portId) {
    const lay = portLayout(node);
    let i = lay.left.findIndex(p => p.id === portId);
    if (i >= 0) return { x: node.x, y: node.y + HEAD_H + i * ROW_H + ROW_H / 2, side: 'l' };
    i = lay.right.findIndex(p => p.id === portId);
    return { x: node.x + NODE_W, y: node.y + HEAD_H + i * ROW_H + ROW_H / 2, side: 'r' };
  }
  const portDef = (type, id) => CATALOG[type].ports.find(p => p.id === id);
  const nodeById = uid => state.nodes.find(n => n.uid === uid);

  /* ---------------------------------------------------------
     WIRE VALIDITY (a single connection) + duplicate guard.
     --------------------------------------------------------- */
  function dirOk(d1, d2) {
    if (d1 === 'io' || d2 === 'io') return true;       // io pairs with anything
    return d1 !== d2;                                   // out↔in only
  }
  function canConnect(aUid, aPort, bUid, bPort) {
    if (aUid === bUid) return { ok: false, why: 'Same component' };
    const na = nodeById(aUid), nb = nodeById(bUid);
    const pa = portDef(na.type, aPort), pb = portDef(nb.type, bPort);
    if (pa.type !== pb.type) return { ok: false, why: `Type mismatch: ${PORT[pa.type].label} ✗ ${PORT[pb.type].label}` };
    if (!dirOk(pa.dir, pb.dir)) return { ok: false, why: `Direction clash: ${pa.dir} ✗ ${pb.dir}` };
    const dup = state.wires.some(w =>
      (w.aUid === aUid && w.aPort === aPort && w.bUid === bUid && w.bPort === bPort) ||
      (w.aUid === bUid && w.aPort === bPort && w.bUid === aUid && w.bPort === aPort));
    if (dup) return { ok: false, why: 'Already wired' };
    return { ok: true, type: pa.type };
  }

  /* ---------------------------------------------------------
     GRAPH VALIDATION — missing parts, unmet rules, orphans.
     --------------------------------------------------------- */
  function validate() {
    const present = {};
    state.nodes.forEach(n => { present[roleOf(n.type)] = (present[roleOf(n.type)] || 0) + 1; });

    const missing = REQUIRED.filter(r => !present[r]);

    // does a valid wire of `type` link any node of role A to any of role B?
    const ruleMet = rule => state.wires.some(w => {
      const na = nodeById(w.aUid), nb = nodeById(w.bUid);
      if (!na || !nb) return false;
      const ta = portDef(na.type, w.aPort), tb = portDef(nb.type, w.bPort);
      if (ta.type !== rule.type || tb.type !== rule.type) return false;
      const ra = roleOf(na.type), rb = roleOf(nb.type);
      return (ra === rule.a && rb === rule.b) || (ra === rule.b && rb === rule.a);
    });
    const unmet = RULES.filter(r => {
      // only enforce a rule if both its endpoints are actually placed
      if (missing.includes(r.a) || missing.includes(r.b)) return false;
      return !ruleMet(r);
    });

    // orphan = a placed node with zero wires
    const wired = new Set();
    state.wires.forEach(w => { wired.add(w.aUid); wired.add(w.bUid); });
    const orphans = state.nodes.filter(n => !wired.has(n.uid));

    const works = missing.length === 0 && unmet.length === 0 && orphans.length === 0;
    return { present, missing, unmet, orphans, works };
  }

  /* ---------------------------------------------------------
     STATS / PHYSICS
     --------------------------------------------------------- */
  function computeStats(v) {
    const t = tier();
    // count valid data buses (parallel data lines) — extra ones lift the clock
    const dataWires = state.wires.filter(w => {
      const na = nodeById(w.aUid); return na && portDef(na.type, w.aPort).type === 'data';
    }).length;
    const reqData = RULES.filter(r => r.type === 'data').length; // baseline data links
    const extraData = Math.max(0, dataWires - reqData);
    const completeness = RULES.length ? (RULES.length - v.unmet.length) / RULES.length : 0;

    // best cache tier placed
    let cacheMult = 1, cacheHeat = 0, cachePower = 0;
    state.nodes.forEach(n => {
      const c = CATALOG[n.type].cache;
      if (c && c.mult > cacheMult) { cacheMult = c.mult; cacheHeat = c.heat; cachePower = c.power; }
    });

    // nominal clock: scales with how complete + how many parallel data lines, capped at the tier ceiling
    let ghz = t.clockCeil * (0.5 + 0.5 * completeness) + 0.08 * extraData;
    ghz = clamp(ghz, 0, t.clockCeil);

    // heat ∝ nm × GHz  (high nm + high GHz = hot)
    let tempC = AMBIENT_C + t.nm * ghz * t.heatK * 0.9 + cacheHeat;

    // thermal throttle: above the threshold the real clock drops
    let throttle = 1;
    if (tempC > THROTTLE_C) {
      throttle = clamp(1 - (tempC - THROTTLE_C) * 0.02, 0.45, 1);
      tempC = AMBIENT_C + t.nm * (ghz * throttle) * t.heatK * 0.9 + cacheHeat; // re-settle with lower clock
    }
    const effGhz = ghz * throttle;

    const powerW = t.nm * effGhz * t.heatK * 0.5 + cachePower + 8;
    const perf = Math.round(effGhz * cacheMult * (1 + 0.04 * extraData) * 100);

    let stability = 100;
    if (tempC > THROTTLE_C) stability -= (tempC - THROTTLE_C) * 1.6;
    if (throttle < 1) stability -= 8;
    if (ghz >= t.clockCeil - 0.001) stability -= 5;          // pinned at the ceiling = brittle
    if (v.present.southbridge && southbridgeWired()) stability += 4;
    stability = clamp(Math.round(stability), 0, 100);

    return { ghz, effGhz, tempC: Math.round(tempC), powerW: Math.round(powerW),
             perf, stability, throttle, cacheMult, extraData, dataWires };
  }
  function southbridgeWired() {
    return state.wires.some(w => {
      const a = nodeById(w.aUid), b = nodeById(w.bUid);
      return (a && a.type === 'southbridge') || (b && b.type === 'southbridge');
    });
  }

  /* ---------------------------------------------------------
     ECONOMY + AI BUYER
     --------------------------------------------------------- */
  function buildCost() {
    return state.nodes.reduce((s, n) => s + CATALOG[n.type].price, 0) + tier().fab;
  }
  function fairValue(st) {
    return Math.round(st.perf * 2.4 + st.stability * 3 + Math.max(0, 95 - st.tempC) * 2);
  }
  function statsQuality(st) {
    const perfNorm = clamp(st.perf / 700, 0, 1);
    const thermNorm = clamp((95 - st.tempC) / 40, 0, 1);
    const stabNorm = st.stability / 100;
    return clamp(0.5 * perfNorm + 0.2 * thermNorm + 0.3 * stabNorm, 0, 1);
  }
  function buyChance(st, works) {
    if (!works) return 0;
    const fv = fairValue(st);
    const ratio = state.price / Math.max(1, fv);
    const priceScore = 1 / (1 + Math.exp((ratio - 1.0) * 6)); // cheap → ~1, dear → ~0
    return clamp(statsQuality(st) * priceScore, 0, 1);
  }

  /* =========================================================
     RENDERING
     ========================================================= */
  let root;
  function build() {
    root = $('#cpu-app');
    if (!root) return;
    load();
    root.innerHTML = `
      <div class="cpu-top">
        <div class="cpu-wallet"><span class="cpu-coin">◈</span> <b id="cpu-money"></b></div>
        <div class="cpu-tierbox">Tech: <b id="cpu-tier"></b></div>
        <div class="cpu-quick" id="cpu-quick"></div>
        <button class="cpu-reset" id="cpu-reset" title="Wipe save and start over">Reset</button>
      </div>
      <div class="cpu-main">
        <aside class="cpu-market">
          <h3>Marketplace</h3>
          <div class="cpu-shop" id="cpu-shop"></div>
          <h3>Fab upgrade</h3>
          <div class="cpu-upg" id="cpu-upg"></div>
        </aside>
        <section class="cpu-build">
          <div class="cpu-toolbar">
            <span class="cpu-vstatus" id="cpu-vstatus"></span>
            <span class="cpu-legend">
              <i style="--c:${PORT.clk.color}"></i>clock
              <i style="--c:${PORT.data.color}"></i>data
              <i style="--c:${PORT.addr.color}"></i>addr
              <i style="--c:${PORT.ctrl.color}"></i>ctrl
            </span>
            <span class="cpu-tools">
              <button id="cpu-arrange" title="Tidy the layout">Auto-arrange</button>
              <button id="cpu-clearwires" title="Remove all wires">Clear wires</button>
            </span>
          </div>
          <div class="cpu-canvas" id="cpu-canvas">
            <svg class="cpu-wires" id="cpu-svg" width="${CANVAS_W}" height="${CANVAS_H}"></svg>
          </div>
          <div class="cpu-errors" id="cpu-errors"></div>
        </section>
        <aside class="cpu-side">
          <h3>Live stats</h3>
          <div class="cpu-stats" id="cpu-stats"></div>
          <h3>Sell to market</h3>
          <div class="cpu-sell" id="cpu-sell"></div>
          <div class="cpu-salelog" id="cpu-salelog"></div>
        </aside>
      </div>`;

    $('#cpu-reset').addEventListener('click', () => {
      if (confirm('Wipe your CPU-builder save and start fresh?')) { state = freshState(); save(); renderAll(); }
    });
    $('#cpu-arrange').addEventListener('click', autoArrange);
    $('#cpu-clearwires').addEventListener('click', () => { state.wires = []; pending = null; save(); renderAll(); });
    $('#cpu-canvas').addEventListener('click', e => { if (e.target.id === 'cpu-canvas' || e.target.id === 'cpu-svg') clearPending(); });

    renderAll();
  }

  function renderAll() {
    if (!root) return;
    $('#cpu-money').textContent = money(state.money);
    const t = tier();
    $('#cpu-tier').textContent = t.nm + ' nm';
    renderShop();
    renderUpg();
    renderCanvas();
    const v = validate();
    const st = computeStats(v);
    renderValidation(v);
    renderStats(v, st);
    renderSell(v, st);
    renderQuick(v, st);
    save();
  }

  function renderQuick(v, st) {
    $('#cpu-quick').innerHTML = v.works
      ? `<span class="ok">● working</span> · ${st.effGhz.toFixed(2)} GHz · ${st.tempC}°C · perf ${st.perf}`
      : `<span class="bad">● incomplete</span> · ${v.missing.length + v.unmet.length + v.orphans.length} issue(s)`;
  }

  /* ---- marketplace ---- */
  function renderShop() {
    const order = ['clock','control','alu','registers','cacheL1','cacheL2','cacheL3','memctrl','memory','northbridge','southbridge'];
    $('#cpu-shop').innerHTML = order.map(id => {
      const c = CATALOG[id];
      const afford = state.money >= c.price;
      const cacheNote = c.cache ? ` · ×${c.cache.mult} perf` : '';
      return `<div class="cpu-item${afford ? '' : ' poor'}">
        <span class="cpu-chip" style="--c:${c.color}">${c.tag}</span>
        <span class="cpu-item-main"><b>${c.name}</b><small>${money(c.price)}${cacheNote}${c.optional ? ' · optional' : ''}</small></span>
        <button class="cpu-buy" data-id="${id}" ${afford ? '' : 'disabled'}>Buy</button>
      </div>`;
    }).join('');
    $$('#cpu-shop .cpu-buy').forEach(b => b.addEventListener('click', () => buyPart(b.dataset.id)));
  }
  function renderUpg() {
    const next = NM_TIERS[state.tierIdx + 1];
    const box = $('#cpu-upg');
    if (!next) { box.innerHTML = `<div class="cpu-upg-max">Maxed at ${tier().nm} nm — peak silicon.</div>`; return; }
    const afford = state.money >= next.upgrade;
    box.innerHTML = `
      <div class="cpu-upg-row">Now: <b>${tier().nm} nm</b> · ceiling ${tier().clockCeil} GHz · heat ×${tier().heatK}</div>
      <div class="cpu-upg-row">Next: <b>${next.nm} nm</b> · ceiling ${next.clockCeil} GHz · heat ×${next.heatK} · fab ${money(next.fab)}/chip</div>
      <button class="cpu-upg-btn" id="cpu-upgbtn" ${afford ? '' : 'disabled'}>Upgrade to ${next.nm} nm — ${money(next.upgrade)}</button>`;
    if (afford) $('#cpu-upgbtn').addEventListener('click', () => {
      state.money -= next.upgrade; state.tierIdx++; renderAll();
    });
  }
  function buyPart(id) {
    const c = CATALOG[id];
    if (state.money < c.price) return;
    state.money -= c.price;
    // cascade placement so new parts don't stack
    const n = state.nodes.length;
    const node = { uid: uidSeq++, type: id,
      x: 60 + (n % 5) * 180 + (n % 2) * 14, y: 60 + Math.floor(n / 5) * 150 };
    node.x = clamp(node.x, 8, CANVAS_W - NODE_W - 8);
    node.y = clamp(node.y, 8, CANVAS_H - 140);
    state.nodes.push(node);
    renderAll();
  }

  /* ---- canvas (nodes + wires) ---- */
  function renderCanvas() {
    const cv = $('#cpu-canvas');
    $$('.cpu-node', cv).forEach(el => el.remove());
    state.nodes.forEach(node => cv.appendChild(nodeEl(node)));
    renderWires();
  }

  function nodeEl(node) {
    const def = CATALOG[node.type];
    const lay = portLayout(node);
    const el = document.createElement('div');
    el.className = 'cpu-node';
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    el.style.width = NODE_W + 'px';
    el.style.height = lay.h + 'px';
    el.style.setProperty('--c', def.color);
    el.dataset.uid = node.uid;

    const portRow = (p, side) => {
      const sel = pending && pending.uid === node.uid && pending.port === p.id;
      const compatible = pending && !sel ? canConnect(pending.uid, pending.port, node.uid, p.id).ok : false;
      return `<div class="cpu-prow ${side}">
        <span class="cpu-dot ${sel ? 'sel' : ''} ${compatible ? 'compat' : ''}" style="--pc:${PORT[p.type].color}"
              data-uid="${node.uid}" data-port="${p.id}" title="${PORT[p.type].label} · ${p.dir}"></span>
        <span class="cpu-plabel">${p.label}</span>
      </div>`;
    };
    el.innerHTML = `
      <div class="cpu-node-head" data-drag="${node.uid}">
        <span class="cpu-chip sm" style="--c:${def.color}">${def.tag}</span>
        <span class="cpu-node-name">${def.name}</span>
        <button class="cpu-node-x" data-del="${node.uid}" title="Remove (70% refund)">×</button>
      </div>
      <div class="cpu-ports">
        <div class="cpu-pcol l">${lay.left.map(p => portRow(p, 'l')).join('')}</div>
        <div class="cpu-pcol r">${lay.right.map(p => portRow(p, 'r')).join('')}</div>
      </div>`;

    el.querySelector('[data-drag]').addEventListener('pointerdown', e => startDrag(e, node));
    el.querySelector('[data-del]').addEventListener('click', e => { e.stopPropagation(); delNode(node.uid); });
    $$('.cpu-dot', el).forEach(d => d.addEventListener('click', e => {
      e.stopPropagation(); onPortClick(+d.dataset.uid, d.dataset.port);
    }));
    return el;
  }

  function renderWires() {
    const svg = $('#cpu-svg');
    let paths = '';
    state.wires.forEach((w, i) => {
      const na = nodeById(w.aUid), nb = nodeById(w.bUid);
      if (!na || !nb) return;
      const pa = portPos(na, w.aPort), pb = portPos(nb, w.bPort);
      const type = portDef(na.type, w.aPort).type;
      const dx = Math.max(40, Math.abs(pb.x - pa.x) * 0.5);
      const c1x = pa.x + (pa.side === 'r' ? dx : -dx);
      const c2x = pb.x + (pb.side === 'r' ? dx : -dx);
      const d = `M${pa.x},${pa.y} C${c1x},${pa.y} ${c2x},${pb.y} ${pb.x},${pb.y}`;
      paths += `<path class="cpu-wire" data-w="${i}" d="${d}" stroke="${PORT[type].color}"/>`;
      paths += `<path class="cpu-wire-hit" data-w="${i}" d="${d}"/>`;
    });
    svg.innerHTML = paths;
    $$('.cpu-wire-hit', svg).forEach(p => p.addEventListener('click', e => {
      e.stopPropagation();
      const idx = +p.dataset.w;
      state.wires.splice(idx, 1);
      save(); renderAll();
    }));
  }

  /* ---- wiring interaction ---- */
  function onPortClick(uid, port) {
    if (!pending) { pending = { uid, port }; flash(''); renderCanvas(); return; }
    if (pending.uid === uid && pending.port === port) { clearPending(); return; }
    const res = canConnect(pending.uid, pending.port, uid, port);
    if (!res.ok) { flash('✗ ' + res.why, true); return; }
    state.wires.push({ aUid: pending.uid, aPort: pending.port, bUid: uid, bPort: port });
    pending = null; save(); renderAll();
  }
  function clearPending() { if (pending) { pending = null; renderCanvas(); } }
  function flash(msg, bad) {
    const el = $('#cpu-vstatus'); if (!el) return;
    if (msg) { el.dataset.flash = bad ? 'bad' : 'ok'; el.textContent = msg;
      setTimeout(() => { delete el.dataset.flash; renderValidation(validate()); }, 1800); }
  }

  /* ---- drag ---- */
  function startDrag(e, node) {
    e.preventDefault();
    const cv = $('#cpu-canvas');
    const rect = cv.getBoundingClientRect();
    const offX = e.clientX - rect.left - node.x + cv.scrollLeft;
    const offY = e.clientY - rect.top - node.y + cv.scrollTop;
    const el = cv.querySelector(`.cpu-node[data-uid="${node.uid}"]`);
    el.classList.add('dragging');
    const move = ev => {
      node.x = clamp(ev.clientX - rect.left - offX + cv.scrollLeft, 0, CANVAS_W - NODE_W);
      node.y = clamp(ev.clientY - rect.top - offY + cv.scrollTop, 0, CANVAS_H - portLayout(node).h);
      el.style.left = node.x + 'px'; el.style.top = node.y + 'px';
      renderWires();
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      el.classList.remove('dragging'); save();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function delNode(uid) {
    const node = nodeById(uid);
    if (!node) return;
    state.money += Math.round(CATALOG[node.type].price * 0.7);   // 70% refund
    state.nodes = state.nodes.filter(n => n.uid !== uid);
    state.wires = state.wires.filter(w => w.aUid !== uid && w.bUid !== uid);
    if (pending && pending.uid === uid) pending = null;
    renderAll();
  }

  function autoArrange() {
    // tidy columns by role for readability
    const cols = [['clock'], ['control'], ['alu', 'registers'], ['cacheL1','cacheL2','cacheL3'],
                  ['memctrl'], ['memory', 'northbridge', 'southbridge']];
    const colX = i => 40 + i * 195;
    const used = {};
    state.nodes.forEach(n => {
      let ci = cols.findIndex(arr => arr.includes(n.type));
      if (ci < 0) ci = cols.length - 1;
      used[ci] = (used[ci] || 0);
      n.x = clamp(colX(ci), 8, CANVAS_W - NODE_W - 8);
      n.y = 40 + used[ci] * 165;
      used[ci]++;
    });
    save(); renderCanvas();
  }

  /* ---- validation panel ---- */
  function renderValidation(v) {
    const s = $('#cpu-vstatus');
    if (s && !s.dataset.flash) {
      s.textContent = v.works ? '✔ Valid CPU — ready to sell' :
        `✗ ${v.missing.length + v.unmet.length + v.orphans.length} issue(s) to fix`;
      s.className = 'cpu-vstatus ' + (v.works ? 'good' : 'bad');
    }
    const errs = [];
    v.missing.forEach(m => {
      const name = m === 'cache' ? 'Cache (L1, L2 or L3)' : CATALOG[m].name;
      errs.push(`<li class="miss">Missing component: <b>${name}</b></li>`);
    });
    v.unmet.forEach(r => errs.push(`<li class="rule">Not wired: <b>${r.desc}</b></li>`));
    v.orphans.forEach(o => errs.push(`<li class="orph">Unwired part: <b>${CATALOG[o.type].name}</b> (wire it or remove it)</li>`));
    $('#cpu-errors').innerHTML = errs.length
      ? `<ul class="cpu-errlist">${errs.join('')}</ul>`
      : `<div class="cpu-allgood">✔ Every required block is present and correctly wired.</div>`;
  }
  /* ---- stats panel ---- */
  function renderStats(v, st) {
    const ceil = tier().clockCeil;
    const bar = (label, val, txt, cls) =>
      `<div class="cpu-stat"><span>${label}</span><div class="cpu-bar"><i class="${cls}" style="width:${clamp(val,0,100)}%"></i></div><b>${txt}</b></div>`;
    $('#cpu-stats').innerHTML =
      bar('Clock', (st.effGhz / 5.6) * 100, st.effGhz.toFixed(2) + ' GHz', 'c-clk') +
      bar('Heat', (st.tempC / 110) * 100, st.tempC + ' °C' + (st.throttle < 1 ? ' ⚠' : ''), st.tempC > THROTTLE_C ? 'c-hot' : 'c-cool') +
      bar('Power', (st.powerW / 140) * 100, st.powerW + ' W', 'c-pow') +
      bar('Stability', st.stability, st.stability + ' %', 'c-stab') +
      `<div class="cpu-perf">Performance score <b>${v.works ? st.perf : '—'}</b>
        <small>${st.throttle < 1 ? `thermal throttle active (×${st.throttle.toFixed(2)})` :
                 v.works ? `clock ceiling ${ceil} GHz · ${st.dataWires} data lines` : 'finish wiring to score'}</small></div>`;
  }

  /* ---- sell panel + AI buyer ---- */
  function renderSell(v, st) {
    const cost = buildCost();
    const fv = v.works ? fairValue(st) : 0;
    const chance = buyChance(st, v.works);
    $('#cpu-sell').innerHTML = `
      <div class="cpu-sell-row">Build cost <b>${money(cost)}</b> <small>(parts + ${money(tier().fab)} fab)</small></div>
      <div class="cpu-sell-row">Buyer's fair value <b>${v.works ? money(fv) : '—'}</b></div>
      <label class="cpu-price">Your price
        <input type="number" id="cpu-price" min="1" step="10" value="${state.price}" ${v.works ? '' : 'disabled'}/>
      </label>
      <div class="cpu-chance">
        <div class="cpu-bar big"><i class="c-chance" style="width:${Math.round(chance*100)}%"></i></div>
        <b>${v.works ? Math.round(chance*100) + '% buy chance' : 'CPU not working'}</b>
      </div>
      <div class="cpu-margin ${state.price - cost >= 0 ? 'pos' : 'neg'}">
        Margin if sold: <b>${money(state.price - cost)}</b></div>
      <button class="cpu-list" id="cpu-list" ${v.works ? '' : 'disabled'}>List for sale</button>`;

    const priceInput = $('#cpu-price');
    if (priceInput) priceInput.addEventListener('input', () => {
      state.price = Math.max(1, parseInt(priceInput.value, 10) || 1);
      const v2 = validate(); const st2 = computeStats(v2);
      const ch = buyChance(st2, v2.works);
      $('.cpu-chance .c-chance').style.width = Math.round(ch*100) + '%';
      $('.cpu-chance b').textContent = Math.round(ch*100) + '% buy chance';
      const m = state.price - buildCost();
      const mEl = $('.cpu-margin');
      mEl.className = 'cpu-margin ' + (m >= 0 ? 'pos' : 'neg');
      mEl.innerHTML = `Margin if sold: <b>${money(m)}</b>`;
      save();
    });
    const listBtn = $('#cpu-list');
    if (listBtn) listBtn.addEventListener('click', () => listForSale());
    renderLog();
  }

  function listForSale() {
    const v = validate();
    if (!v.works) return;
    const st = computeStats(v);
    const chance = buyChance(st, true);
    const cost = buildCost();
    const sold = Math.random() < chance;
    if (sold) {
      state.money += state.price;
      pushLog(`✔ SOLD for ${money(state.price)} — margin ${money(state.price - cost)} · perf ${st.perf}, ${st.effGhz.toFixed(2)}GHz, ${st.tempC}°C`, 'ok');
      // the chip ships out: its components are consumed
      state.nodes = []; state.wires = []; pending = null;
    } else {
      pushLog(`✗ Buyers passed at ${money(state.price)} (${Math.round(chance*100)}% chance). Drop the price or improve the chip.`, 'bad');
    }
    renderAll();
  }
  function pushLog(text, cls) {
    state.log.unshift({ text, cls, t: Date.now() });
    state.log = state.log.slice(0, 8);
  }
  function renderLog() {
    $('#cpu-salelog').innerHTML = state.log.length
      ? state.log.map(e => `<div class="cpu-logline ${e.cls}">${e.text}</div>`).join('')
      : `<div class="cpu-logline muted">No sales yet — build a CPU and list it.</div>`;
  }

  /* ---------------------------------------------------------
     PUBLIC ENTRY — called by app.js after every route render.
     --------------------------------------------------------- */
  window.wireCpuBuilder = function wireCpuBuilder() {
    if (!$('#cpu-app')) return;   // not on the CPU builder page
    pending = null;
    build();
  };
})();
