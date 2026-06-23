/* cpubuilder.js — Silicon CPU Builder v3 */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const money = n => '$' + Math.round(n).toLocaleString();
  const starsStr = n => '★'.repeat(clamp(n,0,5)) + '☆'.repeat(clamp(5-n,0,5));
  const fmt1 = n => +n.toFixed(1);
  const fmt2 = n => +n.toFixed(2);

  const PORT = {
    clk:  { label: 'clock',   color: '#e0a23c' },
    data: { label: 'data',    color: '#3c7fe0' },
    addr: { label: 'address', color: '#9b5de0' },
    ctrl: { label: 'control', color: '#3cb371' },
  };

  function cacheDef(name, tag, price, mult, heat, power, color) {
    return {
      name, tag, price, color, cache: { mult, heat, power },
      desc: 'Sits between Registers and Memory Controller. Bigger = faster but hotter.',
      ports: [
        { id: 'clk', label: 'clk', type: 'clk',  dir: 'in' },
        { id: 'reg', label: 'reg', type: 'data', dir: 'io' },
        { id: 'mc',  label: 'mc',  type: 'data', dir: 'io' },
      ],
    };
  }

  const CATALOG = {
    clock: {
      name: 'Clock Generator', tag: 'CLK', price: 40, color: '#e0a23c',
      desc: 'Drives every timed block.',
      ports: [{ id: 'clk', label: 'clk out', type: 'clk', dir: 'out' }],
    },
    control: {
      name: 'Control Unit', tag: 'CU', price: 65, color: '#cf6f5a',
      desc: 'Decodes instructions and steers the ALU with control lines.',
      ports: [
        { id: 'clk',  label: 'clk',     type: 'clk',  dir: 'in'  },
        { id: 'ctrl', label: 'ctrl out', type: 'ctrl', dir: 'out' },
        { id: 'data', label: 'data',     type: 'data', dir: 'io'  },
      ],
    },
    alu: {
      name: 'ALU', tag: 'ALU', price: 95, color: '#5a8fcf',
      desc: 'Arithmetic Logic Unit. Core integer computation engine.',
      ports: [
        { id: 'clk',  label: 'clk',    type: 'clk',  dir: 'in'  },
        { id: 'ctrl', label: 'ctrl',   type: 'ctrl', dir: 'in'  },
        { id: 'a',    label: 'A in',   type: 'data', dir: 'in'  },
        { id: 'data', label: 'result', type: 'data', dir: 'out' },
      ],
    },
    fpu: {
      name: 'FPU', tag: 'FPU', price: 85, color: '#5a6bcf', optional: true,
      desc: 'Floating Point Unit. Boosts decimal math by +12% perf.',
      ports: [
        { id: 'clk',  label: 'clk',  type: 'clk',  dir: 'in' },
        { id: 'ctrl', label: 'ctrl', type: 'ctrl', dir: 'in' },
        { id: 'data', label: 'data', type: 'data', dir: 'io' },
      ],
    },
    decoder: {
      name: 'Instruction Decoder', tag: 'DEC', price: 60, color: '#9b5de0', optional: true,
      desc: 'Converts instructions to micro-ops. Boosts perf +5%.',
      ports: [
        { id: 'clk',  label: 'clk', type: 'clk',  dir: 'in'  },
        { id: 'ctrl', label: 'in',  type: 'ctrl', dir: 'in'  },
        { id: 'out',  label: 'out', type: 'ctrl', dir: 'out' },
        { id: 'data', label: 'ops', type: 'data', dir: 'out' },
      ],
    },
    pipeline: {
      name: 'Pipeline Stage', tag: 'PPL', price: 90, color: '#cf8a3c', optional: true,
      desc: 'Adds pipeline depth. Each stage boosts throughput by +8% (max 3 stages).',
      ports: [
        { id: 'clk', label: 'clk', type: 'clk',  dir: 'in'  },
        { id: 'in',  label: 'in',  type: 'data', dir: 'in'  },
        { id: 'out', label: 'out', type: 'data', dir: 'out' },
      ],
    },
    core: {
      name: 'CPU Core', tag: 'COR', price: 180, color: '#cf4a6e', optional: true,
      desc: 'Extra execution core for multi-core processing. +35% perf per core (max 4).',
      ports: [
        { id: 'clk',  label: 'clk',  type: 'clk',  dir: 'in' },
        { id: 'ctrl', label: 'ctrl', type: 'ctrl', dir: 'in' },
        { id: 'data', label: 'data', type: 'data', dir: 'io' },
        { id: 'addr', label: 'addr', type: 'addr', dir: 'in' },
      ],
    },
    bpred: {
      name: 'Branch Predictor', tag: 'BPR', price: 75, color: '#3c8fcf', optional: true,
      desc: 'Speculatively fetches instructions. Boosts perf +6% and clock +0.1 GHz.',
      ports: [
        { id: 'clk',  label: 'clk',  type: 'clk',  dir: 'in' },
        { id: 'ctrl', label: 'ctrl', type: 'ctrl', dir: 'io' },
        { id: 'data', label: 'data', type: 'data', dir: 'in' },
      ],
    },
    pwr: {
      name: 'Power Delivery', tag: 'PWR', price: 45, color: '#8f8f3c', optional: true,
      desc: 'Voltage regulation. Reduces heat 12%, adds +5% stability.',
      ports: [
        { id: 'ctrl', label: 'ctrl', type: 'ctrl', dir: 'io' },
      ],
    },
    registers: {
      name: 'Registers', tag: 'REG', price: 70, color: '#7a6fcf',
      desc: 'Fast working store between ALU and Cache.',
      ports: [
        { id: 'clk',  label: 'clk',  type: 'clk',  dir: 'in' },
        { id: 'addr', label: 'addr', type: 'addr', dir: 'in' },
        { id: 'data', label: 'data', type: 'data', dir: 'io' },
      ],
    },
    cacheL1: cacheDef('L1 Cache', 'L1', 55,  1.00, 3,  2,  '#3cb38f'),
    cacheL2: cacheDef('L2 Cache', 'L2', 120, 1.16, 7,  5,  '#34a37f'),
    cacheL3: cacheDef('L3 Cache', 'L3', 250, 1.34, 14, 10, '#2c8f6f'),
    memctrl: {
      name: 'Memory Controller', tag: 'MC', price: 125, color: '#cf8f5a',
      desc: 'Bridges Cache ↔ Memory ↔ Northbridge.',
      ports: [
        { id: 'clk',   label: 'clk',     type: 'clk',  dir: 'in'  },
        { id: 'cache', label: 'cache',    type: 'data', dir: 'io'  },
        { id: 'addr',  label: 'addr out', type: 'addr', dir: 'out' },
        { id: 'mem',   label: 'mem',      type: 'data', dir: 'io'  },
        { id: 'nb',    label: 'north',    type: 'data', dir: 'io'  },
      ],
    },
    memory: {
      name: 'Memory (RAM)', tag: 'RAM', price: 80, color: '#5acf9f',
      desc: 'Main memory.',
      ports: [
        { id: 'clk',  label: 'clk',  type: 'clk',  dir: 'in' },
        { id: 'addr', label: 'addr', type: 'addr', dir: 'in' },
        { id: 'data', label: 'data', type: 'data', dir: 'io' },
      ],
    },
    northbridge: {
      name: 'Northbridge', tag: 'NB', price: 100, color: '#cf5a8f',
      desc: 'High-speed hub linking Memory Controller to Memory.',
      ports: [
        { id: 'clk', label: 'clk', type: 'clk',  dir: 'in' },
        { id: 'mc',  label: 'mc',  type: 'data', dir: 'io' },
        { id: 'mem', label: 'mem', type: 'data', dir: 'io' },
      ],
    },
    southbridge: {
      name: 'Southbridge', tag: 'SB', price: 55, color: '#8f8f8f', optional: true,
      desc: 'Low-speed I/O hub. Wire to Northbridge for +4% stability.',
      ports: [
        { id: 'data', label: 'data', type: 'data', dir: 'io' },
        { id: 'ctrl', label: 'io',   type: 'ctrl', dir: 'io' },
      ],
    },
  };

  const roleOf = id => id.startsWith('cache') ? 'cache' : id;

  const REQUIRED = ['clock','control','alu','registers','cache','memctrl','memory','northbridge'];
  const RULES = [
    { a: 'clock',       b: 'control',     type: 'clk',  desc: 'Clock → Control Unit' },
    { a: 'clock',       b: 'alu',         type: 'clk',  desc: 'Clock → ALU' },
    { a: 'clock',       b: 'registers',   type: 'clk',  desc: 'Clock → Registers' },
    { a: 'clock',       b: 'memctrl',     type: 'clk',  desc: 'Clock → Memory Controller' },
    { a: 'control',     b: 'alu',         type: 'ctrl', desc: 'Control Unit → ALU (control lines)' },
    { a: 'alu',         b: 'registers',   type: 'data', desc: 'ALU ↔ Registers (data)' },
    { a: 'registers',   b: 'cache',       type: 'data', desc: 'Registers ↔ Cache (data)' },
    { a: 'cache',       b: 'memctrl',     type: 'data', desc: 'Cache ↔ Memory Controller (data)' },
    { a: 'memctrl',     b: 'memory',      type: 'data', desc: 'Memory Controller ↔ Memory (data)' },
    { a: 'memctrl',     b: 'memory',      type: 'addr', desc: 'Memory Controller → Memory (address)' },
    { a: 'memctrl',     b: 'northbridge', type: 'data', desc: 'Memory Controller ↔ Northbridge (data)' },
    { a: 'northbridge', b: 'memory',      type: 'data', desc: 'Northbridge ↔ Memory (data)' },
  ];

  /* NM TIERS */
  const NM_TIERS = [
    { nm: 90,  clockCeil: 0.5,  heatK: 3.2,  researchCost: 0,     researchSec: 0,   fab: 5   },
    { nm: 65,  clockCeil: 1.0,  heatK: 2.6,  researchCost: 300,   researchSec: 30,  fab: 10  },
    { nm: 45,  clockCeil: 1.8,  heatK: 2.0,  researchCost: 700,   researchSec: 60,  fab: 20  },
    { nm: 32,  clockCeil: 2.6,  heatK: 1.55, researchCost: 1500,  researchSec: 90,  fab: 40  },
    { nm: 22,  clockCeil: 3.4,  heatK: 1.15, researchCost: 3500,  researchSec: 120, fab: 80  },
    { nm: 14,  clockCeil: 4.2,  heatK: 0.82, researchCost: 7000,  researchSec: 150, fab: 160 },
    { nm: 10,  clockCeil: 4.8,  heatK: 0.60, researchCost: 15000, researchSec: 180, fab: 320 },
    { nm: 7,   clockCeil: 5.6,  heatK: 0.42, researchCost: 30000, researchSec: 240, fab: 640 },
  ];
  const AMBIENT_C = 35, THROTTLE_C = 88;

  /* DIE SIZE — base mm² at 45nm reference node */
  const DIE_BASE_45 = {
    clock: 1, control: 2, alu: 4, fpu: 3, decoder: 1.5, pipeline: 0.5,
    core: 8, bpred: 1, pwr: 3, registers: 1.5,
    cacheL1: 2,      // per 32 KB
    cacheL2: 4,      // per 256 KB
    cacheL3: 6,      // per MB
    memctrl: 5, memory: 8, northbridge: 8, southbridge: 3,
  };

  /* DEFAULT PROPS per block type */
  function defaultProps(type) {
    const d = {
      label: '', voltage: 1.1, powerW: null,
    };
    if (type === 'clock')      return { ...d, voltage: 1.1, baseMhz: 100, multiplier: 32 };
    if (type === 'control')    return { ...d, voltage: 1.1, bpType: 'dynamic' };
    if (type === 'alu')        return { ...d, voltage: 1.1, ghz: null, pipelineStages: 4, execUnits: 2 };
    if (type === 'fpu')        return { ...d, voltage: 1.1, ghz: null, pipelineStages: 4, execUnits: 1 };
    if (type === 'decoder')    return { ...d, voltage: 1.0 };
    if (type === 'pipeline')   return { ...d, voltage: 1.0, stageDepth: 4, stallPenalty: 2 };
    if (type === 'core')       return { ...d, voltage: 1.1, coreCount: 1, ghz: null };
    if (type === 'bpred')      return { ...d, voltage: 1.0 };
    if (type === 'pwr')        return { ...d, voltage: 1.0, tdpCap: 65, vrEfficiency: 90 };
    if (type === 'registers')  return { ...d, voltage: 1.0, regCount: 32, regWidth: 64 };
    if (type === 'cacheL1')    return { ...d, voltage: 1.0, sizeKB: 32,  assoc: 8,  latency: 4  };
    if (type === 'cacheL2')    return { ...d, voltage: 1.0, sizeKB: 256, assoc: 8,  latency: 12 };
    if (type === 'cacheL3')    return { ...d, voltage: 1.0, sizeMB: 6,   assoc: 16, latency: 40 };
    if (type === 'memctrl')    return { ...d, voltage: 1.0, channels: 2, maxBandwidthGBs: 38.4 };
    if (type === 'memory')     return { ...d, voltage: 1.35 };
    if (type === 'northbridge')return { ...d, voltage: 1.0, busWidth: 64, busMhz: 800 };
    if (type === 'southbridge')return { ...d, voltage: 1.0 };
    return d;
  }

  /* HISTORICAL BLUEPRINTS */
  const BLUEPRINTS = [
    {
      id: 'athlon64', name: 'AMD Athlon 64',
      year: 2003, nmEra: 130, ghzEra: 2.0,
      desc: 'K8 — first x86-64 consumer CPU. Integrated memory controller. 130nm.',
      components: ['clock','control','alu','fpu','registers','cacheL1','cacheL2','memctrl','memory','northbridge'],
      wires: [
        ['clock','clk','control','clk'], ['clock','clk','alu','clk'],
        ['clock','clk','registers','clk'], ['clock','clk','memctrl','clk'],
        ['clock','clk','fpu','clk'],
        ['control','ctrl','alu','ctrl'],
        ['alu','data','registers','data'], ['alu','data','fpu','data'],
        ['control','ctrl','fpu','ctrl'],
        ['registers','data','cacheL1','reg'],
        ['cacheL1','mc','cacheL2','reg'], ['cacheL2','mc','memctrl','cache'],
        ['memctrl','mem','memory','data'], ['memctrl','addr','memory','addr'],
        ['memctrl','nb','northbridge','mc'], ['northbridge','mem','memory','data'],
      ],
    },
    {
      id: 'pentiumII', name: 'Intel Pentium II',
      year: 1997, nmEra: 250, ghzEra: 0.333,
      desc: 'P6 Slot 1. Klamath/Deschutes — 250nm, 233–333 MHz.',
      components: ['clock','control','alu','fpu','registers','cacheL1','memctrl','memory','northbridge','southbridge'],
      wires: [
        ['clock','clk','control','clk'], ['clock','clk','alu','clk'],
        ['clock','clk','registers','clk'], ['clock','clk','memctrl','clk'],
        ['clock','clk','fpu','clk'],
        ['control','ctrl','alu','ctrl'],
        ['alu','data','registers','data'], ['alu','data','fpu','data'],
        ['control','ctrl','fpu','ctrl'],
        ['registers','data','cacheL1','reg'], ['cacheL1','mc','memctrl','cache'],
        ['memctrl','mem','memory','data'], ['memctrl','addr','memory','addr'],
        ['memctrl','nb','northbridge','mc'], ['northbridge','mem','memory','data'],
        ['northbridge','mem','southbridge','data'],
      ],
    },
    {
      id: 'pentium4', name: 'Intel Pentium 4',
      year: 2000, nmEra: 180, ghzEra: 1.5,
      desc: 'Willamette/Northwood. NetBurst 20-stage pipeline.',
      components: ['clock','control','decoder','alu','fpu','pipeline','registers','cacheL1','cacheL2','memctrl','memory','northbridge','southbridge'],
      wires: [
        ['clock','clk','control','clk'], ['clock','clk','alu','clk'],
        ['clock','clk','decoder','clk'], ['clock','clk','pipeline','clk'],
        ['clock','clk','registers','clk'], ['clock','clk','memctrl','clk'],
        ['clock','clk','fpu','clk'],
        ['control','ctrl','alu','ctrl'],
        ['control','ctrl','decoder','ctrl'], ['decoder','out','alu','ctrl'],
        ['alu','data','pipeline','in'], ['pipeline','out','registers','data'],
        ['alu','data','fpu','data'], ['control','ctrl','fpu','ctrl'],
        ['registers','data','cacheL1','reg'],
        ['cacheL1','mc','cacheL2','reg'], ['cacheL2','mc','memctrl','cache'],
        ['memctrl','mem','memory','data'], ['memctrl','addr','memory','addr'],
        ['memctrl','nb','northbridge','mc'], ['northbridge','mem','memory','data'],
        ['northbridge','mem','southbridge','data'],
      ],
    },
    {
      id: 'core2duo', name: 'Intel Core 2 Duo',
      year: 2006, nmEra: 65, ghzEra: 2.4,
      desc: 'Conroe — 65nm. Massive IPC gain over NetBurst.',
      components: ['clock','control','decoder','bpred','alu','fpu','registers','cacheL1','cacheL2','cacheL3','memctrl','memory','northbridge'],
      wires: [
        ['clock','clk','control','clk'], ['clock','clk','alu','clk'],
        ['clock','clk','decoder','clk'], ['clock','clk','bpred','clk'],
        ['clock','clk','registers','clk'], ['clock','clk','memctrl','clk'],
        ['clock','clk','fpu','clk'],
        ['control','ctrl','alu','ctrl'],
        ['control','ctrl','bpred','ctrl'], ['bpred','ctrl','decoder','ctrl'],
        ['decoder','out','alu','ctrl'],
        ['alu','data','registers','data'], ['alu','data','fpu','data'],
        ['control','ctrl','fpu','ctrl'],
        ['registers','data','cacheL1','reg'],
        ['cacheL1','mc','cacheL2','reg'], ['cacheL2','mc','cacheL3','reg'],
        ['cacheL3','mc','memctrl','cache'],
        ['memctrl','mem','memory','data'], ['memctrl','addr','memory','addr'],
        ['memctrl','nb','northbridge','mc'], ['northbridge','mem','memory','data'],
      ],
    },
    {
      id: 'i7920', name: 'Intel Core i7-920',
      year: 2008, nmEra: 45, ghzEra: 2.67,
      desc: 'Nehalem — 45nm. First Core i7 with on-die memory controller.',
      components: ['clock','control','decoder','bpred','alu','fpu','core','registers','cacheL1','cacheL2','cacheL3','memctrl','memory','northbridge','pwr'],
      wires: [
        ['clock','clk','control','clk'], ['clock','clk','alu','clk'],
        ['clock','clk','decoder','clk'], ['clock','clk','bpred','clk'],
        ['clock','clk','registers','clk'], ['clock','clk','memctrl','clk'],
        ['clock','clk','core','clk'], ['clock','clk','fpu','clk'],
        ['control','ctrl','alu','ctrl'],
        ['control','ctrl','bpred','ctrl'], ['bpred','ctrl','decoder','ctrl'],
        ['decoder','out','alu','ctrl'],
        ['control','ctrl','core','ctrl'], ['alu','data','core','data'],
        ['alu','data','registers','data'], ['alu','data','fpu','data'],
        ['control','ctrl','fpu','ctrl'], ['control','ctrl','pwr','ctrl'],
        ['registers','data','cacheL1','reg'],
        ['cacheL1','mc','cacheL2','reg'], ['cacheL2','mc','cacheL3','reg'],
        ['cacheL3','mc','memctrl','cache'],
        ['memctrl','mem','memory','data'], ['memctrl','addr','memory','addr'],
        ['memctrl','nb','northbridge','mc'], ['northbridge','mem','memory','data'],
      ],
    },
    {
      id: 'i54570', name: 'Intel Core i5-4570',
      year: 2013, nmEra: 22, ghzEra: 3.2,
      desc: 'Haswell — 22nm. AVX2, 3.2 GHz base.',
      components: ['clock','control','decoder','bpred','alu','fpu','pipeline','registers','cacheL1','cacheL2','cacheL3','memctrl','memory','northbridge','pwr'],
      wires: [
        ['clock','clk','control','clk'], ['clock','clk','alu','clk'],
        ['clock','clk','decoder','clk'], ['clock','clk','bpred','clk'],
        ['clock','clk','pipeline','clk'], ['clock','clk','registers','clk'],
        ['clock','clk','memctrl','clk'], ['clock','clk','fpu','clk'],
        ['control','ctrl','alu','ctrl'],
        ['control','ctrl','bpred','ctrl'], ['bpred','ctrl','decoder','ctrl'],
        ['decoder','out','alu','ctrl'],
        ['alu','data','pipeline','in'], ['pipeline','out','registers','data'],
        ['alu','data','fpu','data'], ['control','ctrl','fpu','ctrl'],
        ['control','ctrl','pwr','ctrl'],
        ['registers','data','cacheL1','reg'],
        ['cacheL1','mc','cacheL2','reg'], ['cacheL2','mc','cacheL3','reg'],
        ['cacheL3','mc','memctrl','cache'],
        ['memctrl','mem','memory','data'], ['memctrl','addr','memory','addr'],
        ['memctrl','nb','northbridge','mc'], ['northbridge','mem','memory','data'],
      ],
    },
    {
      id: 'xeonE31245', name: 'Intel Xeon E3-1245 v3',
      year: 2013, nmEra: 22, ghzEra: 3.4,
      desc: 'Haswell server — 22nm. ECC, quad-core + HT.',
      components: ['clock','control','decoder','bpred','alu','fpu','pipeline','core','registers','cacheL1','cacheL2','cacheL3','memctrl','memory','northbridge','southbridge','pwr'],
      wires: [
        ['clock','clk','control','clk'], ['clock','clk','alu','clk'],
        ['clock','clk','decoder','clk'], ['clock','clk','bpred','clk'],
        ['clock','clk','pipeline','clk'], ['clock','clk','registers','clk'],
        ['clock','clk','memctrl','clk'], ['clock','clk','core','clk'],
        ['clock','clk','fpu','clk'],
        ['control','ctrl','alu','ctrl'],
        ['control','ctrl','bpred','ctrl'], ['bpred','ctrl','decoder','ctrl'],
        ['decoder','out','alu','ctrl'],
        ['alu','data','pipeline','in'], ['pipeline','out','registers','data'],
        ['control','ctrl','core','ctrl'], ['alu','data','core','data'],
        ['alu','data','fpu','data'], ['control','ctrl','fpu','ctrl'],
        ['control','ctrl','pwr','ctrl'],
        ['registers','data','cacheL1','reg'],
        ['cacheL1','mc','cacheL2','reg'], ['cacheL2','mc','cacheL3','reg'],
        ['cacheL3','mc','memctrl','cache'],
        ['memctrl','mem','memory','data'], ['memctrl','addr','memory','addr'],
        ['memctrl','nb','northbridge','mc'], ['northbridge','mem','memory','data'],
        ['northbridge','mem','southbridge','data'],
      ],
    },
  ];

  /* STATE */
  const SAVE_KEY = 'yesp-cpu-v3';
  const NODE_W = 160, HEAD_H = 34, ROW_H = 26;
  const WORLD_W = 2400, WORLD_H = 1600;
  let state, pending = null, selectedUid = null, uidSeq = 1;
  let zoom = 1, panX = 60, panY = 60;
  let isPanning = false, panStartX = 0, panStartY = 0;
  let researchTimer = null;
  let _panMove = null, _panUp = null;

  function freshState() {
    return {
      money: 800, tierIdx: 0, unlockedTiers: [0], activeResearch: null,
      nodes: [], wires: [], price: 1000, cpuName: '',
      soldCPUs: [], log: [],
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s.money === 'number' && Array.isArray(s.nodes)) {
        state = Object.assign(freshState(), s);
        // Ensure all nodes have props
        state.nodes.forEach(n => { if (!n.props) n.props = defaultProps(n.type); });
        uidSeq = Math.max(1, ...state.nodes.map(n => n.uid + 1), 1);
        return;
      }
    } catch (_) {}
    state = freshState();
  }
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {} };
  const tier = () => NM_TIERS[state.tierIdx];

  /* GEOMETRY */
  function portLayout(node) {
    const def = CATALOG[node.type];
    if (!def) return { left: [], right: [], h: HEAD_H + 10, w: NODE_W };
    const left = [], right = [];
    def.ports.forEach(p => (p.dir === 'in' ? left : right).push(p));
    return { left, right, h: HEAD_H + Math.max(left.length, right.length) * ROW_H + 10, w: NODE_W };
  }
  function portPos(node, portId) {
    const lay = portLayout(node);
    let i = lay.left.findIndex(p => p.id === portId);
    if (i >= 0) return { x: node.x, y: node.y + HEAD_H + i * ROW_H + ROW_H / 2, side: 'l' };
    i = lay.right.findIndex(p => p.id === portId);
    if (i < 0) return { x: node.x + NODE_W / 2, y: node.y + HEAD_H / 2, side: 'r' };
    return { x: node.x + NODE_W, y: node.y + HEAD_H + i * ROW_H + ROW_H / 2, side: 'r' };
  }
  const portDef = (type, id) => (CATALOG[type]?.ports || []).find(p => p.id === id);
  const nodeById = uid => state.nodes.find(n => n.uid === uid);

  /* WIRE VALIDITY */
  function dirOk(d1, d2) {
    if (d1 === 'io' || d2 === 'io') return true;
    return d1 !== d2;
  }
  function canConnect(aUid, aPort, bUid, bPort) {
    if (aUid === bUid) return { ok: false, why: 'Same component' };
    const na = nodeById(aUid), nb = nodeById(bUid);
    if (!na || !nb) return { ok: false, why: 'Node not found' };
    const pa = portDef(na.type, aPort), pb = portDef(nb.type, bPort);
    if (!pa || !pb) return { ok: false, why: 'Port not found' };
    if (pa.type !== pb.type) return { ok: false, why: `Type mismatch: ${PORT[pa.type].label} ✗ ${PORT[pb.type].label}` };
    if (!dirOk(pa.dir, pb.dir)) return { ok: false, why: `Direction clash: ${pa.dir} ✗ ${pb.dir}` };
    const dup = state.wires.some(w =>
      (w.aUid === aUid && w.aPort === aPort && w.bUid === bUid && w.bPort === bPort) ||
      (w.aUid === bUid && w.aPort === bPort && w.bUid === aUid && w.bPort === aPort));
    if (dup) return { ok: false, why: 'Already wired' };
    return { ok: true, type: pa.type };
  }

  /* VALIDATION */
  function validate() {
    const present = {};
    state.nodes.forEach(n => { const r = roleOf(n.type); present[r] = (present[r] || 0) + 1; });
    const missing = REQUIRED.filter(r => !present[r]);
    const ruleMet = rule => state.wires.some(w => {
      const na = nodeById(w.aUid), nb = nodeById(w.bUid);
      if (!na || !nb) return false;
      const ta = portDef(na.type, w.aPort), tb = portDef(nb.type, w.bPort);
      if (!ta || !tb || ta.type !== rule.type || tb.type !== rule.type) return false;
      const ra = roleOf(na.type), rb = roleOf(nb.type);
      return (ra === rule.a && rb === rule.b) || (ra === rule.b && rb === rule.a);
    });
    const unmet = RULES.filter(r => !missing.includes(r.a) && !missing.includes(r.b) && !ruleMet(r));
    const wired = new Set();
    state.wires.forEach(w => { wired.add(w.aUid); wired.add(w.bUid); });
    const orphans = state.nodes.filter(n => !wired.has(n.uid));
    return { present, missing, unmet, orphans, works: missing.length === 0 && unmet.length === 0 && orphans.length === 0 };
  }

  /* DIE SIZE */
  function calcDieMm2() {
    const nmScale = Math.pow(tier().nm / 45, 2);
    return state.nodes.reduce((sum, n) => {
      let base = DIE_BASE_45[n.type] || 1;
      const p = n.props || {};
      if (n.type === 'cacheL1') base = (2 / 32)  * (p.sizeKB || 32);
      if (n.type === 'cacheL2') base = (4 / 256) * (p.sizeKB || 256);
      if (n.type === 'cacheL3') base = 6 * (p.sizeMB || 6);
      return sum + base * nmScale;
    }, 0);
  }

  /* STATS */
  function computeStats(v) {
    const t = tier();
    const dataWires = state.wires.filter(w => {
      const na = nodeById(w.aUid); return na && portDef(na.type, w.aPort)?.type === 'data';
    }).length;
    const extraData = Math.max(0, dataWires - RULES.filter(r => r.type === 'data').length);
    const completeness = RULES.length ? (RULES.length - v.unmet.length) / RULES.length : 0;

    // Cache (best tier present)
    let cacheMult = 1, cacheHeat = 0, cachePower = 0;
    state.nodes.forEach(n => {
      const c = CATALOG[n.type]?.cache;
      if (c && c.mult > cacheMult) { cacheMult = c.mult; cacheHeat = c.heat; cachePower = c.power; }
    });

    // Optional extras
    const hasFPU   = state.nodes.some(n => n.type === 'fpu');
    const pipeCnt  = state.nodes.filter(n => n.type === 'pipeline').length;
    const coreCnt  = state.nodes.filter(n => n.type === 'core').length;
    const hasBPred = state.nodes.some(n => n.type === 'bpred');
    const hasDec   = state.nodes.some(n => n.type === 'decoder');
    const hasPwr   = state.nodes.some(n => n.type === 'pwr');

    // Average voltage (affects heat)
    const avgVoltage = state.nodes.length
      ? state.nodes.reduce((s, n) => s + (n.props?.voltage || 1.1), 0) / state.nodes.length
      : 1.1;
    const voltHeatMult = Math.pow(avgVoltage / 1.1, 2);

    // Clock — base computed, then modified by ALU ghz prop if set
    const aluNode = state.nodes.find(n => n.type === 'alu');
    const aluGhzOverride = aluNode?.props?.ghz;
    let ghz = t.clockCeil * (0.5 + 0.5 * completeness) + 0.08 * extraData;
    if (hasBPred) ghz += 0.10;
    if (hasDec)   ghz += 0.05;
    // Manual override: if set, use it (may exceed ceiling → heat penalty applies later)
    if (aluGhzOverride && aluGhzOverride > 0) ghz = aluGhzOverride;
    const overclocked = ghz > t.clockCeil;
    const ghzClamped = overclocked ? ghz : clamp(ghz, 0, t.clockCeil);

    // Heat
    let heatBase = t.nm * ghzClamped * t.heatK * 0.9 * voltHeatMult + cacheHeat;
    if (overclocked) heatBase *= (1 + (ghz - t.clockCeil) * 0.3); // OC heat penalty
    if (hasPwr) heatBase *= 0.88;
    let tempC = AMBIENT_C + heatBase;

    let throttle = 1;
    if (tempC > THROTTLE_C) {
      throttle = clamp(1 - (tempC - THROTTLE_C) * 0.02, 0.45, 1);
      tempC = AMBIENT_C + (hasPwr ? 0.88 : 1) * t.nm * (ghzClamped * throttle) * t.heatK * 0.9 * voltHeatMult + cacheHeat;
    }
    const effGhz = ghzClamped * throttle;

    // TDP from per-node power props
    const tdpW = state.nodes.reduce((s, n) => {
      if (n.props?.powerW != null) return s + n.props.powerW;
      // auto-estimate
      const base = { clock:3, control:5, alu:15, fpu:10, decoder:4, pipeline:5, core:20,
                     bpred:3, pwr:2, registers:4, cacheL1:3, cacheL2:5, cacheL3:10,
                     memctrl:8, memory:8, northbridge:10, southbridge:4 };
      return s + (base[n.type] || 5);
    }, 0);

    const powerW = tdpW;

    // Performance
    let perf = Math.round(effGhz * cacheMult * (1 + 0.04 * extraData) * 100);
    if (hasFPU)      perf = Math.round(perf * 1.12);
    if (pipeCnt > 0) perf = Math.round(perf * (1 + 0.08 * Math.min(pipeCnt, 3)));
    if (coreCnt > 0) perf = Math.round(perf * (1 + 0.35 * Math.min(coreCnt, 4)));
    if (hasBPred)    perf = Math.round(perf * 1.06);
    if (hasDec)      perf = Math.round(perf * 1.05);

    let stability = 100;
    if (tempC > THROTTLE_C) stability -= (tempC - THROTTLE_C) * 1.6;
    if (throttle < 1) stability -= 8;
    if (overclocked) stability -= 10 + (ghz - t.clockCeil) * 15;
    if (avgVoltage > 1.3) stability -= (avgVoltage - 1.3) * 20;
    if (hasPwr) stability += 5;
    if (v.present?.southbridge) stability += 4;
    stability = clamp(Math.round(stability), 0, 100);

    // Cache sizes from props
    const l1Node = state.nodes.find(n => n.type === 'cacheL1');
    const l2Node = state.nodes.find(n => n.type === 'cacheL2');
    const l3Node = state.nodes.find(n => n.type === 'cacheL3');
    const l1KB = l1Node?.props?.sizeKB || (l1Node ? 32 : 0);
    const l2KB = l2Node?.props?.sizeKB || (l2Node ? 256 : 0);
    const l3MB = l3Node?.props?.sizeMB || (l3Node ? 6 : 0);

    // Memory channels
    const mcNode = state.nodes.find(n => n.type === 'memctrl');
    const memChannels = mcNode?.props?.channels || 2;
    const maxBandwidthGBs = mcNode?.props?.maxBandwidthGBs || 38.4;

    // Clock gen derived GHz
    const clkNode = state.nodes.find(n => n.type === 'clock');
    const baseMhz = clkNode?.props?.baseMhz || 100;
    const multiplier = clkNode?.props?.multiplier || 32;
    const derivedGhz = fmt2(baseMhz * multiplier / 1000);

    // IPC tier
    const ipcScore = (l2KB ? 1 : 0) + (l3MB ? 1 : 0) + (hasBPred ? 1 : 0) +
                     (hasDec ? 1 : 0) + (pipeCnt > 0 ? 1 : 0);
    const ipcTier = ipcScore >= 4 ? 'High' : ipcScore >= 2 ? 'Med' : 'Low';

    // Total cores (1 base + extra core blocks)
    const totalCores = 1 + coreCnt;
    const singleThread = totalCores > 0 ? Math.round(perf / totalCores) : perf;

    // Die size
    const dieMm2 = fmt1(calcDieMm2());

    return {
      ghz: ghzClamped, effGhz, tempC: Math.round(tempC), powerW: Math.round(powerW),
      tdpW: Math.round(tdpW), perf, stability, throttle, cacheMult,
      extraData, dataWires, coreCnt, pipeCnt, hasFPU, hasBPred, hasDec, hasPwr,
      overclocked, avgVoltage: fmt2(avgVoltage),
      l1KB, l2KB, l3MB, memChannels, maxBandwidthGBs,
      baseMhz, multiplier, derivedGhz,
      ipcTier, totalCores, singleThread, dieMm2,
    };
  }

  /* ECONOMY */
  function buildCost() {
    return state.nodes.reduce((s, n) => s + (CATALOG[n.type]?.price || 0), 0) + tier().fab;
  }
  function fairValue(st) {
    return Math.round(st.perf * 2.4 + st.stability * 3 + Math.max(0, 95 - st.tempC) * 2);
  }
  function statsQuality(st) {
    return clamp(
      0.50 * clamp(st.perf / 900, 0, 1) +
      0.20 * clamp((95 - st.tempC) / 40, 0, 1) +
      0.30 * (st.stability / 100), 0, 1);
  }
  function buyChance(st, works) {
    if (!works) return 0;
    const ratio = state.price / Math.max(1, fairValue(st));
    return clamp(statsQuality(st) * (1 / (1 + Math.exp((ratio - 1.0) * 6))), 0, 1);
  }
  function starRating(st, price, works) {
    if (!works) return 1;
    const fv = fairValue(st);
    const q = statsQuality(st);
    const ps = clamp(fv / Math.max(1, price), 0, 1.2);
    return clamp(Math.round((0.55 * q + 0.45 * Math.min(1, ps)) * 4) + 1, 1, 5);
  }

  /* PER-BLOCK WARNINGS */
  function blockWarnings(node) {
    const p = node.props || {};
    const t = tier();
    const warns = [];
    if (p.voltage > 1.35) warns.push({ lvl: 'warn', msg: `High voltage ${p.voltage}V at ${t.nm}nm — heat penalty` });
    if (p.voltage > 1.5)  warns.push({ lvl: 'err',  msg: `Dangerously high voltage — stability crash` });
    if ((p.ghz || 0) > t.clockCeil) warns.push({ lvl: 'err', msg: `${p.ghz} GHz exceeds ${t.nm}nm ceiling (${t.clockCeil} GHz) — throttle & heat` });
    if (node.type === 'cacheL1' && (p.sizeKB || 32) > 128 && t.nm >= 65) warns.push({ lvl: 'warn', msg: `L1 ${p.sizeKB}KB is unrealistic at ${t.nm}nm` });
    if (node.type === 'cacheL3' && (p.sizeMB || 6) > 16 && t.nm >= 45) warns.push({ lvl: 'warn', msg: `L3 ${p.sizeMB}MB is unrealistic at ${t.nm}nm` });
    return warns;
  }

  /* CANVAS DOM */
  let canvasEl, worldEl, svgEl, root;

  function applyTransform() {
    if (worldEl) worldEl.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  }
  function screenToWorld(sx, sy) {
    const rect = canvasEl.getBoundingClientRect();
    return { x: (sx - rect.left - panX) / zoom, y: (sy - rect.top - panY) / zoom };
  }

  /* BUILD */
  function build() {
    root = $('#cpu-app');
    if (!root) return;
    load(); checkResearch();

    if (_panMove) { document.removeEventListener('mousemove', _panMove); _panMove = null; }
    if (_panUp)   { document.removeEventListener('mouseup',   _panUp);   _panUp = null; }

    root.innerHTML = `
<div class="cpu2-bar">
  <div class="cpu2-tabs">
    <button class="cpu2-tab active" data-tab="blueprint">Blueprint</button>
    <button class="cpu2-tab" data-tab="shop">Shop</button>
    <button class="cpu2-tab" data-tab="research">Research</button>
    <button class="cpu2-tab" data-tab="mycpus">My CPUs</button>
  </div>
  <div class="cpu2-wallet"><span class="cpu2-coin">◈</span> <b id="cpu2-money"></b></div>
  <div class="cpu2-tech">Node: <b id="cpu2-tier"></b></div>
  <div class="cpu2-status" id="cpu2-status"></div>
  <div class="cpu2-bartools">
    <button id="cpu2-arrange">Arrange</button>
    <button id="cpu2-clearwires">Clear wires</button>
    <button id="cpu2-reset">Reset</button>
  </div>
</div>
<div class="cpu2-body">
  <div class="cpu2-canvas" id="cpu2-canvas">
    <div class="cpu2-world" id="cpu2-world">
      <svg class="cpu2-wires" id="cpu2-svg" width="${WORLD_W}" height="${WORLD_H}"></svg>
    </div>
    <div class="cpu2-legend">
      ${Object.entries(PORT).map(([k,v]) => `<span><i style="background:${v.color}"></i>${v.label}</span>`).join('')}
      <span class="cpu2-legend-hint">Scroll=zoom · Drag bg=pan · Click port=wire · Click node=edit · Click wire=delete</span>
    </div>
  </div>
  <div class="cpu2-details" id="cpu2-details"></div>
</div>
<div class="cpu2-errstrip" id="cpu2-errstrip"></div>
<div class="cpu2-sell-float" id="cpu2-sell-float"></div>
<div class="cpu2-modal" id="cpu2-modal" hidden>
  <div class="cpu2-modal-box" id="cpu2-modal-box"></div>
</div>`;

    canvasEl = $('#cpu2-canvas');
    worldEl  = $('#cpu2-world');
    svgEl    = $('#cpu2-svg');

    panX = 60; panY = 60; zoom = 1;
    applyTransform();

    $$('.cpu2-tab').forEach(btn => btn.addEventListener('click', () => {
      $$('.cpu2-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      if (tab === 'blueprint') { $('#cpu2-modal').hidden = true; }
      else openModal(tab);
    }));

    $('#cpu2-reset').addEventListener('click', () => {
      if (confirm('Wipe save and start over?')) { state = freshState(); save(); build(); }
    });
    $('#cpu2-arrange').addEventListener('click', () => { autoArrange(); renderCanvas(); });
    $('#cpu2-clearwires').addEventListener('click', () => { state.wires = []; pending = null; save(); renderAll(); });

    /* PAN */
    canvasEl.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const tgt = e.target;
      if (tgt === canvasEl || tgt === worldEl || tgt === svgEl ||
          tgt.closest?.('.cpu2-legend')) {
        if (tgt.classList?.contains('cpu2-wire-hit')) return;
        isPanning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        canvasEl.classList.add('panning');
        e.preventDefault();
      }
    });
    _panMove = e => {
      if (!isPanning) return;
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      applyTransform();
    };
    _panUp = e => {
      if (e.button !== 0) return;
      if (isPanning) { isPanning = false; canvasEl.classList.remove('panning'); }
    };
    document.addEventListener('mousemove', _panMove);
    document.addEventListener('mouseup',   _panUp);

    /* ZOOM */
    canvasEl.addEventListener('wheel', e => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = canvasEl.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      panX = cx - (cx - panX) * f;
      panY = cy - (cy - panY) * f;
      zoom = clamp(zoom * f, 0.15, 4);
      applyTransform();
    }, { passive: false });

    canvasEl.addEventListener('click', e => {
      if (e.target === canvasEl || e.target === worldEl || e.target === svgEl) {
        clearPending(); selectNode(null);
      }
    });

    renderAll();
    startResearchPolling();
  }

  /* RESEARCH POLLING */
  function checkResearch() {
    if (!state.activeResearch) return;
    const { tierIdx, startTime } = state.activeResearch;
    if ((Date.now() - startTime) / 1000 >= NM_TIERS[tierIdx].researchSec) {
      if (!state.unlockedTiers.includes(tierIdx)) state.unlockedTiers.push(tierIdx);
      state.tierIdx = tierIdx;
      state.activeResearch = null;
      save();
    }
  }
  function startResearchPolling() {
    if (researchTimer) clearInterval(researchTimer);
    researchTimer = setInterval(() => {
      if (!root || !document.body.contains(root)) { clearInterval(researchTimer); researchTimer = null; return; }
      if (!state.activeResearch) return;
      checkResearch();
      updateResearchProgress();
      const m = $('#cpu2-money'); if (m) m.textContent = money(state.money);
      const t = $('#cpu2-tier'); if (t) t.textContent = tier().nm + ' nm';
    }, 1000);
  }

  function renderAll() {
    if (!root) return;
    const m = $('#cpu2-money'); if (m) m.textContent = money(state.money);
    const t = $('#cpu2-tier'); if (t) t.textContent = tier().nm + ' nm';
    const v = validate(), st = computeStats(v);
    renderCanvas();
    renderStatus(v, st);
    renderErrStrip(v);
    renderSellFloat(v, st);
    renderDetailsPanel(v, st);
    save();
  }

  /* STATUS */
  function renderStatus(v, st) {
    const el = $('#cpu2-status'); if (!el) return;
    el.innerHTML = v.works
      ? `<span class="ok">● ready</span> · ${st.effGhz.toFixed(2)} GHz · ${st.tempC}°C · perf ${st.perf}`
      : `<span class="bad">● ${v.missing.length + v.unmet.length + v.orphans.length} issue(s)</span>`;
  }

  /* ERROR STRIP */
  function renderErrStrip(v) {
    const el = $('#cpu2-errstrip'); if (!el) return;
    if (v.works) { el.innerHTML = '<span class="cpu2-allgood">✔ All required blocks present and correctly wired.</span>'; return; }
    const items = [];
    v.missing.forEach(m => items.push(`<span class="miss">Missing: <b>${m==='cache'?'Cache (L1/L2/L3)':CATALOG[m]?.name||m}</b></span>`));
    v.unmet.forEach(r  => items.push(`<span class="rule">Not wired: <b>${r.desc}</b></span>`));
    v.orphans.forEach(o => items.push(`<span class="orph">Unwired: <b>${CATALOG[o.type]?.name||o.type}</b></span>`));
    el.innerHTML = items.join('');
  }

  /* DETAILS PANEL */
  function selectNode(uid) {
    selectedUid = uid;
    const v = validate(), st = computeStats(v);
    renderDetailsPanel(v, st);
    // refresh canvas to show selection ring
    $$('.cpu2-node', worldEl).forEach(el => {
      el.classList.toggle('selected', +el.dataset.uid === uid);
    });
  }

  function renderDetailsPanel(v, st) {
    const panel = $('#cpu2-details'); if (!panel) return;
    const selNode = selectedUid != null ? nodeById(selectedUid) : null;
    if (selNode) {
      panel.innerHTML = renderBlockEditorHTML(selNode);
      wireBlockEditor(selNode, panel, v, st);
    } else {
      panel.innerHTML = renderCpuOverviewHTML(v, st);
      wireSellSection(panel, v, st);
    }
  }

  /* CPU OVERVIEW */
  function renderCpuOverviewHTML(v, st) {
    const t = tier();
    const cost = buildCost();
    const fv = v.works ? fairValue(st) : 0;
    const chance = buyChance(st, v.works);
    const s5 = v.works ? starRating(st, state.price, true) : 0;

    const row = (label, val, extra='') =>
      `<div class="cpu2-drow"><span>${label}</span><b>${val}</b>${extra?`<small>${extra}</small>`:''}</div>`;

    return `
<div class="cpu2-det-head">CPU Details</div>
<div class="cpu2-det-section">── Core Config ──</div>
${row('Cores', st.totalCores)}
${row('Base Clock', st.effGhz.toFixed(2) + ' GHz', st.overclocked ? '⚠ overclocked' : '')}
${row('IPC Tier', st.ipcTier)}
${row('Die Size', st.dieMm2 + ' mm²', t.nm + ' nm')}
<div class="cpu2-det-section">── Memory ──</div>
${st.l1KB ? row('L1 Cache', st.l1KB >= 1024 ? (st.l1KB/1024)+'MB' : st.l1KB+'KB') : ''}
${st.l2KB ? row('L2 Cache', st.l2KB >= 1024 ? (st.l2KB/1024)+'MB' : st.l2KB+'KB') : ''}
${st.l3MB ? row('L3 Cache', st.l3MB+'MB') : ''}
${row('Mem Channels', st.memChannels)}
${row('Max Bandwidth', st.maxBandwidthGBs+' GB/s')}
<div class="cpu2-det-section">── Power & Thermals ──</div>
${row('TDP', st.tdpW + ' W')}
${row('Core Voltage', st.avgVoltage + ' V')}
${row('Temp', st.tempC + '°C', st.throttle < 1 ? '⚠ throttled ×'+st.throttle.toFixed(2) : '')}
${row('Stability', st.stability + '%')}
<div class="cpu2-det-section">── Performance ──</div>
${row('Perf Score', v.works ? st.perf : '—')}
${row('Single-thread', v.works ? st.singleThread : '—')}
${st.throttle < 1 ? `<div class="cpu2-det-warn">⚠ Throttle −${Math.round((1-st.throttle)*100)}%</div>` : ''}
<div class="cpu2-det-section">── Sell ──</div>
${v.works ? `<div class="cpu2-det-stars">${starsStr(s5)}</div>` : ''}
${row('Build cost', money(cost))}
${row('Fair value', v.works ? money(fv) : '—')}
<label class="cpu2-det-pricelabel">Your price
  <input type="number" id="cpu2-price" min="1" step="10" value="${state.price}" ${v.works?'':'disabled'}/>
</label>
<div class="cpu2-det-chance-row">
  <div class="cpu2-bar"><i class="c-chance" style="width:${Math.round(chance*100)}%"></i></div>
  <small>${v.works ? Math.round(chance*100)+'% buy chance' : 'finish the CPU first'}</small>
</div>
<div class="cpu2-det-margin ${state.price-cost>=0?'pos':'neg'}">Margin <b>${money(state.price-cost)}</b></div>
<input class="cpu2-sf-name" id="cpu2-cpuname" type="text" placeholder="Name your CPU…" maxlength="40" value="${state.cpuName||''}" ${v.works?'':'disabled'}/>
<button class="cpu2-sf-sell" id="cpu2-list" ${v.works?'':'disabled'}>List for sale</button>
${state.log.length ? '<div class="cpu2-det-log">'+state.log.slice(0,4).map(e=>`<div class="cpu2-logline ${e.cls}">${e.text}</div>`).join('')+'</div>' : ''}`;
  }

  function wireSellSection(panel, v, st) {
    const pi = panel.querySelector('#cpu2-price');
    if (pi) pi.addEventListener('input', () => {
      state.price = Math.max(1, parseInt(pi.value,10)||1);
      const v2 = validate(), st2 = computeStats(v2), ch = buyChance(st2, v2.works);
      const ci = panel.querySelector('.c-chance'); if (ci) ci.style.width = Math.round(ch*100)+'%';
      const sm = panel.querySelector('.cpu2-det-chance-row small'); if (sm) sm.textContent = Math.round(ch*100)+'% buy chance';
      const m = state.price - buildCost(), mEl = panel.querySelector('.cpu2-det-margin');
      if (mEl) { mEl.className = 'cpu2-det-margin '+(m>=0?'pos':'neg'); mEl.innerHTML = `Margin <b>${money(m)}</b>`; }
      save();
    });
    const ni = panel.querySelector('#cpu2-cpuname');
    if (ni) ni.addEventListener('input', () => { state.cpuName = ni.value.slice(0,40); save(); });
    const lb = panel.querySelector('#cpu2-list');
    if (lb) lb.addEventListener('click', listForSale);
  }

  /* BLOCK EDITOR */
  function renderBlockEditorHTML(node) {
    const def = CATALOG[node.type];
    if (!def) return '';
    const p = node.props || {};
    const t = tier();
    const warns = blockWarnings(node);
    const label = p.label || def.name;

    const field = (lbl, html) =>
      `<label class="cpu2-ef-row"><span>${lbl}</span>${html}</label>`;
    const num = (id, val, min, max, step=1) =>
      `<input class="cpu2-ef-num" data-prop="${id}" type="number" value="${val}" min="${min}" max="${max}" step="${step}">`;
    const sel = (id, val, opts) =>
      `<select class="cpu2-ef-sel" data-prop="${id}">${opts.map(o=>
        `<option value="${o.v}" ${o.v==val?'selected':''}>${o.l}</option>`).join('')}</select>`;
    const slider = (id, val, min, max, step=0.1) =>
      `<div class="cpu2-ef-slider-wrap">
        <input class="cpu2-ef-slider" data-prop="${id}" type="range" value="${val}" min="${min}" max="${max}" step="${step}">
        <input class="cpu2-ef-num sm" data-prop="${id}" type="number" value="${val}" min="${min}" max="${max}" step="${step}">
       </div>`;

    let specific = '';
    if (node.type === 'clock') {
      const derived = fmt2((p.baseMhz||100) * (p.multiplier||32) / 1000);
      specific = field('Base (MHz)', num('baseMhz', p.baseMhz||100, 50, 500, 10)) +
                 field('Multiplier', num('multiplier', p.multiplier||32, 1, 100)) +
                 `<div class="cpu2-ef-derived">→ ${derived} GHz</div>`;
    }
    if (node.type === 'alu' || node.type === 'fpu') {
      specific = field('GHz override', slider('ghz', p.ghz||t.clockCeil, 0.1, t.clockCeil*1.2, 0.05)) +
                 `<small class="cpu2-ef-hint">Leave at ${t.clockCeil} for tier default. Above ceiling = heat+instability.</small>` +
                 field('Pipeline stages', num('pipelineStages', p.pipelineStages||4, 1, 20)) +
                 field('Exec units', num('execUnits', p.execUnits||2, 1, 8));
    }
    if (node.type === 'control') {
      specific = field('Branch predictor',
        sel('bpType', p.bpType||'dynamic', [
          {v:'static',l:'Static'},{v:'dynamic',l:'Dynamic'},{v:'hybrid',l:'Hybrid'}
        ]));
    }
    if (node.type === 'registers') {
      specific = field('Register count',
        sel('regCount', p.regCount||32, [8,16,32,64,128,256].map(n=>({v:n,l:n})))) +
        field('Register width',
          sel('regWidth', p.regWidth||64, [8,16,32,64,128].map(n=>({v:n,l:n+'-bit'}))));
    }
    if (node.type === 'cacheL1') {
      specific = field('Size (KB)',
        sel('sizeKB', p.sizeKB||32, [8,16,32,64,128,256].map(n=>({v:n,l:n+' KB'})))) +
        field('Associativity', sel('assoc', p.assoc||8, [2,4,8,16].map(n=>({v:n,l:n+'-way'})))) +
        field('Latency (cycles)', num('latency', p.latency||4, 1, 20));
    }
    if (node.type === 'cacheL2') {
      specific = field('Size (KB)',
        sel('sizeKB', p.sizeKB||256, [64,128,256,512,1024].map(n=>({v:n,l:n>=1024?n/1024+'MB':n+' KB'})))) +
        field('Associativity', sel('assoc', p.assoc||8, [2,4,8,16].map(n=>({v:n,l:n+'-way'})))) +
        field('Latency (cycles)', num('latency', p.latency||12, 1, 50));
    }
    if (node.type === 'cacheL3') {
      specific = field('Size (MB)',
        sel('sizeMB', p.sizeMB||6, [1,2,4,6,8,12,16,24,32].map(n=>({v:n,l:n+' MB'})))) +
        field('Associativity', sel('assoc', p.assoc||16, [4,8,16,32].map(n=>({v:n,l:n+'-way'})))) +
        field('Latency (cycles)', num('latency', p.latency||40, 10, 200, 5));
    }
    if (node.type === 'memctrl') {
      specific = field('Channels', sel('channels', p.channels||2, [1,2,4,8].map(n=>({v:n,l:n+' ch'})))) +
                 field('Max bandwidth', num('maxBandwidthGBs', p.maxBandwidthGBs||38.4, 5, 200, 0.1) + ' GB/s');
    }
    if (node.type === 'northbridge') {
      specific = field('Bus width', sel('busWidth', p.busWidth||64, [32,64,128,256].map(n=>({v:n,l:n+'-bit'})))) +
                 field('Bus speed', num('busMhz', p.busMhz||800, 100, 3200, 50) + ' MHz');
    }
    if (node.type === 'pipeline') {
      specific = field('Stage depth', num('stageDepth', p.stageDepth||4, 1, 32)) +
                 field('Stall penalty', num('stallPenalty', p.stallPenalty||2, 0, 20) + ' cycles');
    }
    if (node.type === 'core') {
      specific = field('GHz override', slider('ghz', p.ghz||t.clockCeil, 0.1, t.clockCeil*1.2, 0.05)) +
                 field('Core count', num('coreCount', p.coreCount||1, 1, 32));
    }
    if (node.type === 'pwr') {
      specific = field('TDP cap', num('tdpCap', p.tdpCap||65, 10, 500) + ' W') +
                 field('VR efficiency', num('vrEfficiency', p.vrEfficiency||90, 50, 99) + ' %');
    }

    const warnHtml = warns.map(w =>
      `<div class="cpu2-ef-warn ${w.lvl}">${w.lvl==='err'?'✖':'⚠'} ${w.msg}</div>`).join('');

    return `
<div class="cpu2-det-head">
  <span style="color:${def.color};font-weight:800">${def.tag}</span> ${def.name}
  <button class="cpu2-ef-close" id="cpu2-ef-close" title="Close editor">×</button>
</div>
${warnHtml}
<div class="cpu2-ef-form">
  ${field('Label', `<input class="cpu2-ef-text" data-prop="label" type="text" value="${p.label||''}" placeholder="${def.name}">`)}
  ${field('Voltage', slider('voltage', p.voltage||1.1, 0.6, 2.0, 0.05) + ' V')}
  ${field('Power draw', num('powerW', p.powerW!=null?p.powerW:'', 0, 500) + ' W <small style="color:var(--ink-faint)">(blank=auto)</small>')}
  ${specific}
</div>`;
  }

  function wireBlockEditor(node, panel, v, st) {
    const closeBtn = panel.querySelector('#cpu2-ef-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { selectNode(null); });

    // Wire all inputs/selects with data-prop
    panel.querySelectorAll('[data-prop]').forEach(input => {
      const prop = input.dataset.prop;
      const isSlider = input.type === 'range';
      const handler = () => {
        let val = input.type === 'number' || isSlider ? parseFloat(input.value) : input.value;
        if (input.type === 'number' && input.value === '') val = null;
        if (!isNaN(val) || val === null || typeof val === 'string') {
          node.props[prop] = val;
          // Sync paired slider/number
          if (isSlider || (input.classList.contains('sm') && input.type === 'number')) {
            panel.querySelectorAll(`[data-prop="${prop}"]`).forEach(el => {
              if (el !== input) el.value = val;
            });
          }
          // Update clock derived GHz display
          if (node.type === 'clock' && (prop === 'baseMhz' || prop === 'multiplier')) {
            const d = panel.querySelector('.cpu2-ef-derived');
            if (d) d.textContent = '→ ' + fmt2((node.props.baseMhz||100)*(node.props.multiplier||32)/1000) + ' GHz';
          }
          save();
          // Lightweight re-render of just the stats
          const v2 = validate(), st2 = computeStats(v2);
          renderStatus(v2, st2);
          renderErrStrip(v2);
          renderSellFloat(v2, st2);
          // Refresh warnings in editor
          const warnContainer = panel.querySelector('.cpu2-ef-warn');
          const newWarns = blockWarnings(node);
          const existingWarns = panel.querySelectorAll('.cpu2-ef-warn');
          existingWarns.forEach(w => w.remove());
          const form = panel.querySelector('.cpu2-ef-form');
          newWarns.forEach(w => {
            const d = document.createElement('div');
            d.className = `cpu2-ef-warn ${w.lvl}`;
            d.textContent = (w.lvl==='err'?'✖':'⚠') + ' ' + w.msg;
            panel.insertBefore(d, form);
          });
          // Update node display name if label changed
          if (prop === 'label') {
            const nameEl = worldEl?.querySelector(`.cpu2-node[data-uid="${node.uid}"] .cpu2-nname`);
            if (nameEl) nameEl.textContent = val || CATALOG[node.type]?.name || '';
          }
        }
      };
      input.addEventListener('change', handler);
      if (input.type === 'range' || input.type === 'text') input.addEventListener('input', handler);
    });
  }

  /* CANVAS */
  function renderCanvas() {
    if (!worldEl || !svgEl) return;
    $$('.cpu2-node', worldEl).forEach(el => el.remove());
    state.nodes.forEach(node => worldEl.appendChild(nodeEl(node)));
    renderWires();
  }

  function nodeEl(node) {
    const def = CATALOG[node.type];
    if (!def) return document.createElement('div');
    const lay = portLayout(node);
    const el = document.createElement('div');
    el.className = 'cpu2-node' + (node.uid === selectedUid ? ' selected' : '');
    el.style.cssText = `left:${node.x}px;top:${node.y}px;width:${NODE_W}px;height:${lay.h}px;--c:${def.color}`;
    el.dataset.uid = node.uid;
    const displayName = node.props?.label || def.name;
    const warns = blockWarnings(node);

    const portRow = (p, side) => {
      const isSel  = pending?.uid === node.uid && pending?.port === p.id;
      const isComp = pending && !isSel && pending.uid !== node.uid
                     ? canConnect(pending.uid, pending.port, node.uid, p.id).ok : false;
      return `<div class="cpu2-prow ${side}">
        <span class="cpu2-dot${isSel?' sel':''}${isComp?' compat':''}"
          style="--pc:${PORT[p.type].color}"
          data-uid="${node.uid}" data-port="${p.id}"
          title="${PORT[p.type].label} · ${p.dir}"></span>
        <span class="cpu2-plabel">${p.label}</span>
      </div>`;
    };

    el.innerHTML = `
      <div class="cpu2-head" data-drag="${node.uid}">
        <span class="cpu2-tag2" style="background:${def.color}">${def.tag}</span>
        <span class="cpu2-nname">${displayName}</span>
        ${warns.length ? `<span class="cpu2-node-warn" title="${warns[0].msg}">${warns[0].lvl==='err'?'✖':'⚠'}</span>` : ''}
        <button class="cpu2-del" data-del="${node.uid}" title="Remove (70% refund)">×</button>
      </div>
      <div class="cpu2-ports">
        <div class="cpu2-pcol l">${lay.left.map(p => portRow(p,'l')).join('')}</div>
        <div class="cpu2-pcol r">${lay.right.map(p => portRow(p,'r')).join('')}</div>
      </div>`;

    el.querySelector('[data-drag]').addEventListener('mousedown', e => startDrag(e, node));
    el.querySelector('[data-del]').addEventListener('click', e => { e.stopPropagation(); delNode(node.uid); });
    $$('.cpu2-dot', el).forEach(d => d.addEventListener('click', e => {
      e.stopPropagation(); onPortClick(+d.dataset.uid, d.dataset.port);
    }));
    return el;
  }

  function renderWires() {
    if (!svgEl) return;
    let html = '';
    state.wires.forEach((w, i) => {
      const na = nodeById(w.aUid), nb = nodeById(w.bUid);
      if (!na || !nb) return;
      const pa = portPos(na, w.aPort), pb = portPos(nb, w.bPort);
      const type = portDef(na.type, w.aPort)?.type; if (!type) return;
      const dx = Math.max(50, Math.abs(pb.x - pa.x) * 0.45);
      const c1x = pa.x + (pa.side === 'r' ?  dx : -dx);
      const c2x = pb.x + (pb.side === 'r' ?  dx : -dx);
      const d = `M${pa.x},${pa.y} C${c1x},${pa.y} ${c2x},${pb.y} ${pb.x},${pb.y}`;
      html += `<path class="cpu2-wire" d="${d}" stroke="${PORT[type].color}"/>`;
      html += `<path class="cpu2-wire-hit" data-w="${i}" d="${d}"/>`;
    });
    svgEl.innerHTML = html;
    $$('.cpu2-wire-hit', svgEl).forEach(p => p.addEventListener('click', e => {
      e.stopPropagation(); state.wires.splice(+p.dataset.w, 1); save(); renderAll();
    }));
  }

  /* PORT CLICK */
  function onPortClick(uid, port) {
    if (!pending) { pending = { uid, port }; renderCanvas(); return; }
    if (pending.uid === uid && pending.port === port) { clearPending(); return; }
    const res = canConnect(pending.uid, pending.port, uid, port);
    if (!res.ok) { flashStatus('✗ ' + res.why, true); clearPending(); return; }
    state.wires.push({ aUid: pending.uid, aPort: pending.port, bUid: uid, bPort: port });
    pending = null; save(); renderAll();
  }
  function clearPending() { if (pending) { pending = null; renderCanvas(); } }
  function flashStatus(msg, bad) {
    const el = $('#cpu2-status'); if (!el) return;
    el.innerHTML = `<span class="${bad?'bad':'ok'}">${msg}</span>`;
    setTimeout(() => { const v = validate(); renderStatus(v, computeStats(v)); }, 2000);
  }

  /* DRAG — clicking without moving selects the node */
  function startDrag(e, node) {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    isPanning = false;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const wp0 = screenToWorld(e.clientX, e.clientY);
    const offX = wp0.x - node.x, offY = wp0.y - node.y;
    const el = worldEl.querySelector(`.cpu2-node[data-uid="${node.uid}"]`);

    const move = ev => {
      if (!moved && (Math.abs(ev.clientX-startX) > 4 || Math.abs(ev.clientY-startY) > 4)) {
        moved = true;
        if (el) el.classList.add('dragging');
      }
      if (!moved) return;
      const wp = screenToWorld(ev.clientX, ev.clientY);
      node.x = clamp(wp.x - offX, 0, WORLD_W - NODE_W);
      node.y = clamp(wp.y - offY, 0, WORLD_H - portLayout(node).h);
      if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }
      renderWires();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (el) el.classList.remove('dragging');
      if (!moved) {
        // tap = select for editing
        selectNode(selectedUid === node.uid ? null : node.uid);
      } else {
        save();
      }
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function delNode(uid) {
    const node = nodeById(uid); if (!node) return;
    state.money += Math.round((CATALOG[node.type]?.price || 0) * 0.7);
    state.nodes = state.nodes.filter(n => n.uid !== uid);
    state.wires = state.wires.filter(w => w.aUid !== uid && w.bUid !== uid);
    if (pending?.uid === uid) pending = null;
    if (selectedUid === uid) selectedUid = null;
    renderAll();
  }

  /* AUTO-ARRANGE */
  function autoArrange() {
    const cols = [
      ['clock'],
      ['control','decoder','bpred'],
      ['alu','fpu','pipeline'],
      ['registers','core'],
      ['cacheL1','cacheL2','cacheL3'],
      ['memctrl','pwr'],
      ['memory','northbridge','southbridge'],
    ];
    const used = {};
    state.nodes.forEach(n => {
      let ci = cols.findIndex(arr => arr.includes(n.type));
      if (ci < 0) ci = cols.length - 1;
      used[ci] = used[ci] || 0;
      n.x = clamp(60 + ci * 215, 8, WORLD_W - NODE_W - 8);
      n.y = 70 + used[ci] * 175;
      used[ci]++;
    });
    save();
  }

  /* SELL FLOAT (minimal — full details in right panel) */
  function renderSellFloat(v, st) {
    const el = $('#cpu2-sell-float'); if (!el) return;
    const cost = buildCost();
    el.innerHTML = `
      <div class="cpu2-sf-hd">
        <span class="${v.works?'ok':'bad'}">${v.works?'● READY':'● BUILDING'}</span>
        ${v.works ? `<span style="font-size:11px;color:var(--ink-soft)">${st.effGhz.toFixed(2)} GHz · ${st.tempC}°C</span>` : ''}
      </div>
      <div class="cpu2-sf-row">Cost <b>${money(cost)}</b></div>
      ${v.works ? `<div class="cpu2-sf-row">Perf <b>${st.perf}</b> · Die <b>${st.dieMm2} mm²</b></div>` : ''}
      <div style="font-size:10.5px;color:var(--ink-faint);margin-top:4px">Click node to edit · See right panel to sell</div>`;
  }

  /* LIST FOR SALE */
  function listForSale() {
    const v = validate(); if (!v.works) return;
    const st = computeStats(v);
    const cost = buildCost();
    const chance = buyChance(st, true);
    const sold = Math.random() < chance;
    const name = (state.cpuName || 'Unnamed CPU').trim();
    if (sold) {
      state.money += state.price;
      const s5 = starRating(st, state.price, true);
      state.soldCPUs.unshift({ name, price: state.price, stars: s5, perf: st.perf,
        ghz: +st.effGhz.toFixed(2), tempC: st.tempC, stability: st.stability,
        nm: tier().nm, dieMm2: st.dieMm2, date: Date.now() });
      state.soldCPUs = state.soldCPUs.slice(0, 20);
      state.log.unshift({ text: `✔ ${name} SOLD ${money(state.price)} · ${starsStr(s5)} · perf ${st.perf}`, cls: 'ok' });
      state.nodes = []; state.wires = []; state.cpuName = ''; pending = null; selectedUid = null;
    } else {
      state.log.unshift({ text: `✗ ${name} passed at ${money(state.price)} (${Math.round(chance*100)}% chance). Lower price or improve.`, cls: 'bad' });
    }
    state.log = state.log.slice(0, 8);
    renderAll();
  }

  /* MODAL */
  function openModal(tab) {
    const box = $('#cpu2-modal-box'); if (!box) return;
    $('#cpu2-modal').hidden = false;
    if (tab === 'shop')     renderShopModal(box);
    if (tab === 'research') renderResearchModal(box);
    if (tab === 'mycpus')   renderMyCPUsModal(box);
  }
  function closeModal() {
    const m = $('#cpu2-modal'); if (m) m.hidden = true;
    $$('.cpu2-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'blueprint'));
  }

  /* SHOP */
  function renderShopModal(box) {
    const partOrder = ['clock','control','decoder','bpred','alu','fpu','pipeline','core',
                       'registers','cacheL1','cacheL2','cacheL3','memctrl','memory',
                       'northbridge','southbridge','pwr'];
    box.innerHTML = `
      <div class="cpu2-mhead">
        <h2>Shop</h2>
        <button class="cpu2-mclose" id="cpu2-mclose">×</button>
      </div>
      <div class="cpu2-stabs">
        <button class="cpu2-stab active" data-stab="parts">Parts</button>
        <button class="cpu2-stab" data-stab="blueprints">Historical Blueprints</button>
      </div>
      <div id="cpu2-shop-cnt"></div>`;
    $('#cpu2-mclose').addEventListener('click', closeModal);
    $$('.cpu2-stab', box).forEach(btn => btn.addEventListener('click', () => {
      $$('.cpu2-stab', box).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderShopContent(btn.dataset.stab);
    }));
    renderShopContent('parts');

    function renderShopContent(stab) {
      const cnt = $('#cpu2-shop-cnt'); if (!cnt) return;
      if (stab === 'parts') {
        cnt.innerHTML = `<div class="cpu2-parts-grid">${partOrder.map(id => {
          const c = CATALOG[id];
          const can = state.money >= c.price;
          const extra = c.cache ? ` · ×${c.cache.mult} perf` : '';
          return `<div class="cpu2-pcard${can?'':' poor'}">
            <div class="cpu2-pcard-top">
              <span class="cpu2-ptag" style="background:${c.color}">${c.tag}</span>
              <div>
                <div class="cpu2-pname">${c.name}${c.optional?'<em> opt</em>':''}</div>
                <div class="cpu2-pprice">${money(c.price)}${extra}</div>
              </div>
            </div>
            <p class="cpu2-pdesc">${c.desc}</p>
            <button class="cpu2-pbuy" data-id="${id}" ${can?'':'disabled'}>Buy — ${money(c.price)}</button>
          </div>`;
        }).join('')}</div>`;
        $$('.cpu2-pbuy', cnt).forEach(b => b.addEventListener('click', () => {
          buyPart(b.dataset.id); renderShopContent('parts');
        }));
      } else {
        cnt.innerHTML = `<div class="cpu2-bp-grid">${BLUEPRINTS.map(bp => `
          <div class="cpu2-bpcard">
            <div class="cpu2-bpcard-top">
              <b>${bp.name}</b><span class="cpu2-bpyear">${bp.year}</span>
            </div>
            <div class="cpu2-bpmeta">${bp.nmEra} nm · ${bp.ghzEra<1?Math.round(bp.ghzEra*1000)+' MHz':bp.ghzEra.toFixed(2)+' GHz'}</div>
            <p class="cpu2-bpdesc">${bp.desc}</p>
            <div class="cpu2-bptags">${[...new Set(bp.components)].map(t=>`<span class="cpu2-ptag sm" style="background:${CATALOG[t]?.color||'#888'}">${CATALOG[t]?.tag||t}</span>`).join('')}</div>
            <button class="cpu2-bpimport" data-bp="${bp.id}">Import Blueprint</button>
          </div>`).join('')}</div>`;
        $$('.cpu2-bpimport', cnt).forEach(b => b.addEventListener('click', () => {
          importBlueprint(b.dataset.bp); closeModal();
        }));
      }
    }
  }

  function buyPart(id) {
    const c = CATALOG[id]; if (!c || state.money < c.price) return;
    state.money -= c.price;
    const n = state.nodes.length;
    state.nodes.push({ uid: uidSeq++, type: id, props: defaultProps(id),
      x: clamp(100 + (n % 6) * 210 + (n%2)*20, 8, WORLD_W - NODE_W - 8),
      y: clamp(80 + Math.floor(n/6) * 180, 8, WORLD_H - 180) });
    save(); renderAll();
  }

  /* BLUEPRINT IMPORT */
  function importBlueprint(id) {
    const bp = BLUEPRINTS.find(b => b.id === id); if (!bp) return;
    if (state.nodes.length > 0 && !confirm(`Replace current blueprint with ${bp.name}?`)) return;
    state.nodes = []; state.wires = []; pending = null; selectedUid = null;

    const typeInstances = {};
    bp.components.forEach(type => {
      if (!CATALOG[type]) return;
      const uid = uidSeq++;
      (typeInstances[type] = typeInstances[type] || []).push(uid);
      state.nodes.push({ uid, type, props: defaultProps(type), x: 0, y: 0 });
    });

    bp.wires.forEach(([tA, pA, tB, pB]) => {
      const uidA = (typeInstances[tA] || [])[0];
      const uidB = (typeInstances[tB] || [])[0];
      if (!uidA || !uidB || uidA === uidB) return;
      const res = canConnect(uidA, pA, uidB, pB);
      if (res.ok) state.wires.push({ aUid: uidA, aPort: pA, bUid: uidB, bPort: pB });
    });

    autoArrange(); save(); renderAll();
  }

  /* RESEARCH */
  function renderResearchModal(box) {
    checkResearch();
    box.innerHTML = `
      <div class="cpu2-mhead">
        <h2>Research &amp; Development</h2>
        <button class="cpu2-mclose" id="cpu2-mclose">×</button>
      </div>
      <p class="cpu2-res-intro">Unlock smaller process nodes for higher clocks and lower heat.</p>
      <div class="cpu2-res-list" id="cpu2-res-list"></div>`;
    $('#cpu2-mclose').addEventListener('click', closeModal);
    updateResearchProgress();
  }

  function updateResearchProgress() {
    const list = $('#cpu2-res-list'); if (!list) return;
    const now = Date.now();
    list.innerHTML = NM_TIERS.map((t, i) => {
      const unlocked = state.unlockedTiers.includes(i) || i === 0;
      const isCurrent = state.tierIdx === i;
      const isActive = state.activeResearch?.tierIdx === i;
      const elapsed = isActive ? (now - state.activeResearch.startTime) / 1000 : 0;
      const pct = isActive ? clamp(elapsed / Math.max(1,t.researchSec) * 100, 0, 99) : (unlocked ? 100 : 0);
      const rem = isActive ? Math.max(0, Math.ceil(t.researchSec - elapsed)) : 0;

      let action = '';
      if (isCurrent) action = '<span class="cpu2-res-cur">● Current node</span>';
      else if (unlocked) action = '<span class="cpu2-res-done">✔ Unlocked</span>';
      else if (isActive) action = `<span class="cpu2-res-prog">${rem}s remaining</span><div class="cpu2-res-bar"><i style="width:${pct.toFixed(1)}%"></i></div>`;
      else {
        const canStart = !state.activeResearch && state.money >= t.researchCost;
        action = `<button class="cpu2-res-btn" data-tier="${i}" ${canStart?'':'disabled'}>Research — ${money(t.researchCost)} + ${t.researchSec}s</button>`;
      }

      return `<div class="cpu2-res-row${isCurrent?' cur':''}${unlocked&&!isCurrent?' done':''}">
        <div class="cpu2-res-nm">${t.nm}<small>nm</small></div>
        <div class="cpu2-res-info">
          <div class="cpu2-res-specs">Clock ceil: <b>${t.clockCeil} GHz</b> · Heat: <b>×${t.heatK}</b> · Fab: <b>${money(t.fab)}/chip</b></div>
          <div>${action}</div>
        </div>
      </div>`;
    }).join('');

    $$('.cpu2-res-btn:not([disabled])', list).forEach(btn => btn.addEventListener('click', () => {
      const i = +btn.dataset.tier, t = NM_TIERS[i];
      if (state.money < t.researchCost || state.activeResearch) return;
      state.money -= t.researchCost;
      state.activeResearch = { tierIdx: i, startTime: Date.now() };
      save(); updateResearchProgress();
      const m = $('#cpu2-money'); if (m) m.textContent = money(state.money);
    }));
  }

  /* MY CPUS */
  function renderMyCPUsModal(box) {
    box.innerHTML = `
      <div class="cpu2-mhead">
        <h2>My CPUs</h2>
        <button class="cpu2-mclose" id="cpu2-mclose">×</button>
      </div>
      <div class="cpu2-mycpus">${state.soldCPUs.length === 0
        ? '<p class="cpu2-empty">No CPUs sold yet — build one and list it!</p>'
        : state.soldCPUs.map(c => `
          <div class="cpu2-cccard">
            <div class="cpu2-cc-hd">
              <b>${c.name}</b>
              <span class="cpu2-cc-stars">${starsStr(c.stars)}</span>
            </div>
            <div class="cpu2-cc-specs">${c.nm} nm · ${c.ghz} GHz · Perf ${c.perf} · ${c.tempC}°C · ${c.stability}% stable${c.dieMm2?' · '+c.dieMm2+' mm²':''}</div>
            <div class="cpu2-cc-price">Sold for ${money(c.price)} · ${new Date(c.date).toLocaleDateString()}</div>
          </div>`).join('')
      }</div>`;
    $('#cpu2-mclose').addEventListener('click', closeModal);
  }

  /* ENTRY POINT */
  window.wireCpuBuilder = function wireCpuBuilder() {
    if (!$('#cpu-app')) return;
    pending = null; isPanning = false; selectedUid = null;
    if (researchTimer) { clearInterval(researchTimer); researchTimer = null; }
    document.body.classList.add('cpu-fullscreen');
    const cleanup = () => {
      document.body.classList.remove('cpu-fullscreen');
      if (_panMove) { document.removeEventListener('mousemove', _panMove); _panMove = null; }
      if (_panUp)   { document.removeEventListener('mouseup',   _panUp);   _panUp = null; }
      if (researchTimer) { clearInterval(researchTimer); researchTimer = null; }
    };
    window.addEventListener('hashchange', cleanup, { once: true });
    build();
  };
})();
