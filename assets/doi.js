/* =========================================================
   doi.js — Department of Insurgency
   Multi-server Discord-style shell: auth, profile, servers,
   channels, chat, friends. Server-backed (same-origin API).
   ========================================================= */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const TOKEN_KEY = 'doi.token';
  const LOGO_URL       = 'assets/img/doi-logo.png?v=20260716b';
  const HERO_TEAM_URL  = 'assets/img/hero-team.png?v=20260716b';
  const HERO_GATE_URL  = 'assets/img/hero-gate.png?v=20260716b';
  window.DOI_LOGO_URL = LOGO_URL;

  /* ---------- CACHE ---------- */
  const cache = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    profile: null,                     // { name, tag, bio, avatar, bannerColor, pronouns, messagePrivacy, isDOI }
    servers: null,                     // [brief]
    serversFull: {},                   // id -> full
    chat: {},                          // `${serverId}:${channelId}` -> messages
    chatSince: {},                     // same key -> ts
    friends: null,                     // list
    friendReqs: { incoming: [], outgoing: [] },
    dms: null,                         // conversation list (dms + groups)
    dmMessages: {},                    // otherKey -> messages
    dmSince: {},                       // otherKey -> ts
    groupsFull: {},                    // gid -> full group
    groupMessages: {},                 // gid -> messages
    groupSince: {},                    // gid -> ts
    lastServersFetch: 0,
    lastFriendsFetch: 0,
    lastReqsFetch: 0,
    lastDMsFetch: 0,
  };

  /* ---------- STATE ---------- */
  const state = window.__doiHomeState = window.__doiHomeState || {
    server: 'home',                    // 'home' or serverId
    channel: null,                     // channelId within current server
    homeView: 'friends',               // 'friends' | 'dm' | 'group' | 'shop'
    friendTab: 'all',                  // 'online' | 'all' | 'pending' | 'add'
    dmWith: null,                      // userKey when homeView='dm'
    groupWith: null,                   // groupId when homeView='group'
    dmSearch: '',                      // filter for "Find or start a conversation"
    shopTab: 'all',                    // 'premium' hero-focus | 'all'
    shopCat: 'all',                    // category filter within the shop page
  };

  /* ---------- API ---------- */
  async function jfetch(url, opts = {}) {
    const r = await fetch(url, { cache: 'no-store', ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });
    let body = null;
    try { body = await r.json(); } catch (_) {}
    if (!r.ok) {
      const err = new Error((body && body.error) || ('HTTP ' + r.status));
      err.status = r.status; err.body = body;
      throw err;
    }
    return body || {};
  }
  const q = v => encodeURIComponent(v);
  const api = {
    register: (user, pass) => jfetch('/api/register', { method: 'POST', body: JSON.stringify({ user, pass }) }),
    login:    (user, pass) => jfetch('/api/login',    { method: 'POST', body: JSON.stringify({ user, pass }) }),
    me:       () => jfetch('/api/doi/me?token=' + q(cache.token || '')),
    saveProfile: (patch) => jfetch('/api/doi/me', { method: 'POST', body: JSON.stringify({ token: cache.token, ...patch }) }),
    shop:      () => jfetch('/api/doi/shop?token=' + q(cache.token || '')),
    shopAdmin: (patch) => jfetch('/api/doi/shop/admin', { method: 'POST', body: JSON.stringify({ token: cache.token, ...patch }) }),
    shopBuy:   (id) => jfetch('/api/doi/shop/buy',   { method: 'POST', body: JSON.stringify({ token: cache.token, id }) }),
    shopEquip: (patch) => jfetch('/api/doi/shop/equip', { method: 'POST', body: JSON.stringify({ token: cache.token, ...patch }) }),
    shopClaim: () => jfetch('/api/doi/shop/claim', { method: 'POST', body: JSON.stringify({ token: cache.token }) }),

    servers:      () => jfetch('/api/doi/servers?token=' + q(cache.token || '')),
    server:       (id) => jfetch('/api/doi/servers/' + q(id) + '?token=' + q(cache.token || '')),
    createServer: (name, description) => jfetch('/api/doi/servers', { method: 'POST', body: JSON.stringify({ token: cache.token, name, description }) }),
    joinServer:   (id) => jfetch('/api/doi/servers/' + q(id) + '/join',  { method: 'POST', body: JSON.stringify({ token: cache.token }) }),
    leaveServer:  (id) => jfetch('/api/doi/servers/' + q(id) + '/leave', { method: 'POST', body: JSON.stringify({ token: cache.token }) }),
    serverSettings: (id, patch) => jfetch('/api/doi/servers/' + q(id) + '/settings', { method: 'POST', body: JSON.stringify({ token: cache.token, ...patch }) }),
    deleteServer:  (id) => jfetch('/api/doi/servers/' + q(id) + '/delete', { method: 'POST', body: JSON.stringify({ token: cache.token }) }),
    newCategory:   (sid, name) => jfetch('/api/doi/servers/' + q(sid) + '/categories', { method: 'POST', body: JSON.stringify({ token: cache.token, name }) }),
    deleteCategory:(sid, cid) => jfetch('/api/doi/servers/' + q(sid) + '/categories/' + q(cid) + '/delete', { method: 'POST', body: JSON.stringify({ token: cache.token }) }),
    newChannel:    (sid, name, categoryId, topic) => jfetch('/api/doi/servers/' + q(sid) + '/channels', { method: 'POST', body: JSON.stringify({ token: cache.token, name, categoryId, topic }) }),
    deleteChannel: (sid, cid) => jfetch('/api/doi/servers/' + q(sid) + '/channels/' + q(cid) + '/delete', { method: 'POST', body: JSON.stringify({ token: cache.token }) }),
    chat:      (sid, cid, since) => jfetch('/api/doi/servers/' + q(sid) + '/chat/' + q(cid) + '?token=' + q(cache.token || '') + (since ? '&since=' + since : '')),
    sendChat:  (sid, cid, text)  => jfetch('/api/doi/servers/' + q(sid) + '/chat/' + q(cid), { method: 'POST', body: JSON.stringify({ token: cache.token, text }) }),

    friends:      () => jfetch('/api/doi/friends?token=' + q(cache.token || '')),
    friendRequests: () => jfetch('/api/doi/friends/requests?token=' + q(cache.token || '')),
    sendFriendReq:  (callsign) => jfetch('/api/doi/friends/request', { method: 'POST', body: JSON.stringify({ token: cache.token, callsign }) }),
    acceptFriend:   (fromKey)  => jfetch('/api/doi/friends/accept',  { method: 'POST', body: JSON.stringify({ token: cache.token, from: fromKey }) }),
    declineFriend:  (otherKey) => jfetch('/api/doi/friends/decline', { method: 'POST', body: JSON.stringify({ token: cache.token, from: otherKey, to: otherKey }) }),
    removeFriend:   (callsign) => jfetch('/api/doi/friends/remove',  { method: 'POST', body: JSON.stringify({ token: cache.token, callsign }) }),

    dms:            () => jfetch('/api/doi/dms?token=' + q(cache.token || '')),
    dm:  (otherKey, since) => jfetch('/api/doi/dms/' + q(otherKey) + '?token=' + q(cache.token || '') + (since ? '&since=' + since : '')),
    sendDM: (otherKey, text) => jfetch('/api/doi/dms/' + q(otherKey), { method: 'POST', body: JSON.stringify({ token: cache.token, text }) }),
    closeDM: (otherKey) => jfetch('/api/doi/dms/' + q(otherKey) + '/close', { method: 'POST', body: JSON.stringify({ token: cache.token }) }),
    editChat:  (sid, cid, mid, text) => jfetch('/api/doi/servers/' + q(sid) + '/chat/' + q(cid) + '/edit',   { method: 'POST', body: JSON.stringify({ token: cache.token, mid, text }) }),
    delChat:   (sid, cid, mid)       => jfetch('/api/doi/servers/' + q(sid) + '/chat/' + q(cid) + '/delete', { method: 'POST', body: JSON.stringify({ token: cache.token, mid }) }),
    editDM:    (otherKey, mid, text) => jfetch('/api/doi/dms/' + q(otherKey) + '/edit',   { method: 'POST', body: JSON.stringify({ token: cache.token, mid, text }) }),
    delDM:     (otherKey, mid)       => jfetch('/api/doi/dms/' + q(otherKey) + '/delete', { method: 'POST', body: JSON.stringify({ token: cache.token, mid }) }),

    createGroup: (name, members) => jfetch('/api/doi/groups', { method: 'POST', body: JSON.stringify({ token: cache.token, name, members }) }),
    group:       (gid) => jfetch('/api/doi/groups/' + q(gid) + '?token=' + q(cache.token || '')),
    groupMsgs:   (gid, since) => jfetch('/api/doi/groups/' + q(gid) + '/messages?token=' + q(cache.token || '') + (since ? '&since=' + since : '')),
    sendGroup:   (gid, text) => jfetch('/api/doi/groups/' + q(gid) + '/messages', { method: 'POST', body: JSON.stringify({ token: cache.token, text }) }),
    groupInvite: (gid, callsign) => jfetch('/api/doi/groups/' + q(gid) + '/invite',  { method: 'POST', body: JSON.stringify({ token: cache.token, callsign }) }),
    groupRemove: (gid, callsign) => jfetch('/api/doi/groups/' + q(gid) + '/remove',  { method: 'POST', body: JSON.stringify({ token: cache.token, callsign }) }),
    groupLeave:  (gid) => jfetch('/api/doi/groups/' + q(gid) + '/leave',   { method: 'POST', body: JSON.stringify({ token: cache.token }) }),
    groupSettings:(gid, patch) => jfetch('/api/doi/groups/' + q(gid) + '/settings', { method: 'POST', body: JSON.stringify({ token: cache.token, ...patch }) }),
    editGroupMsg: (gid, mid, text) => jfetch('/api/doi/groups/' + q(gid) + '/messages/edit',   { method: 'POST', body: JSON.stringify({ token: cache.token, mid, text }) }),
    delGroupMsg:  (gid, mid)       => jfetch('/api/doi/groups/' + q(gid) + '/messages/delete', { method: 'POST', body: JSON.stringify({ token: cache.token, mid }) }),

    publicProfile: (userKey) => jfetch('/api/doi/profile/' + q(userKey) + '?token=' + q(cache.token || '')),
  };

  /* ---------- HELPERS ---------- */
  function timeAgo(ts) {
    const d = Date.now() - ts;
    if (d < 60_000) return 'just now';
    if (d < 3_600_000) return Math.floor(d/60_000) + 'm';
    if (d < 86_400_000) return Math.floor(d/3_600_000) + 'h';
    const day = Math.floor(d / 86_400_000);
    if (day < 7) return day + 'd';
    return new Date(ts).toLocaleDateString();
  }
  // Discord-style stamps
  function sameDay(a, b) { const x = new Date(a), y = new Date(b); return x.getFullYear()===y.getFullYear() && x.getMonth()===y.getMonth() && x.getDate()===y.getDate(); }
  function clock(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function fmtStamp(ts) {
    const now = Date.now();
    if (sameDay(ts, now)) return 'Today at ' + clock(ts);
    if (sameDay(ts, now - 86_400_000)) return 'Yesterday at ' + clock(ts);
    return new Date(ts).toLocaleDateString(undefined, { month:'numeric', day:'numeric', year:'2-digit' }) + ', ' + clock(ts);
  }
  function fmtDivider(ts) {
    return new Date(ts).toLocaleDateString(undefined, { month:'long', day:'numeric', year:'numeric' });
  }
  function avatarHTML(name, dataUrl, size) {
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    const style = size ? `style="width:${size}px;height:${size}px"` : '';
    if (name === 'DOI') return `<div class="doi-avatar" ${style}><img src="${LOGO_URL}" alt="DOI"/></div>`;
    if (dataUrl) return `<div class="doi-avatar" ${style}><img src="${esc(dataUrl)}" alt=""/></div>`;
    return `<div class="doi-avatar" ${style}>${esc(initial)}</div>`;
  }
  function serverIconHTML(s) {
    if (s.icon) return `<img src="${esc(s.icon)}" alt="${esc(s.name)}"/>`;
    if (s.isFlagship || s.name === 'DOI · Site-CI') return `<img src="${LOGO_URL}" alt="DOI"/>`;
    // initials fallback
    const initials = s.name.split(/[\s·\-_]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    return `<span class="doi-srv-initials">${esc(initials || '?')}</span>`;
  }
  function isAuthed() { return !!cache.token && !!cache.profile; }
  function isDOI() { return isAuthed() && cache.profile.name === 'DOI'; }
  window.DOI_IS_DOI = isDOI;

  // darken a #rrggbb hex by `amt` (0..1) for the accent-2 / hover shade
  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    let n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * (1 - amt))));
    g = Math.max(0, Math.min(255, Math.round(g * (1 - amt))));
    b = Math.max(0, Math.min(255, Math.round(b * (1 - amt))));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function applyTheme() {
    // Everyone runs Midnight (liquid glass). Only the owner may switch to the
    // Classic or Insurgency looks — for users those themes are off-site.
    const themeName = (cache.profile && cache.profile.theme) || 'midnight';
    const wantIns = isDOI() && themeName === 'insurgency';
    const wantClassic = isDOI() && themeName === 'discord';
    const wantMid = !wantIns && !wantClassic;
    document.body.classList.toggle('doi-theme-insurgency', !!wantIns);
    document.body.classList.toggle('doi-theme-midnight', !!wantMid);
    if (typeof window.__doiMountBubbles === 'function') window.__doiMountBubbles();
    const root = document.documentElement;
    if (wantIns) {
      // Insurgency theme keeps its own red accent (from CSS); just make the
      // global scrollbar/selection follow it too.
      root.style.removeProperty('--doi-accent');
      root.style.removeProperty('--doi-accent-2');
      root.style.setProperty('--accent', '#c8102e');
      root.style.setProperty('--accent-ink', '#c8102e');
      return;
    }
    // Per-user accent (falls back to owner-set site default → blurple-blue).
    const accent = (cache.profile && cache.profile.accent) || '#5865f2';
    root.style.setProperty('--doi-accent', accent);
    root.style.setProperty('--doi-accent-2', shade(accent, 0.18));
    // Override the docs-site red that drives global scrollbar + ::selection.
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-ink', accent);
  }

  /* ---------- LOGIN GATE ---------- */
  function renderGate(mode = 'login', err = '') {
    const gate = $('#doiGate');
    if (!gate) return;
    gate.hidden = false;
    gate.innerHTML = `
      <div class="doi-gate-inner">
        <div class="doi-gate-badge"><img src="${LOGO_URL}" alt="DOI"/></div>
        <h1>${mode==='login' ? 'Welcome back!' : 'Create an account'}</h1>
        <p class="doi-motto">${mode==='login' ? "We're so excited to see you again." : 'Join the Novalis network.'}</p>
        <div class="doi-tabs" role="tablist">
          <button data-mode="login" class="${mode==='login'?'active':''}">Sign In</button>
          <button data-mode="register" class="${mode==='register'?'active':''}">Register</button>
        </div>
        <form id="doiGateForm" autocomplete="off">
          <div class="doi-field">
            <label>Username</label>
            <input name="user" required minlength="3" maxlength="16" pattern="[A-Za-z0-9_]{3,16}"
              placeholder="e.g. Vector_7" autocomplete="off"/>
            <div class="doi-hint">3–16 chars · letters, numbers, underscore.</div>
          </div>
          <div class="doi-field">
            <label>Password</label>
            <input name="pass" type="password" required minlength="4" placeholder="At least 4 characters"/>
            <div class="doi-hint">Hashed on the server. Never logged.</div>
          </div>
          ${err ? `<div class="doi-gate-err">${esc(err)}</div>` : ''}
          <button class="doi-gate-submit" type="submit">
            ${mode==='login' ? 'Log In' : 'Continue'}
          </button>
        </form>
        <div class="doi-gate-foot">Novalis · same-origin server</div>
      </div>`;
    $$('.doi-tabs button', gate).forEach(b => b.addEventListener('click', () => renderGate(b.dataset.mode)));
    $('#doiGateForm', gate).addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const user = String(fd.get('user') || '').trim();
      const pass = String(fd.get('pass') || '');
      if (!/^[A-Za-z0-9_]{3,16}$/.test(user)) return renderGate(mode, 'Callsign must be 3–16 chars, letters/numbers/_ only.');
      if (pass.length < 4) return renderGate(mode, 'Cipher too short.');
      const btn = $('.doi-gate-submit', gate);
      btn.disabled = true; btn.textContent = '… authenticating';
      try {
        const r = mode === 'login' ? await api.login(user, pass) : await api.register(user, pass);
        cache.token = r.token; localStorage.setItem(TOKEN_KEY, cache.token);
        const me = await api.me();
        cache.profile = me.profile;
        applyTheme();
        // fetch initial data before rendering the shell
        await Promise.all([loadServers(), loadFriends(), loadFriendRequests(), loadDMs(), preloadShop()]);
        gate.hidden = true;
        if (typeof window.__doiRender === 'function') window.__doiRender();
        window.dispatchEvent(new CustomEvent('doi:auth'));
      } catch (e2) {
        renderGate(mode, e2.message || 'Authentication failed');
      }
    });
  }
  function signOut() {
    cache.token = null; cache.profile = null;
    localStorage.removeItem(TOKEN_KEY);
    state.server = 'home'; state.channel = null; state.friendTab = 'all';
    stopPoll();
    renderGate('login');
  }

  /* ---------- POLLING (single interval, guarded) ---------- */
  let pollTimer = null;
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(pollTick, 4000);
  }
  async function pollTick() {
    try {
      if (state.server !== 'home' && state.channel) {
        const key = state.server + ':' + state.channel;
        const since = cache.chatSince[key] || 0;
        const r = await api.chat(state.server, state.channel, since);
        if (r.messages && r.messages.length) {
          const prev = cache.chat[key] || [];
          cache.chat[key] = since ? [...prev, ...r.messages] : r.messages;
          cache.chatSince[key] = cache.chat[key][cache.chat[key].length - 1].ts;
          rerenderMainSoft();
        } else if (!cache.chat[key]) {
          cache.chat[key] = r.messages || [];
        }
      } else if (state.server === 'home' && state.homeView === 'dm' && state.dmWith) {
        const otherKey = state.dmWith;
        const since = cache.dmSince[otherKey] || 0;
        const r = await api.dm(otherKey, since);
        if (r.messages && r.messages.length) {
          const prev = cache.dmMessages[otherKey] || [];
          cache.dmMessages[otherKey] = since ? [...prev, ...r.messages] : r.messages;
          cache.dmSince[otherKey] = cache.dmMessages[otherKey][cache.dmMessages[otherKey].length - 1].ts;
          rerenderMainSoft();
        }
      } else if (state.server === 'home' && state.homeView === 'group' && state.groupWith) {
        const gid = state.groupWith;
        const since = cache.groupSince[gid] || 0;
        const r = await api.groupMsgs(gid, since);
        if (r.messages && r.messages.length) {
          const prev = cache.groupMessages[gid] || [];
          cache.groupMessages[gid] = since ? [...prev, ...r.messages] : r.messages;
          cache.groupSince[gid] = cache.groupMessages[gid][cache.groupMessages[gid].length - 1].ts;
          rerenderMainSoft();
        }
      }
      // While sitting on Home, refresh the conversation list so new incoming
      // DMs/groups appear without a manual navigation.
      if (state.server === 'home') {
        pollDMListTick();
      }
    } catch (_) { /* ignore transient network */ }
  }
  let lastDMListPoll = 0;
  async function pollDMListTick() {
    if (Date.now() - lastDMListPoll < 8000) return; // every ~8s
    lastDMListPoll = Date.now();
    const before = JSON.stringify((cache.dms || []).map(c => (c.kind === 'group' ? 'g:' + c.id + ':' + c.lastTs : 'd:' + (c.other && c.other.key) + ':' + c.lastTs)));
    await loadDMs();
    const after = JSON.stringify((cache.dms || []).map(c => (c.kind === 'group' ? 'g:' + c.id + ':' + c.lastTs : 'd:' + (c.other && c.other.key) + ':' + c.lastTs)));
    if (before !== after) rerenderSidebarOnly();
  }

  /* ---------- LOADERS ---------- */
  async function loadServers() {
    try {
      const r = await api.servers();
      cache.servers = r.servers || [];
      cache.lastServersFetch = Date.now();
    } catch (_) { cache.servers = cache.servers || []; }
  }
  async function loadServer(id) {
    try {
      const r = await api.server(id);
      if (r.server) cache.serversFull[id] = r.server;
      return cache.serversFull[id];
    } catch (_) { return cache.serversFull[id] || null; }
  }
  async function loadChat(sid, cid) {
    const key = sid + ':' + cid;
    try {
      const r = await api.chat(sid, cid);
      cache.chat[key] = r.messages || [];
      if (cache.chat[key].length) cache.chatSince[key] = cache.chat[key][cache.chat[key].length - 1].ts;
    } catch (_) { cache.chat[key] = cache.chat[key] || []; }
  }
  async function loadFriends() {
    try {
      const r = await api.friends();
      cache.friends = r.friends || [];
      cache.lastFriendsFetch = Date.now();
    } catch (_) { cache.friends = cache.friends || []; }
  }
  async function loadFriendRequests() {
    try {
      const r = await api.friendRequests();
      cache.friendReqs = { incoming: r.incoming || [], outgoing: r.outgoing || [] };
      cache.lastReqsFetch = Date.now();
    } catch (_) { cache.friendReqs = cache.friendReqs || { incoming: [], outgoing: [] }; }
  }
  async function loadDMs() {
    try {
      const r = await api.dms();
      cache.dms = r.dms || [];
      cache.lastDMsFetch = Date.now();
    } catch (_) { cache.dms = cache.dms || []; }
  }
  async function loadDMMessages(otherKey) {
    try {
      const r = await api.dm(otherKey);
      cache.dmMessages[otherKey] = r.messages || [];
      if (r.other) { cache.dmPeers = cache.dmPeers || {}; cache.dmPeers[otherKey] = r.other; }
      if (r.messages && r.messages.length) cache.dmSince[otherKey] = r.messages[r.messages.length - 1].ts;
    } catch (_) { cache.dmMessages[otherKey] = cache.dmMessages[otherKey] || []; }
  }
  async function loadGroup(gid) {
    try {
      const r = await api.group(gid);
      if (r.group) {
        cache.groupsFull[gid] = r.group;
        cache.groupMessages[gid] = r.group.messages || [];
        if (cache.groupMessages[gid].length) cache.groupSince[gid] = cache.groupMessages[gid][cache.groupMessages[gid].length - 1].ts;
      }
      return cache.groupsFull[gid];
    } catch (_) { return cache.groupsFull[gid] || null; }
  }

  /* Pre-load whatever's needed for the current view. Called once per navigation. */
  async function preload() {
    const jobs = [];
    if (!cache.servers || Date.now() - cache.lastServersFetch > 60_000) jobs.push(loadServers());
    if (state.server === 'home') {
      if (!cache.friends   || Date.now() - cache.lastFriendsFetch > 30_000) jobs.push(loadFriends());
      if (!cache.friendReqs || Date.now() - cache.lastReqsFetch    > 30_000) jobs.push(loadFriendRequests());
      if (!cache.dms       || Date.now() - cache.lastDMsFetch     > 30_000) jobs.push(loadDMs());
      if (state.homeView === 'dm' && state.dmWith && !cache.dmMessages[state.dmWith]) jobs.push(loadDMMessages(state.dmWith));
      if (state.homeView === 'group' && state.groupWith && !cache.groupsFull[state.groupWith]) jobs.push(loadGroup(state.groupWith));
    } else {
      if (!cache.serversFull[state.server]) jobs.push(loadServer(state.server));
      if (state.channel) {
        const key = state.server + ':' + state.channel;
        if (!cache.chat[key]) jobs.push(loadChat(state.server, state.channel));
      }
    }
    await Promise.all(jobs);
  }

  /* ---------- SHELL ---------- */
  function renderShell() {
    const p = cache.profile || { name: '…', tag: '#0000', bio: '' };
    const servers = cache.servers || [];

    return `
      <div class="doi-shell">
        ${renderRail(servers)}
        ${renderSidebar()}
        <div class="doi-main">${renderMain()}</div>
      </div>
      ${modalHTML()}`;
  }

  function renderRail(servers) {
    return `
      <div class="doi-rail">
        <div class="doi-rail-item ${state.server === 'home' ? 'active' : ''}" title="Home · Friends" data-shell-nav="home">
          <img src="${LOGO_URL}" alt="Home" class="doi-rail-logo"/>
        </div>
        <div class="doi-rail-sep"></div>
        ${servers.map(s => `
          <div class="doi-rail-item doi-rail-srv ${state.server === s.id ? 'active' : ''}" title="${esc(s.name)}" data-shell-nav="server" data-sid="${esc(s.id)}">
            ${serverIconHTML(s)}
          </div>`).join('')}
        <div class="doi-rail-item doi-rail-add" title="Create / join a server" data-shell-newserver>+</div>
        ${isDOI() ? `
        <div class="doi-rail-sep"></div>
        <a class="doi-rail-item" title="Admin Console" href="#/admin" data-link>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z"/></svg>
        </a>
        <a class="doi-rail-item" title="AI Cores" href="#/ai" data-link>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>
        </a>
        <a class="doi-rail-item" title="CPU Builder" href="#/cpu-builder" data-link>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>
        </a>` : ''}
        <div class="doi-rail-sep"></div>
        <div class="doi-rail-item doi-signout" title="Sign out" data-shell-signout>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
        </div>
      </div>`;
  }

  function renderSidebar() {
    const p = cache.profile || { name:'…', tag:'#0000', bio:'' };
    if (state.server === 'home') {
      const all = cache.dms || [];
      const term = (state.dmSearch || '').trim().toLowerCase();
      const dms = term
        ? all.filter(c => convoTitle(c).toLowerCase().includes(term))
        : all;
      const reqCount = (cache.friendReqs.incoming || []).length;
      return `
        <div class="doi-channels doi-channels-home">
          <div class="doi-home-search">
            <input placeholder="Find or start a conversation" id="doi-dm-search" value="${esc(state.dmSearch||'')}"/>
          </div>
          <div class="doi-chan-scroll">
            <div class="doi-home-nav ${state.homeView==='friends'?'active':''}" data-shell-nav="home-friends">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>Friends</span>
              ${reqCount ? `<span class="doi-badge-count">${reqCount}</span>` : ''}
            </div>
            <div class="doi-home-nav doi-home-nav-soft ${state.homeView==='shop'&&state.shopTab==='premium'?'active':''}" data-shell-shop="premium">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.5 7.5H22l-6 4.5 2.5 7.5L12 17l-6.5 4.5L8 14l-6-4.5h7.5z"/></svg>
              <span>Premium</span>
            </div>
            <div class="doi-home-nav doi-home-nav-soft ${state.homeView==='shop'&&state.shopTab!=='premium'?'active':''}" data-shell-shop="all">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>
              <span>Shop</span>
            </div>
            <div class="doi-catlabel doi-catlabel-dm">
              <span>Direct Messages</span>
              <button class="doi-catadd" data-shell-newdm title="Create DM / Group">+</button>
            </div>
            <div id="doi-dm-list">
              ${dms.length ? dms.map(convoRow).join('')
                : `<div class="doi-empty" style="padding:12px 8px;font-size:11px">${term ? 'no matches' : 'no conversations yet'}</div>`}
            </div>
          </div>
          ${userPanel(p)}
        </div>`;
    }
    // server view
    const s = cache.serversFull[state.server];
    if (!s) return `
      <div class="doi-channels">
        <div class="doi-guildhead">Loading…</div>
        <div class="doi-chan-scroll"><div class="doi-empty" style="padding:20px 10px;font-size:11px">fetching server…</div></div>
        ${userPanel(p)}
      </div>`;
    const uncategorized = (s.channels || []).filter(c => !c.categoryId);
    const cats = (s.categories || []).slice().sort((a, b) => (a.order||0) - (b.order||0));
    return `
      <div class="doi-channels">
        <div class="doi-guildhead doi-guildhead-clickable" data-shell-serversettings>
          <span class="doi-guildhead-name">${esc(s.name)}</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="doi-chan-scroll">
          ${uncategorized.length ? uncategorized.map(c => channelRow(c)).join('') : ''}
          ${cats.map(cat => `
            <div class="doi-catlabel">
              <span class="doi-chev">▾</span>
              <span>${esc(cat.name)}</span>
              ${s.isOwner ? `<button class="doi-catadd" data-newchannel="${esc(cat.id)}" title="New channel">+</button>` : ''}
            </div>
            ${(s.channels || []).filter(c => c.categoryId === cat.id).map(c => channelRow(c)).join('')}
          `).join('')}
          ${s.isOwner ? `<button class="doi-newcat-btn" data-shell-newcategory>+ New category</button>` : ''}
        </div>
        ${userPanel(p)}
      </div>`;
  }
  function channelRow(c) {
    const active = state.channel === c.id;
    const canDelete = cache.serversFull[state.server] && cache.serversFull[state.server].isOwner;
    return `<div class="doi-ch ${active?'active':''}" data-shell-nav="channel" data-cid="${esc(c.id)}">
      <span class="doi-hash">#</span>
      <span class="doi-ch-name">${esc(c.name)}</span>
      ${canDelete ? `<button class="doi-ch-del" data-del-channel="${esc(c.id)}" title="Delete channel">×</button>` : ''}
    </div>`;
  }
  function convoTitle(c) {
    if (c.kind === 'group') return c.name || c.autoName || 'Group';
    return (c.other && c.other.name) || '';
  }
  // Stacked mini-avatars for a group icon (falls back to a group glyph).
  function groupIconHTML(c, size) {
    if (c.icon) return `<div class="doi-avatar doi-group-icon" style="width:${size}px;height:${size}px"><img src="${esc(c.icon)}" alt=""/></div>`;
    const mem = (c.members || []).filter(m => !cache.profile || m.key !== cache.profile.key).slice(0, 2);
    if (mem.length >= 2) {
      return `<div class="doi-group-stack" style="width:${size}px;height:${size}px">
        <div class="doi-group-stack-a">${avatarHTML(mem[0].name, mem[0].avatar, size*0.62)}</div>
        <div class="doi-group-stack-b">${avatarHTML(mem[1].name, mem[1].avatar, size*0.62)}</div>
      </div>`;
    }
    return `<div class="doi-avatar doi-group-icon" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 24 24" width="${size*0.5}" height="${size*0.5}" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>`;
  }
  function convoRow(c) {
    const title = convoTitle(c);
    if (c.kind === 'group') {
      const active = state.homeView === 'group' && state.groupWith === c.id;
      return `<div class="doi-dm-row ${active?'active':''}" data-shell-nav="group" data-gid="${esc(c.id)}" data-title="${esc(title.toLowerCase())}">
        ${groupIconHTML(c, 32)}
        <div class="doi-dm-info">
          <div class="doi-dm-name">${esc(title)}</div>
          <div class="doi-dm-last">${c.memberCount} Members</div>
        </div>
        <button class="doi-dm-close" data-group-leave="${esc(c.id)}" title="Leave group">×</button>
      </div>`;
    }
    const other = c.other || {};
    const active = state.homeView === 'dm' && state.dmWith === other.key;
    const np = nameplateBits(other);
    return `<div class="doi-dm-row ${active?'active':''} ${np.cls}" data-shell-nav="dm" data-dm-key="${esc(other.key)}" data-title="${esc((other.name||'').toLowerCase())}">
      ${np.html}
      ${avatarHTML(other.name, other.avatar, 32)}
      <div class="doi-dm-info">
        <div class="doi-dm-name">${esc(other.name)}</div>
        ${c.lastText ? `<div class="doi-dm-last">${esc(c.lastText.slice(0, 34))}</div>` : ''}
      </div>
      <button class="doi-dm-close" data-dm-close="${esc(other.key)}" title="Close DM">×</button>
    </div>`;
  }

  function userPanel(p) {
    return `<div class="doi-userpanel">
      <div class="doi-uleft" data-shell-minipopup title="Show profile">
        ${avatarHTML(p.name, p.avatar, 36)}
        <div class="doi-uinfo">
          <div class="doi-uname">${esc(p.name)}${p.isDOI ? ' <span class="doi-badge-owner">OWNER</span>':''}</div>
          <div class="doi-utag doi-online-dot">Online</div>
        </div>
      </div>
      <div class="doi-uctrls">
        <button class="doi-uctrl" data-shell-toggle-mute title="Mute (visual only)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>
        </button>
        <button class="doi-uctrl" data-shell-toggle-deaf title="Deafen (visual only)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
        </button>
        <button class="doi-uctrl" data-shell-opensettings title="User Settings">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </div>`;
  }

  function renderMain() {
    if (state.server === 'home') return renderMainHome();
    const s = cache.serversFull[state.server];
    if (!s) return `<div class="doi-main-head"><h2>Loading…</h2></div><div class="doi-main-body"><div class="doi-empty">fetching server…</div></div>`;
    if (!state.channel) {
      return `
        <div class="doi-main-head"><span class="doi-hash">▸</span><h2>${esc(s.name)}</h2><span class="doi-topic">${esc(s.description || '')}</span></div>
        <div class="doi-main-body">
          <div class="doi-hero">
            <div class="doi-hero-img" style="background-image:url('${HERO_TEAM_URL}')"></div>
            <div class="doi-hero-vign"></div>
            <div class="doi-hero-inner">
              ${s.icon ? `<img class="doi-hero-mark" src="${esc(s.icon)}"/>`
                       : s.isFlagship ? `<img class="doi-hero-mark" src="${LOGO_URL}"/>`
                       : `<div class="doi-hero-mark doi-hero-mark-txt">${esc((s.name[0]||'?').toUpperCase())}</div>`}
              <div class="doi-hero-txt">
                <h1>${esc(s.name)}</h1>
                <p>${s.isOwner ? '▲ OWNER' : '▪ MEMBER'} · ${s.memberCount} operatives</p>
                <p class="doi-motto">${esc(s.description || (s.isFlagship ? 'The flagship server.' : 'Insurgency network node.'))}</p>
              </div>
            </div>
          </div>
          <div class="doi-sec-title">Pick a channel</div>
          <p style="color:#8a8a8a;font-family:var(--mono);font-size:12px">Choose one from the sidebar to start chatting.</p>
        </div>`;
    }
    const ch = (s.channels || []).find(c => c.id === state.channel);
    if (!ch) return `<div class="doi-main-head"><h2>Channel not found</h2></div><div class="doi-main-body"><div class="doi-empty">channel gone. pick another.</div></div>`;
    const key = state.server + ':' + state.channel;
    const msgs = cache.chat[key] || [];
    const head = `<span class="doi-hash">#</span><h2>${esc(ch.name)}</h2><span class="doi-topic">${esc(ch.topic || '')}</span>`;
    const body = `<div class="doi-main-body" id="doi-msgs">
      ${renderMessages(msgs, channelWelcomeHTML(ch))}
    </div>${composerHTML(ch.name)}`;
    return `<div class="doi-main-head">${head}</div>${body}`;
  }

  function renderMainHome() {
    if (state.homeView === 'shop') return renderShopPage();
    if (state.homeView === 'dm' && state.dmWith) return renderMainDM();
    if (state.homeView === 'group' && state.groupWith) return renderMainGroup();
    return renderMainFriends();
  }

  function dmHeaderActions(extra) {
    return `<div class="doi-dm-actions">
      ${extra || ''}
      <button class="doi-dm-act" title="Start Voice Call" data-shell-soft="Voice calls"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
      <button class="doi-dm-act" title="Start Video Call" data-shell-soft="Video calls"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></button>
      <button class="doi-dm-act" title="Pinned Messages" data-shell-soft="Pinned messages"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5M9 10.76V3h6v7.76a2 2 0 0 0 .55 1.38l1.9 2A1 1 0 0 1 16.72 16H7.28a1 1 0 0 1-.73-1.86l1.9-2A2 2 0 0 0 9 10.76z"/></svg></button>
    </div>`;
  }

  function renderMainFriends() {
    const tab = state.friendTab;
    const friends = cache.friends || [];
    const incoming = cache.friendReqs.incoming || [];
    const outgoing = cache.friendReqs.outgoing || [];

    const head = `<span class="doi-hash">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </span><h2>Friends</h2>
      <div class="doi-friend-topbar">
        <button class="doi-friend-tab ${tab==='all'?'active':''}"     data-friend-tab="all">All <b>${friends.length}</b></button>
        <button class="doi-friend-tab ${tab==='online'?'active':''}"  data-friend-tab="online">Online <b>${friends.length}</b></button>
        <button class="doi-friend-tab ${tab==='pending'?'active':''}" data-friend-tab="pending">Pending${incoming.length ? ` <span class="doi-badge-count">${incoming.length}</span>` : ''}</button>
        <button class="doi-friend-tab doi-friend-tab-add ${tab==='add'?'active':''}" data-friend-tab="add">Add Friend</button>
      </div>`;

    let list;
    if (tab === 'add') {
      list = `
        <div class="doi-add-friend-wrap">
          <div class="doi-sec-title" style="margin-top:0">Add Friend</div>
          <p style="color:#a0a0a0;font-size:14px;margin:0 0 10px">You can add friends with their DOI callsign.</p>
          <form id="doiAddFriend" style="display:flex;gap:10px">
            <input id="doiAddFriendInput" placeholder="You can add friends with their DOI callsign." maxlength="16" pattern="[A-Za-z0-9_]{3,16}"/>
            <button type="submit" class="doi-btn-primary" style="padding:10px 18px">Send Friend Request</button>
          </form>
          <div id="doiAddFriendMsg"></div>
        </div>`;
    } else if (tab === 'pending') {
      const inList  = incoming.map(f => pendingRow(f, 'incoming')).join('');
      const outList = outgoing.map(f => pendingRow(f, 'outgoing')).join('');
      list = `
        ${incoming.length ? `<div class="doi-sec-title">Incoming · <b>${incoming.length}</b></div><div class="doi-friend-list">${inList}</div>` : ''}
        ${outgoing.length ? `<div class="doi-sec-title" style="margin-top:20px">Outgoing · <b>${outgoing.length}</b></div><div class="doi-friend-list">${outList}</div>` : ''}
        ${!incoming.length && !outgoing.length ? '<div class="doi-empty" style="text-align:left;padding:14px 0">no pending requests</div>' : ''}`;
    } else {
      // 'all' or 'online' (we don't track online status yet — treat same as all)
      list = friends.length
        ? `<div class="doi-sec-title">All Friends · <b>${friends.length}</b></div><div class="doi-friend-list">${friends.map(friendRow).join('')}</div>`
        : `<div class="doi-hero" style="min-height:120px"><div class="doi-hero-img" style="background-image:url('${HERO_TEAM_URL}')"></div><div class="doi-hero-vign"></div>
            <div class="doi-hero-inner"><div class="doi-hero-txt"><h1>No friends yet</h1><p>Send a friend request from the "Add Friend" tab.</p></div></div></div>`;
    }
    return `<div class="doi-main-head">${head}</div><div class="doi-main-body">${list}</div>`;
  }

  function friendRow(f) {
    const np = nameplateBits(f);
    return `<div class="doi-friend ${np.cls}" data-open-profile="${esc(f.key || (f.name||'').toLowerCase())}">
      ${np.html}
      ${avatarHTML(f.name, f.avatar, 40)}
      <div class="doi-friend-info">
        <div class="doi-friend-name">${esc(f.name)}</div>
        <div class="doi-friend-tag">${esc(f.tag || '')} · ${esc(f.bio || 'Insurgent')}</div>
      </div>
      <div class="doi-friend-actions">
        <button class="doi-friend-msg" data-dm-open="${esc(f.key || (f.name||'').toLowerCase())}" title="Message">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="doi-friend-remove" data-remove-friend="${esc(f.name)}" title="Remove">×</button>
      </div>
    </div>`;
  }

  function pendingRow(f, dir) {
    return `<div class="doi-friend">
      ${avatarHTML(f.name, f.avatar, 40)}
      <div class="doi-friend-info">
        <div class="doi-friend-name">${esc(f.name)}</div>
        <div class="doi-friend-tag">${dir === 'incoming' ? 'incoming friend request' : 'outgoing · waiting'}</div>
      </div>
      <div class="doi-friend-actions">
        ${dir === 'incoming'
          ? `<button class="doi-friend-msg" data-accept-friend="${esc(f.key)}" title="Accept">✓</button>
             <button class="doi-friend-remove" data-decline-friend="${esc(f.key)}" title="Decline">×</button>`
          : `<button class="doi-friend-remove" data-decline-friend="${esc(f.key)}" title="Cancel">×</button>`}
      </div>
    </div>`;
  }

  function renderMainDM() {
    const otherKey = state.dmWith;
    const otherProf = (cache.dms || []).find(c => c.other && c.other.key === otherKey);
    const other = otherProf ? otherProf.other : { key: otherKey, name: otherKey, avatar: null, bio: '' };
    const msgs = cache.dmMessages[otherKey] || [];
    const head = `${avatarHTML(other.name, other.avatar, 24)}<h2 style="margin-left:8px">${esc(other.name)}</h2>
      ${dmHeaderActions(`<button class="doi-dm-act" title="Add Friends to DM" data-shell-newdm><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg></button>`)}`;
    const body = `<div class="doi-main-body" id="doi-msgs">
      ${renderMessages(msgs, dmWelcomeHTML(other))}
    </div>${composerHTML(other.name, true)}`;
    return `<div class="doi-main-head doi-main-head-dm">${head}</div>${body}`;
  }

  function renderMainGroup() {
    const gid = state.groupWith;
    const g = cache.groupsFull[gid] || (cache.dms || []).find(c => c.kind === 'group' && c.id === gid);
    if (!g) return `<div class="doi-main-head"><h2>Loading…</h2></div><div class="doi-main-body"><div class="doi-empty">fetching group…</div></div>`;
    const title = g.name || g.autoName || 'Group';
    const msgs = cache.groupMessages[gid] || g.messages || [];
    const head = `${groupIconHTML(g, 24)}<h2 style="margin-left:8px">${esc(title)}</h2>
      <span class="doi-topic">${g.memberCount || (g.members||[]).length} members</span>
      ${dmHeaderActions(`<button class="doi-dm-act" title="Add People" data-group-invite="${esc(gid)}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg></button>
        <button class="doi-dm-act" title="Group Settings" data-group-settings="${esc(gid)}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>`)}`;
    const body = `<div class="doi-main-body" id="doi-msgs">
      ${renderMessages(msgs, groupWelcomeHTML(g))}
    </div>${composerHTML(title, false, gid)}`;
    return `<div class="doi-main-head doi-main-head-dm">${head}</div>${body}`;
  }
  function groupWelcomeHTML(g) {
    const title = g.name || g.autoName || 'Group';
    return `<div class="doi-chat-welcome">
      ${groupIconHTML(g, 80)}
      <h1>${esc(title)}</h1>
      <p>Welcome to the beginning of the <b>${esc(title)}</b> group.</p>
    </div>`;
  }

  function msgActions(mine) {
    if (!mine) return '';
    return `<div class="doi-msg-actions">
      <button class="doi-msg-act" data-msg-edit title="Edit">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button class="doi-msg-act doi-msg-del" data-msg-del title="Delete">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>`;
  }

  // Normalize channel messages ({author, authorKey}) and DMs ({from, fromKey})
  function normMsg(m) {
    return {
      id: m.id, ts: m.ts, text: m.text, edited: m.edited || 0,
      name: m.author || m.from || '?',
      key:  m.authorKey || m.fromKey || null,
    };
  }
  const GROUP_GAP = 7 * 60_000; // messages from same author within 7 min collapse

  // Discord-style list: date dividers + author-grouped message runs.
  function renderMessages(rawList, welcomeHTML) {
    const me = cache.profile || {};
    let html = welcomeHTML || '';
    let prev = null;
    for (const raw of rawList) {
      // system messages (group add/remove/leave) render as centered notices
      if (raw.system) {
        if (!prev || !sameDay(prev.ts, raw.ts)) html += `<div class="doi-date-divider"><span>${esc(fmtDivider(raw.ts))}</span></div>`;
        html += `<div class="doi-sysmsg"><span class="doi-sysmsg-arrow">←</span> ${esc(raw.text)} <span class="doi-sysmsg-time">${esc(clock(raw.ts))}</span></div>`;
        prev = { ts: raw.ts, name: 'system' };
        continue;
      }
      const m = normMsg(raw);
      const mine = (m.key && m.key === me.key) || m.name === me.name;
      const isOfficer = m.name === 'DOI';
      if (!prev || !sameDay(prev.ts, m.ts)) {
        html += `<div class="doi-date-divider"><span>${esc(fmtDivider(m.ts))}</span></div>`;
        prev = null; // date change always starts a new group
      }
      const grouped = prev && prev.name === m.name && (m.ts - prev.ts) < GROUP_GAP;
      if (grouped) {
        html += `<div class="doi-msg doi-msg-compact" data-mid="${esc(m.id)}" data-mine="${mine?'1':''}">
          <span class="doi-msg-gutter">${esc(clock(m.ts))}</span>
          <div class="doi-msg-body">
            <div class="doi-msg-text">${esc(m.text)}${m.edited ? ' <span class="doi-msg-edited">(edited)</span>':''}</div>
          </div>
          ${msgActions(mine)}
        </div>`;
      } else {
        const kp = knownProfile(m.key, m.name);
        const pkey = m.key || (m.name || '').toLowerCase();
        html += `<div class="doi-msg doi-msg-head-row" data-mid="${esc(m.id)}" data-mine="${mine?'1':''}">
          <span class="doi-msg-avawrap" data-open-profile="${esc(pkey)}" title="View profile">${avatarHTML(m.name, kp && kp.avatar, 40)}</span>
          <div class="doi-msg-body">
            <div class="doi-msg-head">
              <span class="doi-msg-name ${isOfficer?'doi-officer':''}" data-open-profile="${esc(pkey)}">${esc(m.name)}</span>
              <span class="doi-msg-time">${esc(fmtStamp(m.ts))}${m.edited ? ' <span class="doi-msg-edited">(edited)</span>':''}</span>
            </div>
            <div class="doi-msg-text">${esc(m.text)}</div>
          </div>
          ${msgActions(mine)}
        </div>`;
      }
      prev = m;
    }
    return html;
  }

  function dmWelcomeHTML(other) {
    return `<div class="doi-chat-welcome">
      ${avatarHTML(other.name, other.avatar, 80)}
      <h1>${esc(other.name)}</h1>
      <p>This is the beginning of your direct message history with <b>${esc(other.name)}</b>.</p>
      <div class="doi-chat-welcome-actions">
        <button class="doi-pp-btn doi-btn-cancel" data-open-profile="${esc(other.key || '')}">View Profile</button>
      </div>
    </div>`;
  }
  function channelWelcomeHTML(ch) {
    return `<div class="doi-chat-welcome">
      <div class="doi-chat-welcome-hash">#</div>
      <h1>Welcome to #${esc(ch.name)}!</h1>
      <p>${esc(ch.topic || 'This is the start of the #' + ch.name + ' channel.')}</p>
    </div>`;
  }
  function composerHTML(label, isDM, groupId) {
    const placeholder = groupId ? 'Message ' + esc(label || 'group')
      : isDM ? 'Message @' + esc(label || '')
      : 'Message #' + esc(label || 'channel');
    return `<div class="doi-composer">
      <form data-composer data-dm="${isDM ? '1':''}" data-gid="${groupId ? esc(groupId) : ''}">
        <button type="button" class="doi-composer-plus" data-shell-soft="Attachments" title="Upload">+</button>
        <input type="text" placeholder="${placeholder}" maxlength="2000" autocomplete="off"/>
        <button type="submit">Send ▸</button>
      </form>
    </div>`;
  }

  /* ---------- MODALS ---------- */
  function modalHTML() {
    return `
      <div class="doi-modal" id="doiNewServerModal" hidden><div class="doi-modal-inner">
        <h3>▸ New Server</h3>
        <div class="doi-tabs" style="margin-bottom:14px">
          <button data-newsrv-tab="create" class="active">Create</button>
          <button data-newsrv-tab="join">Join by ID</button>
        </div>
        <div id="doiNewSrvCreate">
          <div class="doi-field"><label>Server Name</label>
            <input id="doiNSName" maxlength="40" placeholder="e.g. Ops Cell Alpha"/>
          </div>
          <div class="doi-field"><label>Description (optional)</label>
            <input id="doiNSDesc" maxlength="200" placeholder="What is this server for?"/>
          </div>
          <div class="doi-modal-actions">
            <button class="doi-btn-cancel" data-close-modal>Cancel</button>
            <button class="doi-btn-primary" data-submit-newserver>▸ Create Server</button>
          </div>
        </div>
        <div id="doiNewSrvJoin" hidden>
          <div class="doi-field"><label>Server ID</label>
            <input id="doiNSJoin" placeholder="srv-…" maxlength="80"/>
            <div class="doi-hint">Ask the server owner for the ID.</div>
          </div>
          <div class="doi-modal-actions">
            <button class="doi-btn-cancel" data-close-modal>Cancel</button>
            <button class="doi-btn-primary" data-submit-joinserver>▸ Join Server</button>
          </div>
        </div>
      </div></div>

      <div class="doi-modal" id="doiServerSettings" hidden><div class="doi-modal-inner" style="max-width:640px">
        <h3 id="doiSSTitle">▸ Server</h3>
        <div id="doiSSBody"></div>
        <div class="doi-modal-actions">
          <button class="doi-btn-cancel" data-close-modal>Close</button>
        </div>
      </div></div>

      <div class="doi-modal" id="doiNewChannelModal" hidden><div class="doi-modal-inner">
        <h3>▸ New Channel</h3>
        <div class="doi-field"><label>Channel Name</label>
          <input id="doiNCName" maxlength="24" placeholder="lowercase-with-dashes"/>
        </div>
        <div class="doi-field"><label>Topic (optional)</label>
          <input id="doiNCTopic" maxlength="200"/>
        </div>
        <input type="hidden" id="doiNCCategory"/>
        <div class="doi-modal-actions">
          <button class="doi-btn-cancel" data-close-modal>Cancel</button>
          <button class="doi-btn-primary" data-submit-newchannel>▸ Create Channel</button>
        </div>
      </div></div>

      <div class="doi-modal" id="doiNewCategoryModal" hidden><div class="doi-modal-inner">
        <h3>▸ New Category</h3>
        <div class="doi-field"><label>Category Name</label>
          <input id="doiNKName" maxlength="30" placeholder="e.g. VOICE, ARCHIVE"/>
        </div>
        <div class="doi-modal-actions">
          <button class="doi-btn-cancel" data-close-modal>Cancel</button>
          <button class="doi-btn-primary" data-submit-newcategory>▸ Create</button>
        </div>
      </div></div>

      <div class="doi-modal doi-modal-popup" id="doiProfilePopup" hidden>
        <div class="doi-modal-inner doi-pp-inner"></div>
      </div>

      <div class="doi-mini-anchor" id="doiMiniAnchor" hidden></div>

      <div class="doi-modal" id="doiNewConvoModal" hidden><div class="doi-modal-inner"></div></div>

      <div class="doi-modal doi-modal-full" id="doiUserSettings" hidden></div>

      <div class="doi-modal doi-modal-full" id="doiShopModal" hidden></div>`;
  }

  async function openDM(otherKey) {
    if (!otherKey) return;
    state.server = 'home';
    state.homeView = 'dm';
    state.dmWith = otherKey;
    state.groupWith = null;
    await Promise.all([loadDMs(), loadDMMessages(otherKey)]);
    // optimistic: if this convo isn't in the list yet (brand-new, non-friend),
    // splice in a placeholder row so it shows immediately (Discord parity).
    ensureConvoInList('dm', otherKey);
    rerenderShell();
    startPoll();
  }
  async function openGroup(gid) {
    if (!gid) return;
    state.server = 'home';
    state.homeView = 'group';
    state.groupWith = gid;
    state.dmWith = null;
    await Promise.all([loadDMs(), loadGroup(gid)]);
    rerenderShell();
    startPoll();
  }
  // Make sure a just-opened conversation appears in cache.dms right away.
  function ensureConvoInList(kind, key) {
    cache.dms = cache.dms || [];
    if (kind === 'dm') {
      if (cache.dms.some(c => c.kind !== 'group' && c.other && c.other.key === key)) return;
      const peer = (cache.dmPeers && cache.dmPeers[key]) || { key, name: key, avatar: null };
      cache.dms.unshift({ kind: 'dm', other: peer, lastTs: Date.now(), lastText: '' });
    }
  }
  // Update a conversation's last-message preview + move it to the top.
  function bumpConvo(kind, key, text, ts) {
    if (!cache.dms) return;
    let row;
    if (kind === 'group') row = cache.dms.find(c => c.kind === 'group' && c.id === key);
    else row = cache.dms.find(c => c.kind !== 'group' && c.other && c.other.key === key);
    if (!row) return;
    row.lastTs = ts || Date.now();
    row.lastText = kind === 'group'
      ? ((cache.profile ? cache.profile.name + ': ' : '') + text)
      : text;
    cache.dms.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
  }

  async function openProfilePopup(userKey) {
    if (!userKey) return;
    const modal = document.getElementById('doiProfilePopup');
    if (!modal) return;
    const inner = modal.querySelector('.doi-modal-inner');
    inner.innerHTML = `<div class="doi-empty" style="padding:60px 20px">loading…</div>`;
    modal.hidden = false;
    let prof, friendState;
    try {
      const r = await api.publicProfile(userKey);
      prof = r.profile; friendState = r.friendState;
    } catch (e) {
      inner.innerHTML = `<div class="doi-empty" style="padding:40px 20px">${esc(e.message)}</div>
        <div class="doi-modal-actions"><button class="doi-btn-cancel" data-close-modal>Close</button></div>`;
      inner.querySelector('[data-close-modal]').addEventListener('click', () => modal.hidden = true);
      return;
    }
    const canDM = friendState === 'self' || friendState === 'friends' || prof.messagePrivacy === 'anyone';
    const actions = friendState === 'self'
      ? `<button class="doi-pp-btn doi-btn-primary" data-shell-opensettings>Edit Profile</button>`
      : `${canDM ? `<button class="doi-pp-btn doi-btn-primary" data-pp-dm="${esc(prof.key)}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Message</button>`
                 : `<button class="doi-pp-btn doi-btn-primary" disabled title="This operative only accepts messages from friends">Messages closed</button>`}
        ${friendState === 'friends' ? `<button class="doi-pp-btn doi-btn-cancel" data-pp-remove="${esc(prof.name)}">Remove Friend</button>`
          : friendState === 'outgoing' ? `<button class="doi-pp-btn doi-btn-cancel" data-pp-cancel="${esc(prof.key)}">Cancel Request</button>`
          : friendState === 'incoming' ? `<button class="doi-pp-btn doi-btn-primary" data-pp-accept="${esc(prof.key)}">Accept Request</button>
                                          <button class="doi-pp-btn doi-btn-cancel" data-pp-cancel="${esc(prof.key)}">Decline</button>`
          : `<button class="doi-pp-btn doi-btn-primary" data-pp-add="${esc(prof.name)}">Send Friend Request</button>`}`;
    const isSelf = friendState === 'self';
    const bioText = prof.bio || (isSelf ? 'Click here to add a bio…' : '');
    const decoIt   = equippedItem(prof, 'decoration');
    const effectIt = equippedItem(prof, 'effect');
    const frameIt  = equippedItem(prof, 'frame');
    const plateIt  = equippedItem(prof, 'nameplate');
    const plateCss = nameplateStyle(plateIt);
    inner.innerHTML = `
      <button class="doi-pp-close" data-close-modal title="Close">×</button>
      <div class="doi-pp-shell">
        <div class="doi-pp-col">
          <div class="doi-pp">
            <span class="doi-bubbles-scoped" aria-hidden="true">${scopedBubbles(8)}</span>
            ${effectOverlayHTML(effectIt)}
            ${frameOverlayHTML(frameIt)}
            <div class="doi-pp-banner ${isSelf?'editable':''}" data-pp-editbanner style="background:${esc(prof.bannerColor)}"></div>
            <div class="doi-pp-avatarwrap" style="position:relative">${avatarHTML(prof.name, prof.avatar, 96)}
              ${decoOverlayHTML(decoIt)}
              <span class="doi-pp-online"></span>
            </div>
            <div class="doi-pp-body">
              <div class="doi-pp-namebox ${plateIt?'has-plate':''}">
                ${plateCss ? `<span class="doi-pp-nameplate" style="${plateCss}"></span>` : ''}
                <h2 class="doi-pp-name">${esc(prof.name)}${prof.isDOI ? ' <span class="doi-badge-owner">OWNER</span>':''}</h2>
                <div class="doi-pp-sub">${esc(prof.tag)} ${prof.pronouns ? '· ' + esc(prof.pronouns) : ''}</div>
              </div>
              <div class="doi-pp-actions">${actions}</div>
              <div class="doi-pp-sec">About Me</div>
              <div class="doi-pp-bio ${isSelf?'editable':''}" data-pp-editbio>${esc(bioText)}</div>
              <div class="doi-pp-sec">Member Since</div>
              <div class="doi-pp-mem">${new Date(prof.joined).toLocaleDateString(undefined, {year:'numeric',month:'long',day:'numeric'})}</div>
            </div>
          </div>
        </div>
        <div class="doi-pp-col doi-pp-widgets">
          <div class="doi-pp-tabs">
            <button class="doi-pp-tab active">Board</button>
            <button class="doi-pp-tab">Activity</button>
            <button class="doi-pp-tab">Wishlist</button>
          </div>
          <div class="doi-pp-widgets-title">Customize your profile with Widgets</div>
          <div class="doi-pp-widgets-sub">Choose from our library of Widgets to share more about yourself and your interests.</div>
          <div class="doi-pp-widget-grid">
            <div class="doi-pp-widget doi-pp-widget-add">+</div>
            <div class="doi-pp-widget doi-pp-widget-add">+</div>
            <div class="doi-pp-widget doi-pp-widget-add">+</div>
            <div class="doi-pp-widget doi-pp-widget-add">+</div>
          </div>
        </div>
      </div>`;
    inner.querySelector('[data-close-modal]').addEventListener('click', () => modal.hidden = true);
    // click-outside dismisses
    modal.onclick = e => { if (e.target === modal) modal.hidden = true; };
    // banner editable (self)
    if (isSelf) {
      inner.querySelector('[data-pp-editbanner]').addEventListener('click', () => {
        modal.hidden = true;
        openSettings('profile');
      });
      // bio editable inline
      const bioEl = inner.querySelector('[data-pp-editbio]');
      bioEl.addEventListener('click', () => {
        const cur = (cache.profile && cache.profile.bio) || '';
        const ta = document.createElement('textarea');
        ta.className = 'doi-pp-bio-edit';
        ta.maxLength = 200;
        ta.value = cur;
        bioEl.replaceWith(ta);
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        const commit = async () => {
          const v = ta.value.slice(0, 200);
          if (v === cur) { openProfilePopup(userKey); return; }
          try {
            const r = await api.saveProfile({ bio: v });
            cache.profile = r.profile;
            openProfilePopup(userKey);
          } catch (er) { alert('Save failed: ' + er.message); }
        };
        ta.addEventListener('blur', commit, { once: true });
        ta.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); openProfilePopup(userKey); } });
      });
    }
    inner.querySelector('[data-pp-dm]')?.addEventListener('click', async () => { modal.hidden = true; await openDM(prof.key); });
    inner.querySelector('[data-pp-add]')?.addEventListener('click', async e => {
      try { await api.sendFriendReq(e.target.dataset.ppAdd); await Promise.all([loadFriends(), loadFriendRequests()]); openProfilePopup(userKey); }
      catch (er) { alert(er.message); }
    });
    inner.querySelector('[data-pp-accept]')?.addEventListener('click', async e => {
      try { await api.acceptFriend(e.target.dataset.ppAccept); await Promise.all([loadFriends(), loadFriendRequests()]); openProfilePopup(userKey); }
      catch (er) { alert(er.message); }
    });
    inner.querySelector('[data-pp-cancel]')?.addEventListener('click', async e => {
      try { await api.declineFriend(e.target.dataset.ppCancel); await loadFriendRequests(); openProfilePopup(userKey); }
      catch (er) { alert(er.message); }
    });
    inner.querySelector('[data-pp-remove]')?.addEventListener('click', async e => {
      if (!confirm('Remove ' + e.target.dataset.ppRemove + ' as a friend?')) return;
      try { await api.removeFriend(e.target.dataset.ppRemove); await Promise.all([loadFriends(), loadFriendRequests()]); openProfilePopup(userKey); }
      catch (er) { alert(er.message); }
    });
    inner.querySelector('[data-shell-opensettings]')?.addEventListener('click', () => { modal.hidden = true; openSettings(); });
  }

  /* ---------- TOAST ---------- */
  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById('doiToast');
    if (!el) { el = document.createElement('div'); el.id = 'doiToast'; el.className = 'doi-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------- NEW CONVERSATION (DM or group) ---------- */
  function openNewConvo() {
    const modal = document.getElementById('doiNewConvoModal');
    if (!modal) return;
    const friends = cache.friends || [];
    const picked = new Set();
    const body = modal.querySelector('.doi-modal-inner');
    function render() {
      const rows = friends.length ? friends.map(f => {
        const on = picked.has(f.key);
        return `<label class="doi-pick-row ${on?'on':''}">
          <input type="checkbox" data-pick="${esc(f.key)}" ${on?'checked':''}/>
          ${avatarHTML(f.name, f.avatar, 32)}
          <span class="doi-pick-name">${esc(f.name)}</span>
          <span class="doi-pick-check">${on?'✓':''}</span>
        </label>`;
      }).join('') : `<div class="doi-empty" style="padding:20px">Add friends first — then start a DM or group.</div>`;
      const n = picked.size;
      body.innerHTML = `
        <h3>Select Friends</h3>
        <p class="doi-newconvo-sub">You can add ${Math.max(0, 9 - n)} more friend${9-n===1?'':'s'}.</p>
        <div class="doi-pick-list">${rows}</div>
        <div class="doi-modal-actions">
          <button class="doi-btn-cancel" data-close-modal>Cancel</button>
          <button class="doi-btn-primary" data-newconvo-go ${n?'':'disabled'}>${n>1?'Create Group DM':'Create DM'}</button>
        </div>`;
      $$('[data-pick]', body).forEach(cb => cb.addEventListener('change', () => {
        const k = cb.dataset.pick;
        if (cb.checked) picked.add(k); else picked.delete(k);
        render();
      }));
      body.querySelector('[data-close-modal]').addEventListener('click', () => modal.hidden = true);
      body.querySelector('[data-newconvo-go]')?.addEventListener('click', async () => {
        const keys = [...picked];
        if (!keys.length) return;
        modal.hidden = true;
        try {
          if (keys.length === 1) { await openDM(keys[0]); }
          else {
            const r = await api.createGroup('', keys);
            cache.groupsFull[r.group.id] = r.group;
            await loadDMs();
            await openGroup(r.group.id);
          }
        } catch (e) { alert('Failed: ' + e.message); }
      });
    }
    render();
    modal.hidden = false;
    modal.onclick = e => { if (e.target === modal) modal.hidden = true; };
  }

  /* ---------- GROUP INVITE ---------- */
  function openGroupInvite(gid) {
    const g = cache.groupsFull[gid];
    if (!g) return;
    const memberKeys = new Set((g.members || []).map(m => m.key));
    const friends = (cache.friends || []).filter(f => !memberKeys.has(f.key));
    const modal = document.getElementById('doiNewConvoModal');
    const body = modal.querySelector('.doi-modal-inner');
    const rows = friends.length ? friends.map(f =>
      `<label class="doi-pick-row"><input type="checkbox" data-inv="${esc(f.key)}"/>${avatarHTML(f.name, f.avatar, 32)}<span class="doi-pick-name">${esc(f.name)}</span></label>`).join('')
      : `<div class="doi-empty" style="padding:20px">All your friends are already here.</div>`;
    body.innerHTML = `
      <h3>Add to Group</h3>
      <div class="doi-pick-list">${rows}</div>
      <div class="doi-modal-actions">
        <button class="doi-btn-cancel" data-close-modal>Cancel</button>
        <button class="doi-btn-primary" data-inv-go>Add</button>
      </div>`;
    body.querySelector('[data-close-modal]').addEventListener('click', () => modal.hidden = true);
    body.querySelector('[data-inv-go]').addEventListener('click', async () => {
      const keys = $$('[data-inv]:checked', body).map(cb => cb.dataset.inv);
      modal.hidden = true;
      try {
        for (const k of keys) await api.groupInvite(gid, k);
        await loadGroup(gid); await loadDMs();
        rerenderShell();
      } catch (e) { alert('Add failed: ' + e.message); }
    });
    modal.hidden = false;
    modal.onclick = e => { if (e.target === modal) modal.hidden = true; };
  }

  /* ---------- GROUP SETTINGS ---------- */
  function openGroupSettings(gid) {
    const g = cache.groupsFull[gid];
    if (!g) return;
    const modal = document.getElementById('doiNewConvoModal');
    const body = modal.querySelector('.doi-modal-inner');
    const members = (g.members || []).map(m =>
      `<div class="doi-pick-row">
        ${avatarHTML(m.name, m.avatar, 32)}
        <span class="doi-pick-name">${esc(m.name)}${m.key===g.ownerKey?' <span class="doi-badge-owner">OWNER</span>':''}</span>
        ${g.isOwner && m.key!==g.ownerKey ? `<button class="doi-friend-remove" data-kick="${esc(m.key)}" title="Remove">×</button>` : ''}
      </div>`).join('');
    body.innerHTML = `
      <h3>Group Settings</h3>
      <div class="doi-field"><label>Group Name</label>
        <input id="doiGrpName" maxlength="40" value="${esc(g.name||'')}" placeholder="${esc(g.autoName||'Group')}"/>
        <div class="doi-hint">Leave blank to use member names.</div>
      </div>
      <div class="doi-sec-title" style="margin:10px 0 6px">Members · <b>${(g.members||[]).length}</b></div>
      <div class="doi-pick-list">${members}</div>
      <div style="display:flex;gap:10px;margin-top:14px">
        ${g.isOwner ? `<button class="doi-btn-primary" id="doiGrpSave" style="flex:1">Save</button>` : ''}
        <button class="doi-btn-danger" id="doiGrpLeave" style="flex:1;padding:10px">Leave Group</button>
      </div>`;
    body.querySelector('#doiGrpSave')?.addEventListener('click', async () => {
      try {
        const r = await api.groupSettings(gid, { name: body.querySelector('#doiGrpName').value.trim() });
        cache.groupsFull[gid] = r.group; await loadDMs();
        modal.hidden = true; rerenderShell();
      } catch (e) { alert('Save failed: ' + e.message); }
    });
    body.querySelector('#doiGrpLeave').addEventListener('click', async () => {
      if (!confirm('Leave this group?')) return;
      try {
        await api.groupLeave(gid);
        if (state.groupWith === gid) { state.homeView = 'friends'; state.groupWith = null; }
        delete cache.groupsFull[gid]; await loadDMs();
        modal.hidden = true; rerenderShell();
      } catch (e) { alert('Leave failed: ' + e.message); }
    });
    $$('[data-kick]', body).forEach(b => b.addEventListener('click', async () => {
      try { const r = await api.groupRemove(gid, b.dataset.kick); cache.groupsFull[gid] = r.group; openGroupSettings(gid); }
      catch (e) { alert('Remove failed: ' + e.message); }
    }));
    modal.hidden = false;
    modal.onclick = e => { if (e.target === modal) modal.hidden = true; };
  }

  /* ---------- MINI SELF POPUP (bottom-left of screen) ---------- */
  function openMiniPopup() {
    const p = cache.profile || {};
    const anchor = document.getElementById('doiMiniAnchor');
    if (!anchor) return;
    anchor.hidden = false;
    anchor.innerHTML = `
      <div class="doi-mini-backdrop" data-mini-close></div>
      <div class="doi-mini">
        <div class="doi-mini-banner" style="background:${esc(p.bannerColor||'#5865f2')}"></div>
        <div class="doi-mini-avatarwrap">${avatarHTML(p.name, p.avatar, 76)}<span class="doi-mini-online"></span></div>
        <div class="doi-mini-body">
          <div class="doi-mini-name">${esc(p.name||'')}${p.isDOI ? ' <span class="doi-badge-owner">OWNER</span>':''}</div>
          <div class="doi-mini-sub">${esc(p.tag||'')} ${p.pronouns ? '· ' + esc(p.pronouns) : ''}</div>
          ${p.bio ? `<div class="doi-mini-bio">${esc(p.bio.slice(0,120))}${p.bio.length>120?'…':''}</div>
                    <div class="doi-mini-link" data-mini-viewbio>View Full Bio</div>` : ''}
          <div class="doi-mini-list">
            <button class="doi-mini-row" data-mini-editprofile>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
              <span>Edit Profile</span>
              <span class="doi-mini-chev">›</span>
            </button>
            <button class="doi-mini-row" data-mini-status>
              <span class="doi-mini-statusdot"></span>
              <span>Online</span>
              <span class="doi-mini-chev">›</span>
            </button>
          </div>
          <div class="doi-mini-list">
            <button class="doi-mini-row" data-mini-signout>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <span>Switch Accounts</span>
              <span class="doi-mini-chev">›</span>
            </button>
            <button class="doi-mini-row" data-mini-copyid>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Copy User ID</span>
            </button>
          </div>
        </div>
      </div>`;
    const close = () => { anchor.hidden = true; anchor.innerHTML = ''; };
    anchor.querySelector('[data-mini-close]').addEventListener('click', close);
    anchor.querySelector('[data-mini-editprofile]').addEventListener('click', () => { close(); openSettings('profile'); });
    anchor.querySelector('[data-mini-viewbio]')?.addEventListener('click', () => { close(); openProfilePopup(p.key); });
    anchor.querySelector('[data-mini-status]').addEventListener('click', () => { /* status placeholder */ });
    anchor.querySelector('[data-mini-signout]').addEventListener('click', () => { close(); signOut(); });
    anchor.querySelector('[data-mini-copyid]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(p.key || ''); } catch (_) {}
      const btn = anchor.querySelector('[data-mini-copyid] span:nth-child(2)');
      if (btn) { const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = t; }, 1200); }
    });
  }

  /* ==========================================================================
     SHOP — Novalis storefront. Discord-shop-style layout, our own build:
       · Featured view: hero collection banner + horizontal category rails
       · Browse view: search, sort, "Show only" kind filters, color filters,
         live result counts
       · Art-forward cards: every kind renders a real preview — effects play
         their animation over a mock profile card, frames wrap one, nameplates
         paint behind mock member rows, decorations ring YOUR avatar
       · Color variant dots re-tint procedural items live
       · Tokens economy: balance pill, timed claim, affordability states
       · Owner tools: add/remove items inline
     ========================================================================== */
  const SHOP_KINDS = [
    { key: 'premium',    label: 'Premium' },
    { key: 'decoration', label: 'Avatar Decorations' },
    { key: 'frame',      label: 'Profile Frames' },
    { key: 'effect',     label: 'Profile Effects' },
    { key: 'nameplate',  label: 'Nameplates' },
  ];
  function kindLabel(k) { return (SHOP_KINDS.find(x => x.key === k) || {}).label || k; }

  // Token coin icon (used everywhere a price/balance shows).
  const tokenSVG = '<svg class="doi-token-ico" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><circle cx="12" cy="12" r="7.2" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.4"/><path d="M12 7.2v9.6M9.4 9.2h3.6a1.9 1.9 0 0 1 0 3.8H9.8h3.4a1.9 1.9 0 0 1 0 3.8H9.4" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const heartSVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  const searchSVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4" stroke-linecap="round"/></svg>';
  const bagSVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>';

  function fmtDuration(ms) {
    if (ms <= 0) return 'now';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h >= 1) return `${h}h ${m}m`;
    if (m >= 1) return `${m}m`;
    return `${Math.max(1, Math.floor(ms / 1000))}s`;
  }

  // Color filter buckets — items are colored by their deterministic hue.
  const SHOP_COLORS = [
    { key: 'purple', hue: 268 }, { key: 'blue', hue: 225 }, { key: 'teal', hue: 180 },
    { key: 'green', hue: 120 },  { key: 'yellow', hue: 55 }, { key: 'orange', hue: 30 },
    { key: 'red', hue: 2 },      { key: 'pink', hue: 322 },
  ];
  function hueBucket(h) {
    if (h < 15 || h >= 345) return 'red';
    if (h < 45)  return 'orange';
    if (h < 70)  return 'yellow';
    if (h < 160) return 'green';
    if (h < 200) return 'teal';
    if (h < 250) return 'blue';
    if (h < 290) return 'purple';
    return 'pink';
  }

  // lazily-defaulted shop state (persisted on the shared state object)
  function shopState() {
    if (!state.shopView)  state.shopView  = 'featured';   // 'featured' | 'browse'
    if (!state.shopKinds) state.shopKinds = [];           // [] = all kinds
    if (!state.shopSort)  state.shopSort  = 'new';        // new | priceAsc | priceDesc | name
    if (state.shopSearch == null) state.shopSearch = '';
    if (state.shopColor === undefined) state.shopColor = null;
    return state;
  }

  // Navigate to the shop as an in-app page (keeps the servers rail + DM list).
  async function openShop(tab) {
    shopState();
    state.server = 'home';
    state.homeView = 'shop';
    if (tab === 'premium') {
      state.shopView = 'browse';
      state.shopKinds = ['premium'];
      state.shopTab = 'premium';
    } else {
      state.shopView = state.shopView || 'featured';
      state.shopTab = 'all';
    }
    rerenderShell();
    try { cache.shop = await api.shop(); rerenderMainSoft(); }
    catch (e) { toast('Shop unavailable'); }
  }

  /* ---------- card art: a real preview per kind ---------- */
  function shopArtHTML(item, me) {
    const hue = itemHue(item);
    const img = item.image ? `<span class="doi-sc-img" style="background-image:url('${esc(item.image)}')"></span>` : '';
    const myName = (me && me.name) || 'You';
    const myAva = avatarHTML(myName, me && me.avatar, 36);

    if (item.kind === 'effect') {
      // the effect playing over a mock profile card
      return `<div class="doi-sc-art" style="--fx-hue:${hue}">
        <div class="doi-sc-mock">
          <span class="doi-sc-mockava">${myAva}</span>
          <span class="doi-sc-bar" style="width:58%"></span>
          <span class="doi-sc-bar dim" style="width:40%"></span>
        </div>
        ${img || `<span class="doi-fx doi-fx-${fxKind(item)} doi-sc-fxlayer">${fxParticlesHTML(13)}</span>`}
      </div>`;
    }
    if (item.kind === 'frame') {
      // the frame wrapping a mock profile card
      return `<div class="doi-sc-art" style="--fx-hue:${hue}">
        <div class="doi-sc-mock doi-sc-mock-framed">
          <span class="doi-sc-mockava">${myAva}</span>
          <span class="doi-sc-bar" style="width:54%"></span>
          <span class="doi-sc-bar dim" style="width:36%"></span>
          ${img ? `<span class="doi-sc-framelayer-img" style="background-image:url('${esc(item.image)}')"></span>`
                : `<span class="doi-frame-gen doi-sc-framelayer"></span>`}
        </div>
      </div>`;
    }
    if (item.kind === 'decoration') {
      // the decoration ringing YOUR avatar
      return `<div class="doi-sc-art doi-sc-art-center" style="--fx-hue:${hue}">
        <span class="doi-sc-decowrap">${avatarHTML(myName, me && me.avatar, 78)}
          ${item.image ? `<span class="doi-pp-deco" style="background-image:url('${esc(item.image)}')"></span>`
                       : `<span class="doi-pp-deco doi-deco-gen"></span>`}
        </span>
      </div>`;
    }
    if (item.kind === 'nameplate') {
      // mock member list — the plate paints behind the middle row
      const plate = nameplateStyle(item);
      const row = (w, plated) => `<div class="doi-sc-mrow ${plated ? 'plated' : ''}">
        ${plated ? `<span class="doi-np-plate" style="${plate}"></span>` : ''}
        <span class="doi-sc-mrowava"></span><span class="doi-sc-bar" style="width:${w}%"></span>
      </div>`;
      return `<div class="doi-sc-art doi-sc-art-rows" style="--fx-hue:${hue}">${row(44, false)}${row(60, true)}${row(36, false)}</div>`;
    }
    // premium
    return `<div class="doi-sc-art doi-sc-art-center doi-sc-art-premium" style="--fx-hue:${hue}">
      <span class="doi-fx doi-fx-stars doi-sc-fxlayer">${fxParticlesHTML(10)}</span>
      <span class="doi-sc-premglyph">${tokenSVG.replace(/15/g, '56')}</span>
    </div>`;
  }

  function shopActionHTML(item, me) {
    const owned = (me.owned || []).includes(item.id);
    const equipped = me.equipped && me.equipped[item.kind] === item.id;
    const canAfford = (me.tokens || 0) >= (item.price || 0);
    if (item.kind === 'premium') {
      return me.premium
        ? `<button class="doi-shop-buy owned" disabled>Owned</button>`
        : `<button class="doi-shop-buy ${canAfford ? '' : 'poor'}" data-buy="${item.id}"${canAfford ? '' : ' disabled'}>${canAfford ? 'Get Premium' : 'Need more'}</button>`;
    }
    if (equipped) return `<button class="doi-shop-buy equipped" data-unequip="${item.kind}">Equipped ✓</button>`;
    if (owned)    return `<button class="doi-shop-buy" data-equip="${item.id}">Equip</button>`;
    return `<button class="doi-shop-buy ${canAfford ? '' : 'poor'}" data-buy="${item.id}"${canAfford ? '' : ' disabled'}>${canAfford ? 'Buy' : 'Need more'}</button>`;
  }

  function shopCardV2(item, me, isOwner, small) {
    const hue = itemHue(item);
    // variant dots re-tint procedural art live (image items have fixed art)
    const dots = (!item.image && item.kind !== 'premium')
      ? `<span class="doi-sc-dots">${[0, 45, 300].map((d, i) =>
          `<button class="doi-sc-dot ${i === 0 ? 'active' : ''}" data-vari="${(hue + d) % 360}"
             style="background:hsl(${(hue + d) % 360},75%,58%)" title="Color variant"></button>`).join('')}</span>`
      : '';
    return `<div class="doi-shop-card v2 ${item.kind} ${small ? 'small' : ''}" data-sku="${item.id}">
      ${shopArtHTML(item, me)}
      ${isOwner ? `<button class="doi-shop-del" data-del="${item.id}" title="Remove item">✕</button>` : ''}
      <div class="doi-sc-meta">
        <div class="doi-sc-titleline"><span class="doi-shop-name">${esc(item.name)}</span>${dots}</div>
        ${item.desc && !small ? `<div class="doi-shop-type">${esc(item.desc)}</div>` : ''}
        <div class="doi-shop-foot">
          <div class="doi-shop-price">${tokenSVG}${item.price ? item.price : 'Free'}</div>
          ${shopActionHTML(item, me)}
        </div>
      </div>
    </div>`;
  }

  /* ---------- filtering / sorting pipeline (browse view) ---------- */
  function shopVisibleItems(items) {
    shopState();
    let list = items.slice();
    const kinds = state.shopKinds;
    if (kinds.length) list = list.filter(i => kinds.includes(i.kind));
    else list = list.filter(i => i.kind !== 'premium'); // premium lives in its banner
    const q = (state.shopSearch || '').trim().toLowerCase();
    if (q) list = list.filter(i => (i.name + ' ' + (i.desc || '')).toLowerCase().includes(q));
    if (state.shopColor) list = list.filter(i => !i.image && hueBucket(itemHue(i)) === state.shopColor);
    switch (state.shopSort) {
      case 'priceAsc':  list.sort((a, b) => (a.price || 0) - (b.price || 0)); break;
      case 'priceDesc': list.sort((a, b) => (b.price || 0) - (a.price || 0)); break;
      case 'name':      list.sort((a, b) => a.name.localeCompare(b.name)); break;
      default:          list.reverse(); // recently added first
    }
    return list;
  }

  function shopHeadingText() {
    const kinds = state.shopKinds || [];
    if (kinds.length === 1) return kindLabel(kinds[0]);
    if (kinds.length > 1) return 'Filtered';
    return 'All Items';
  }

  /* ---------- page chrome ---------- */
  function shopPremiumStripHTML(premiumItem, me, isOwner) {
    if (!premiumItem) return '';
    return `<div class="doi-shop-nitrostrip">
      <span class="doi-bubbles-scoped" aria-hidden="true">${scopedBubbles(8)}</span>
      <div class="doi-shop-nitrostrip-txt">
        <h3>Novalis Premium</h3>
        <p>${esc(premiumItem.desc || 'Custom accent, bubble effects, and profile flair — everywhere on Novalis.')}</p>
      </div>
      <div class="doi-shop-price">${tokenSVG}${premiumItem.price || 'Free'}</div>
      ${shopActionHTML(premiumItem, me)}
      ${isOwner ? `<button class="doi-shop-del static" data-del="${premiumItem.id}" title="Remove">✕</button>` : ''}
    </div>`;
  }

  function shopOwnerToolsHTML(open) {
    return `<details class="doi-shop-manage" ${open ? 'open' : ''}>
      <summary>⚙ Owner tools — add or remove items</summary>
      <div class="doi-shop-form">
        <input id="shopName" placeholder="Item name"/>
        <select id="shopKind">${SHOP_KINDS.map(k => `<option value="${k.key}">${k.label}</option>`).join('')}</select>
        <input id="shopPrice" type="number" min="0" step="1" placeholder="Price (tokens)"/>
        <input id="shopImage" placeholder="Image URL (optional — no image = animated art)"/>
        <button class="doi-shop-buy" id="shopAdd">Add item</button>
      </div>
      <input id="shopDesc" placeholder="Short description (optional)" style="margin-top:8px;width:100%"/>
      <p class="doi-shop-manage-hint">No image? Novalis generates animated art from the item's name — stars, petals, embers, bubbles, rings, frames and gradient plates. Prices are in tokens; removing an item unequips it for everyone.</p>
    </details>`;
  }

  function shopFeaturedHTML(items, me, isOwner) {
    // hero = the collection with the most items
    const ranked = SHOP_KINDS.filter(k => k.key !== 'premium')
      .map(k => ({ k, n: items.filter(i => i.kind === k.key).length }))
      .sort((a, b) => b.n - a.n);
    const hero = ranked[0] && ranked[0].n ? ranked[0].k : null;
    const heroCards = hero ? items.filter(i => i.kind === hero.key).slice(0, 3) : [];
    const rails = SHOP_KINDS.filter(k => k.key !== 'premium').map(k => {
      const list = items.filter(i => i.kind === k.key);
      if (!list.length) return '';
      return `<section class="doi-shop-rail">
        <div class="doi-shop-cat-head"><h2>${k.label} <span class="doi-shop-count">(${list.length})</span></h2>
          <button class="doi-shop-seeall" data-shop-browse="${k.key}">See all →</button></div>
        <div class="doi-shop-hscroll">${list.map(i => shopCardV2(i, me, isOwner, true)).join('')}</div>
      </section>`;
    }).join('');
    return `
      ${hero ? `
      <div class="doi-shop-hero v2">
        <span class="doi-bubbles-scoped" aria-hidden="true">${scopedBubbles(12)}</span>
        <div class="doi-shop-hero-inner">
          <p class="doi-shop-eyebrow">◈ Early Access</p>
          <h1>${esc(hero.label.toUpperCase())}</h1>
          <p class="doi-shop-hero-sub">Fresh drops in the ${esc(hero.label.toLowerCase())} collection — earn <b>+${(cache.shop && cache.shop.me && cache.shop.me.claimAmount) || 20}</b> tokens every 18h and make it yours.</p>
          <button class="doi-shop-collect" data-shop-browse="${hero.key}">Shop the Collection</button>
        </div>
        <div class="doi-shop-hero-art">
          ${heroCards.map((i, idx) => `<div class="doi-shop-herocard hc${idx}" style="--fx-hue:${itemHue(i)}">
            ${shopArtHTML(i, me)}</div>`).join('')}
        </div>
      </div>` : ''}
      ${rails || '<div class="doi-empty" style="padding:24px 34px;color:var(--doi-ink-4)">No items yet.</div>'}`;
  }

  function shopBrowseHTML(items, me, isOwner) {
    shopState();
    const visible = shopVisibleItems(items);
    const counts = {};
    SHOP_KINDS.forEach(k => counts[k.key] = items.filter(i => i.kind === k.key).length);
    const anyFilter = state.shopKinds.length || state.shopColor || (state.shopSearch || '').trim();
    const sidebar = `
      <aside class="doi-shop-side">
        <div class="doi-shop-side-sec">
          <h4>Show only</h4>
          ${SHOP_KINDS.map(k => `
            <label class="doi-shop-check">
              <input type="checkbox" data-shop-kind="${k.key}" ${state.shopKinds.includes(k.key) ? 'checked' : ''}/>
              <span>${k.label}</span><i>${counts[k.key]}</i>
            </label>`).join('')}
        </div>
        <div class="doi-shop-side-sec">
          <h4>Color</h4>
          <div class="doi-shop-colorrow">
            ${SHOP_COLORS.map(c => `<button class="doi-shop-colordot ${state.shopColor === c.key ? 'active' : ''}"
              data-shop-color="${c.key}" style="background:hsl(${c.hue},72%,55%)" title="${c.key}"></button>`).join('')}
          </div>
        </div>
        ${anyFilter ? `<button class="doi-shop-clear" data-shop-clear>Clear all filters</button>` : ''}
      </aside>`;
    return `
      <div class="doi-shop-browse">
        <div class="doi-shop-browse-main">
          <div class="doi-shop-browse-head">
            <h2>${esc(shopHeadingText())} <span class="doi-shop-count" id="doiShopCount">(${visible.length})</span></h2>
            <label class="doi-shop-sort">Sort by
              <select id="doiShopSort">
                <option value="new" ${state.shopSort === 'new' ? 'selected' : ''}>Recently Added</option>
                <option value="priceAsc" ${state.shopSort === 'priceAsc' ? 'selected' : ''}>Price: Low to High</option>
                <option value="priceDesc" ${state.shopSort === 'priceDesc' ? 'selected' : ''}>Price: High to Low</option>
                <option value="name" ${state.shopSort === 'name' ? 'selected' : ''}>Name: A to Z</option>
              </select>
            </label>
          </div>
          ${isOwner ? shopOwnerToolsHTML(!items.length) : ''}
          <div class="doi-shop-grid v2" id="doiShopGrid">
            ${visible.length ? visible.map(i => shopCardV2(i, me, isOwner)).join('')
              : `<div class="doi-empty" style="grid-column:1/-1;padding:40px 0;text-align:center;color:var(--doi-ink-4)">Nothing matches — try clearing a filter.</div>`}
          </div>
        </div>
        ${sidebar}
      </div>`;
  }

  // Build the shop as main-content HTML (head + body). Bound by wireShopPage().
  function renderShopPage() {
    shopState();
    const r = cache.shop;
    const me = (r && r.me) || cache.profile || { tokens: 0, owned: [], equipped: {} };
    const items = (r && r.items) || [];
    const isOwner = !!(r && r.isOwner);
    const premiumItem = items.find(i => i.kind === 'premium');
    const claimReady = (me.claimIn || 0) <= 0;

    const head = `
      <span class="doi-hash">${bagSVG}</span>
      <h2>Shop</h2>
      <div class="doi-shop-head-right">
        <div class="doi-token-pill" title="Your token balance">${tokenSVG}<b>${me.tokens != null ? me.tokens : 0}</b><span>Tokens</span></div>
        <button class="doi-shop-claim ${claimReady ? 'ready' : ''}" data-shop-claim ${claimReady ? '' : 'disabled'}>
          ${claimReady ? `Claim +${me.claimAmount || 20}` : `Claim in ${fmtDuration(me.claimIn || 0)}`}
        </button>
      </div>`;

    const body = `<div class="doi-main-body doi-shop-scroll">
      <div class="doi-shop v2">
        <div class="doi-shop-topstrip">
          <button class="doi-shop-tab ${state.shopView === 'featured' ? 'active' : ''}" data-shop-view="featured">Featured</button>
          <button class="doi-shop-tab ${state.shopView === 'browse' ? 'active' : ''}" data-shop-view="browse">Browse</button>
          <span class="doi-shop-topstrip-spacer"></span>
          <label class="doi-shop-search">${searchSVG}<input id="doiShopSearch" placeholder="Search the Shop" value="${esc(state.shopSearch || '')}"/></label>
          <span class="doi-shop-fav" title="Wishlist — coming soon">${heartSVG}</span>
        </div>
        ${shopPremiumStripHTML(premiumItem, me, isOwner)}
        ${state.shopView === 'browse' ? shopBrowseHTML(items, me, isOwner) : shopFeaturedHTML(items, me, isOwner)}
      </div>
    </div>`;
    return `<div class="doi-main-head">${head}</div>${body}`;
  }

  /* ---------- wiring ---------- */
  function wireShopCards(scope) {
    async function refresh(prof) {
      if (prof) cache.profile = prof;
      try { cache.shop = await api.shop(); } catch (_) {}
      rerenderMainSoft(); applyTheme(); mountBubbles();
    }
    $$('[data-buy]', scope).forEach(b => b.addEventListener('click', async () => {
      const t = b.textContent; b.disabled = true; b.textContent = '…';
      try { const rr = await api.shopBuy(b.dataset.buy); toast('Purchased'); await refresh(rr.profile); }
      catch (e) { toast(e.message === 'Not enough tokens' ? 'Not enough tokens' : ('Buy failed: ' + e.message)); b.disabled = false; b.textContent = t; }
    }));
    $$('[data-equip]', scope).forEach(b => b.addEventListener('click', async () => {
      try { const rr = await api.shopEquip({ id: b.dataset.equip }); toast('Equipped'); await refresh(rr.profile); }
      catch (e) { toast(e.message); }
    }));
    $$('[data-unequip]', scope).forEach(b => b.addEventListener('click', async () => {
      try { const rr = await api.shopEquip({ unequip: true, slot: b.dataset.unequip }); toast('Unequipped'); await refresh(rr.profile); }
      catch (e) { toast(e.message); }
    }));
    $$('[data-del]', scope).forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this item from the shop?')) return;
      try { await api.shopAdmin({ action: 'remove', id: b.dataset.del }); toast('Removed'); await refresh(); }
      catch (e) { toast(e.message); }
    }));
    // variant dots re-tint the card's procedural art live
    $$('.doi-sc-dot', scope).forEach(d => d.addEventListener('click', () => {
      const card = d.closest('.doi-shop-card');
      if (!card) return;
      const art = card.querySelector('.doi-sc-art');
      if (art) art.style.setProperty('--fx-hue', d.dataset.vari);
      card.querySelectorAll('.doi-sc-dot').forEach(x => x.classList.toggle('active', x === d));
    }));
  }

  function wireShopPage(container) {
    shopState();
    async function refresh(prof) {
      if (prof) cache.profile = prof;
      try { cache.shop = await api.shop(); } catch (_) {}
      rerenderMainSoft(); applyTheme(); mountBubbles();
    }
    // featured/browse switch + "See all" / "Shop the Collection"
    $$('[data-shop-view]', container).forEach(b => b.addEventListener('click', () => {
      state.shopView = b.dataset.shopView;
      rerenderMainSoft();
    }));
    $$('[data-shop-browse]', container).forEach(b => b.addEventListener('click', () => {
      state.shopView = 'browse';
      state.shopKinds = [b.dataset.shopBrowse];
      rerenderMainSoft();
    }));
    // claim
    $$('[data-shop-claim]', container).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try { const rr = await api.shopClaim(); toast(`+${rr.gained} tokens claimed`); await refresh(rr.profile); }
      catch (e) { toast(e.message === 'Not ready yet' ? 'Not ready yet — check back later' : e.message); b.disabled = false; }
    }));
    // search — grid-only refresh so the input keeps focus
    const search = container.querySelector('#doiShopSearch');
    if (search) search.addEventListener('input', () => {
      state.shopSearch = search.value;
      if (state.shopView !== 'browse') { state.shopView = 'browse'; rerenderMainSoft(); requestAnimationFrame(() => { const s = document.getElementById('doiShopSearch'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }); return; }
      const grid = container.querySelector('#doiShopGrid');
      const count = container.querySelector('#doiShopCount');
      if (!grid) return;
      const r = cache.shop || {};
      const visible = shopVisibleItems(r.items || []);
      grid.innerHTML = visible.length
        ? visible.map(i => shopCardV2(i, r.me || {}, !!r.isOwner)).join('')
        : `<div class="doi-empty" style="grid-column:1/-1;padding:40px 0;text-align:center;color:var(--doi-ink-4)">Nothing matches — try clearing a filter.</div>`;
      if (count) count.textContent = `(${visible.length})`;
      wireShopCards(grid);
    });
    // sort
    const sort = container.querySelector('#doiShopSort');
    if (sort) sort.addEventListener('change', () => { state.shopSort = sort.value; rerenderMainSoft(); });
    // kind checkboxes
    $$('[data-shop-kind]', container).forEach(cb => cb.addEventListener('change', () => {
      const k = cb.dataset.shopKind;
      const set = new Set(state.shopKinds);
      if (cb.checked) set.add(k); else set.delete(k);
      state.shopKinds = [...set];
      rerenderMainSoft();
    }));
    // color filters
    $$('[data-shop-color]', container).forEach(b => b.addEventListener('click', () => {
      state.shopColor = state.shopColor === b.dataset.shopColor ? null : b.dataset.shopColor;
      rerenderMainSoft();
    }));
    $$('[data-shop-clear]', container).forEach(b => b.addEventListener('click', () => {
      state.shopKinds = []; state.shopColor = null; state.shopSearch = '';
      rerenderMainSoft();
    }));
    // owner add
    const addBtn = container.querySelector('#shopAdd');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const name = container.querySelector('#shopName').value.trim();
      if (!name) return toast('Name required');
      const patch = {
        action: 'add', name,
        kind: container.querySelector('#shopKind').value,
        price: parseInt(container.querySelector('#shopPrice').value, 10) || 0,
        image: container.querySelector('#shopImage').value.trim(),
        desc: container.querySelector('#shopDesc').value.trim(),
      };
      try { await api.shopAdmin(patch); toast('Item added'); await refresh(); }
      catch (e) { toast(e.message); }
    });
    wireShopCards(container);
  }

  /* ---------- iOS26 BUBBLES ---------- */
  function mountBubbles() {
    let host = document.getElementById('doiBubbles');
    const on = !cache.profile || cache.profile.bubbles !== false;
    document.body.classList.toggle('doi-no-bubbles', !on);
    if (!on) { if (host) host.remove(); return; }
    if (host) return; // already mounted
    host = document.createElement('div');
    host.className = 'doi-bubbles'; host.id = 'doiBubbles'; host.setAttribute('aria-hidden', 'true');
    let html = '';
    for (let i = 0; i < 14; i++) {
      const size = 14 + (i * 7) % 46;
      const left = (i * 53) % 100;
      const dur = 14 + (i * 3) % 16;
      const delay = (i * 1.7) % 14;
      html += `<b style="width:${size}px;height:${size}px;left:${left}%;animation-duration:${dur}s;animation-delay:-${delay}s"></b>`;
    }
    host.innerHTML = html;
    document.body.appendChild(host);
  }
  window.__doiMountBubbles = mountBubbles;

  // Small inline bubble field for scoped containers (shop hero, profile card).
  function scopedBubbles(n) {
    let html = '';
    for (let i = 0; i < n; i++) {
      const size = 8 + (i * 5) % 26;
      const left = (i * 37) % 100;
      const dur = 9 + (i * 4) % 12;
      const delay = (i * 1.3) % 10;
      html += `<b style="width:${size}px;height:${size}px;left:${left}%;animation-duration:${dur}s;animation-delay:-${delay}s"></b>`;
    }
    return html;
  }

  /* ---------- EQUIPPED COSMETICS (effects / decorations / frames / nameplates) ----------
     Items with an image URL render it; items without one get a deterministic
     procedural look (hashed hue + built-in animation) so cosmetics always
     visibly apply — like Discord's, but generated client-side. */
  function equippedItem(prof, kind) {
    const id = prof && prof.equipped && prof.equipped[kind];
    if (!id || !cache.shop || !cache.shop.items) return null;
    return cache.shop.items.find(i => i.id === id) || null;
  }
  function equippedAsset(prof, kind) {
    const it = equippedItem(prof, kind);
    return (it && it.image) ? it.image : null;
  }
  function itemHue(item) {
    const s = (item && (item.id || item.name)) || '';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  // Pick a built-in animation family from the item's name (fallback: hash).
  function fxKind(item) {
    const n = ((item && item.name) || '').toLowerCase();
    if (/star|comet|night|galaxy|moon/.test(n)) return 'stars';
    if (/bonsai|petal|blossom|sakura|kitty|rose|cherry/.test(n)) return 'petals';
    if (/ember|fire|flame|vengeance|raven|nevermore|dark/.test(n)) return 'embers';
    if (/bubble|drift|drop|rain|water|snow|frost/.test(n)) return 'bubbles';
    return ['bubbles', 'stars', 'petals', 'embers'][itemHue(item) % 4];
  }
  function fxParticlesHTML(n) {
    let html = '';
    for (let i = 0; i < n; i++) {
      const left = (i * 41 + 7) % 100;
      const size = 5 + (i * 5) % 13;
      const dur = 5 + (i * 3) % 8;
      const delay = (i * 1.3) % 7;
      html += `<b style="left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:-${delay}s"></b>`;
    }
    return html;
  }
  // Full-card overlay for profile EFFECTS.
  function effectOverlayHTML(item) {
    if (!item) return '';
    if (item.image) return `<span class="doi-pp-effect" style="background-image:url('${esc(item.image)}')"></span>`;
    return `<span class="doi-pp-effect doi-fx doi-fx-${fxKind(item)}" style="--fx-hue:${itemHue(item)}">${fxParticlesHTML(14)}</span>`;
  }
  // Ring around the avatar for DECORATIONS.
  function decoOverlayHTML(item) {
    if (!item) return '';
    if (item.image) return `<span class="doi-pp-deco" style="background-image:url('${esc(item.image)}')"></span>`;
    return `<span class="doi-pp-deco doi-deco-gen" style="--fx-hue:${itemHue(item)}"></span>`;
  }
  // Border layered over the card for FRAMES.
  function frameOverlayHTML(item) {
    if (!item) return '';
    if (item.image) return `<span class="doi-pp-effect" style="background-image:url('${esc(item.image)}');mix-blend-mode:normal;background-size:contain"></span>`;
    return `<span class="doi-frame-gen" style="--fx-hue:${itemHue(item)}"></span>`;
  }
  // Inline style for a NAMEPLATE strip (image, or hashed gradient fallback).
  function nameplateStyle(item) {
    if (!item) return null;
    if (item.image) return `background-image:url('${esc(item.image)}')`;
    const h = itemHue(item);
    return `background:linear-gradient(90deg, hsla(${h},74%,46%,.95), hsla(${(h + 70) % 360},70%,44%,.5))`;
  }
  // Wrap a list row so an equipped nameplate paints behind it.
  function nameplateBits(prof) {
    const it = equippedItem(prof, 'nameplate');
    if (!it) return { cls: '', html: '' };
    return { cls: 'doi-np-host', html: `<span class="doi-np-plate" style="${nameplateStyle(it)}"></span>` };
  }
  // Best-known profile for a user key (self, friends, server members, DMs).
  function knownProfile(key, name) {
    const k = key || (name || '').toLowerCase();
    if (!k) return null;
    if (cache.profile && cache.profile.key === k) return cache.profile;
    const f = (cache.friends || []).find(x => x.key === k);
    if (f) return f;
    for (const sid in cache.serversFull) {
      const m = ((cache.serversFull[sid] || {}).members || []).find(x => x.key === k);
      if (m) return m;
    }
    const dm = (cache.dms || []).find(c => c.other && c.other.key === k);
    if (dm) return dm.other;
    for (const gid in cache.groupsFull) {
      const m = ((cache.groupsFull[gid] || {}).members || []).find(x => x.key === k);
      if (m) return m;
    }
    return null;
  }
  async function preloadShop() {
    try { cache.shop = await api.shop(); } catch (_) {}
  }

  /* ---------- SETTINGS MODAL ---------- */
  function openSettings(section = 'account') {
    const modal = document.getElementById('doiUserSettings');
    if (!modal) return;
    renderSettings(section);
    modal.hidden = false;
  }
  function renderSettings(section) {
    const modal = document.getElementById('doiUserSettings');
    const p = cache.profile || {};
    const sections = {
      account:    'My Account',
      profile:    'Profiles',
      privacy:    'Privacy & Safety',
      appearance: 'Appearance',
      about:      'About DOI'
    };
    const catList = Object.entries(sections).map(([k,l]) =>
      `<button class="doi-us-cat ${section===k?'active':''}" data-us-cat="${k}">${esc(l)}</button>`).join('');
    let body = '';
    if (section === 'account') {
      body = `
        <h2>My Account</h2>
        <div class="doi-us-card">
          <div class="doi-us-banner" style="background:${esc(p.bannerColor||'#5865f2')}"></div>
          <div class="doi-us-account">
            ${avatarHTML(p.name, p.avatar, 80)}
            <div>
              <div class="doi-us-uname">${esc(p.name||'')}${p.isDOI ? ' <span class="doi-badge-owner">OWNER</span>':''}</div>
              <div class="doi-us-utag">${esc(p.tag||'')}</div>
            </div>
          </div>
          <div class="doi-us-fields">
            <div class="doi-us-field"><label>CALLSIGN</label><div class="doi-us-val">${esc(p.name||'')}</div><div class="doi-us-hint">Fixed to your account.</div></div>
            <div class="doi-us-field"><label>TAG</label><div class="doi-us-val">${esc(p.tag||'')}</div></div>
          </div>
          <div class="doi-us-danger">
            <button class="doi-btn-danger" data-us-signout>Log Out</button>
          </div>
        </div>`;
    } else if (section === 'profile') {
      body = `
        <h2>Profiles</h2>
        <form id="doiUSProfileForm">
          <div class="doi-us-field"><label>BIO</label>
            <textarea id="doiUSBio" maxlength="200" style="height:80px">${esc(p.bio||'')}</textarea>
          </div>
          <div class="doi-us-field"><label>PRONOUNS</label>
            <input id="doiUSPronouns" maxlength="20" value="${esc(p.pronouns||'')}" placeholder="e.g. they/them"/>
          </div>
          <div class="doi-us-field"><label>BANNER COLOR</label>
            <input id="doiUSBanner" type="color" value="${esc((p.bannerColor||'#5865f2').slice(0,7))}"/>
            <div class="doi-us-hint">Shown at the top of your profile card.</div>
          </div>
          <div class="doi-us-field"><label>AVATAR</label>
            <input id="doiUSAvatar" type="file" accept="image/*"/>
            <div class="doi-us-hint">Max ~200KB. Stored on the server.</div>
          </div>
          <div class="doi-us-actions">
            <button type="button" class="doi-btn-primary" id="doiUSSave">Save Changes</button>
          </div>
        </form>
        <h3 style="margin-top:24px">Preview</h3>
        <div class="doi-us-preview">
          <div class="doi-pp-banner" style="background:${esc(p.bannerColor||'#5865f2')};height:80px;border-radius:6px 6px 0 0"></div>
          <div style="display:flex;gap:14px;padding:14px 16px;align-items:flex-start;background:#0d0d0d;border-radius:0 0 6px 6px">
            ${avatarHTML(p.name, p.avatar, 60)}
            <div>
              <div style="font-family:var(--mono);font-weight:800;color:#fff">${esc(p.name||'')}</div>
              <div style="font-family:var(--mono);color:#a0a0a0;font-size:12px">${esc(p.pronouns||'')}</div>
              <div style="color:#c0c0c0;font-size:13px;margin-top:6px">${esc(p.bio||'')}</div>
            </div>
          </div>
        </div>`;
    } else if (section === 'privacy') {
      body = `
        <h2>Privacy & Safety</h2>
        <div class="doi-us-field"><label>DIRECT MESSAGES</label>
          <div class="doi-us-radio">
            <label><input type="radio" name="msgprivacy" value="anyone" ${(p.messagePrivacy||'anyone')==='anyone'?'checked':''}/> Anyone can send me a direct message</label>
            <label><input type="radio" name="msgprivacy" value="friends" ${p.messagePrivacy==='friends'?'checked':''}/> Only my friends can DM me</label>
          </div>
          <div class="doi-us-hint">When set to friends-only, non-friend messages are rejected.</div>
        </div>
        <div class="doi-us-actions">
          <button type="button" class="doi-btn-primary" id="doiUSPrivacySave">Save Changes</button>
        </div>`;
    } else if (section === 'appearance') {
      const owner = !!p.isDOI;
      const theme = p.theme || 'midnight';
      body = `
        <h2>Appearance</h2>
        <div class="doi-us-field">
          <label>Theme</label>
          <div class="doi-theme-picker">
            <div class="doi-theme-choice ${theme==='midnight'||!owner?'active':''}" data-us-theme="midnight">
              <div class="doi-theme-choice-preview midnight"></div>
              <div class="doi-theme-choice-label">Liquid Glass</div>
            </div>
            ${owner ? `
            <div class="doi-theme-choice ${theme==='discord'?'active':''}" data-us-theme="discord">
              <div class="doi-theme-choice-preview discord"></div>
              <div class="doi-theme-choice-label">Classic (Admin)</div>
            </div>
            <div class="doi-theme-choice ${theme==='insurgency'?'active':''}" data-us-theme="insurgency">
              <div class="doi-theme-choice-preview insurgency"></div>
              <div class="doi-theme-choice-label">Insurgency (Admin)</div>
            </div>` : ''}
          </div>
          <div class="doi-us-hint">${owner ? 'Classic and Insurgency are admin-only — every user sees Liquid Glass.' : 'Novalis runs on Liquid Glass — deep black with translucent, blurred panels. Your accent color below personalizes it.'}</div>
        </div>
        <div class="doi-us-field">
          <label>Accent Color</label>
          <div class="doi-accent-swatches">
            ${['#5865f2','#7c3aed','#eb459e','#c8102e','#f0883e','#d4af37','#23a55a','#14b8a6','#3b7ec1']
              .map(c => `<button type="button" class="doi-accent-swatch ${(p.accent||'#5865f2').toLowerCase()===c?'active':''}" data-accent="${c}" style="background:${c}" title="${c}"></button>`).join('')}
            <label class="doi-accent-custom" title="Custom color">
              <input type="color" id="doiUSAccent" value="${esc((p.accent||'#5865f2'))}"/>
              <span>+</span>
            </label>
          </div>
          <div class="doi-us-hint">Recolors buttons, highlights, the scrollbar and text selection. Saved to your account.</div>
          <div class="doi-us-actions" style="margin-top:10px">
            <button type="button" class="doi-btn-primary" id="doiUSAccentSave">Save Accent</button>
            <button type="button" class="doi-btn-ghost" id="doiUSAccentReset">Reset to Default</button>
          </div>
          ${owner ? `
          <label class="doi-accent-sitewide">
            <input type="checkbox" id="doiUSSiteAccent" ${(p.siteAccent && p.siteAccent===p.accent)?'checked':''}/>
            <span>Also set this accent as the default for all users</span>
          </label>` : ''}
        </div>
        <div class="doi-us-field">
          <label>iOS-26 Bubble Effects</label>
          <label class="doi-accent-sitewide">
            <input type="checkbox" id="doiUSBubbles" ${p.bubbles!==false?'checked':''}/>
            <span>Animated liquid-glass bubbles floating in the background</span>
          </label>
          <div class="doi-us-hint">Turn off if you prefer a still background. Saved to your account.</div>
        </div>`;
    } else {
      body = `
        <h2>About Novalis</h2>
        <p style="color:#c0c0c0"><b>Novalis</b> — Site Terminal</p>
        <p style="color:#a0a0a0;font-size:13px">Server: same-origin Node process on Sparkedhost.</p>
        <p style="color:#a0a0a0;font-size:13px">Client build: 20260716b</p>`;
    }
    modal.innerHTML = `
      <div class="doi-us-shell">
        <div class="doi-us-nav">
          <div class="doi-us-navhead">
            ${avatarHTML(p.name, p.avatar, 32)}
            <div>
              <div class="doi-us-navname">${esc(p.name||'')}</div>
              <div class="doi-us-navtag">${esc(p.tag||'')}</div>
            </div>
          </div>
          ${catList}
        </div>
        <div class="doi-us-content">
          ${body}
        </div>
        <button class="doi-us-close" data-close-modal title="Close (ESC)">×</button>
      </div>`;
    modal.querySelector('[data-close-modal]').addEventListener('click', () => modal.hidden = true);
    modal.onclick = e => { if (e.target === modal) modal.hidden = true; };
    $$('[data-us-cat]', modal).forEach(b => b.addEventListener('click', () => renderSettings(b.dataset.usCat)));
    // theme picker (midnight/discord for everyone; insurgency owner-only, enforced server-side)
    $$('[data-us-theme]', modal).forEach(el => el.addEventListener('click', async () => {
      const t = el.dataset.usTheme;
      try {
        const r = await api.saveProfile({ theme: t });
        cache.profile = r.profile;
        applyTheme();
        renderSettings('appearance');
      } catch (e) { alert('Save failed: ' + e.message); }
    }));
    // accent color: live preview on pick, persist on Save
    if (section === 'appearance') {
      const colorInput = modal.querySelector('#doiUSAccent');
      const preview = (hex) => {
        if (cache.profile) cache.profile.accent = hex;
        applyTheme();
        $$('.doi-accent-swatch', modal).forEach(s =>
          s.classList.toggle('active', s.dataset.accent.toLowerCase() === hex.toLowerCase()));
      };
      $$('.doi-accent-swatch', modal).forEach(sw =>
        sw.addEventListener('click', () => { if (colorInput) colorInput.value = sw.dataset.accent; preview(sw.dataset.accent); }));
      if (colorInput) colorInput.addEventListener('input', () => preview(colorInput.value));
      modal.querySelector('#doiUSAccentSave')?.addEventListener('click', async () => {
        const hex = (colorInput && colorInput.value) || '#5865f2';
        const patch = { accent: hex };
        const site = modal.querySelector('#doiUSSiteAccent');
        if (site) patch.siteAccent = site.checked ? hex : '';
        try {
          const r = await api.saveProfile(patch);
          cache.profile = r.profile; applyTheme();
          toast(site && site.checked ? 'Accent saved — pushed to all users' : 'Accent saved');
        } catch (e) { alert('Save failed: ' + e.message); }
      });
      modal.querySelector('#doiUSAccentReset')?.addEventListener('click', async () => {
        try {
          const r = await api.saveProfile({ accentReset: true });
          cache.profile = r.profile; applyTheme(); renderSettings('appearance');
        } catch (e) { alert('Reset failed: ' + e.message); }
      });
      modal.querySelector('#doiUSBubbles')?.addEventListener('change', async (e) => {
        try {
          const r = await api.saveProfile({ bubbles: e.target.checked });
          cache.profile = r.profile; mountBubbles();
        } catch (err) { alert('Save failed: ' + err.message); }
      });
    }
    // Section wiring
    if (section === 'account') {
      modal.querySelector('[data-us-signout]')?.addEventListener('click', () => {
        modal.hidden = true; signOut();
      });
    }
    if (section === 'profile') {
      modal.querySelector('#doiUSSave')?.addEventListener('click', async () => {
        const bio       = modal.querySelector('#doiUSBio').value;
        const pronouns  = modal.querySelector('#doiUSPronouns').value;
        const bannerColor = modal.querySelector('#doiUSBanner').value;
        const file      = modal.querySelector('#doiUSAvatar').files[0];
        const send = async (avatar) => {
          try {
            const r = await api.saveProfile({ bio, pronouns, bannerColor, ...(avatar !== undefined ? { avatar } : {}) });
            cache.profile = r.profile;
            renderSettings('profile');
            // reflect in shell
            rerenderShell();
          } catch (e) { alert('Save failed: ' + e.message); }
        };
        if (file) {
          if (file.size > 200_000) return alert('Avatar too big — under 200KB.');
          const rd = new FileReader(); rd.onload = () => send(String(rd.result)); rd.readAsDataURL(file);
        } else send(undefined);
      });
    }
    if (section === 'privacy') {
      modal.querySelector('#doiUSPrivacySave')?.addEventListener('click', async () => {
        const val = modal.querySelector('input[name="msgprivacy"]:checked').value;
        try { const r = await api.saveProfile({ messagePrivacy: val }); cache.profile = r.profile; renderSettings('privacy'); }
        catch (e) { alert('Save failed: ' + e.message); }
      });
    }
  }

  function openServerSettings() {
    const s = cache.serversFull[state.server];
    if (!s) return;
    const modal = $('#doiServerSettings');
    $('#doiSSTitle').textContent = '▸ ' + s.name;
    const isOwner = s.isOwner;
    const membersHtml = (s.members || []).slice(0, 40).map(m => {
      const np = nameplateBits(m);
      return `<div class="doi-member-row ${np.cls}" data-open-profile="${esc(m.key || (m.name||'').toLowerCase())}">${np.html}${avatarHTML(m.name, m.avatar, 28)}
        <span class="doi-mem-name ${m.isOwner?'doi-officer':''}">${esc(m.name)}${m.isOwner?' · OWNER':''}</span></div>`;
    }).join('');
    $('#doiSSBody').innerHTML = `
      <div class="doi-field">
        <label>Server ID</label>
        <div style="display:flex;gap:6px">
          <input value="${esc(s.id)}" readonly style="flex:1"/>
          <button class="doi-btn-cancel" id="doiSSCopyId" style="padding:0 10px">Copy</button>
        </div>
        <div class="doi-hint">Share this ID so others can join.</div>
      </div>
      ${isOwner ? `
        <div class="doi-field"><label>Name</label><input id="doiSSName" maxlength="40" value="${esc(s.name)}"/></div>
        <div class="doi-field"><label>Description</label><input id="doiSSDesc" maxlength="200" value="${esc(s.description||'')}"/></div>
        <div class="doi-field"><label>Icon (image, small!)</label>
          <input id="doiSSIcon" type="file" accept="image/*"/>
          <div class="doi-hint">Max ~200KB. Leave empty to keep current.</div>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:14px">
          <button class="doi-btn-primary" id="doiSSSave" style="flex:1;padding:9px">▸ Save</button>
          ${s.isFlagship ? '' : `<button class="doi-btn-danger" id="doiSSDelete" style="flex:1;padding:9px">✕ Delete server</button>`}
        </div>
      ` : `
        <div class="doi-field"><label>Description</label>
          <div style="color:#c0c0c0;font-size:13px;padding:8px 0">${esc(s.description||'no description')}</div>
        </div>
        ${s.isFlagship ? '' : `<button class="doi-btn-danger" id="doiSSLeave" style="width:100%;padding:9px;margin-bottom:14px">✕ Leave server</button>`}
      `}
      <div class="doi-sec-title" style="margin:10px 0 8px">Members · <b>${s.members.length}</b></div>
      <div class="doi-members-list">${membersHtml}</div>
    `;
    modal.hidden = false;
    // member rows open the profile popup (like Discord's member list)
    $$('#doiSSBody [data-open-profile]').forEach(el => el.addEventListener('click', () => {
      modal.hidden = true;
      openProfilePopup(el.dataset.openProfile);
    }));
    // wire owner-only buttons
    $('#doiSSCopyId')?.addEventListener('click', () => {
      navigator.clipboard.writeText(s.id).catch(() => {});
      const b = $('#doiSSCopyId'); const t = b.textContent; b.textContent = 'Copied!';
      setTimeout(() => b.textContent = t, 1200);
    });
    $('#doiSSSave')?.addEventListener('click', async () => {
      const name = $('#doiSSName').value.trim();
      const description = $('#doiSSDesc').value.trim();
      const file = $('#doiSSIcon').files[0];
      const send = async (icon) => {
        try {
          const r = await api.serverSettings(s.id, { name, description, ...(icon !== undefined ? { icon } : {}) });
          cache.serversFull[s.id] = r.server;
          await loadServers();
          modal.hidden = true; rerenderShell();
        } catch (e) { alert('Save failed: ' + e.message); }
      };
      if (file) {
        if (file.size > 200_000) return alert('Icon too big — under 200KB.');
        const rd = new FileReader();
        rd.onload = () => send(String(rd.result));
        rd.readAsDataURL(file);
      } else send(undefined);
    });
    $('#doiSSDelete')?.addEventListener('click', async () => {
      if (!confirm('Delete ' + s.name + '? This cannot be undone.')) return;
      try {
        await api.deleteServer(s.id);
        delete cache.serversFull[s.id];
        state.server = 'home'; state.channel = null;
        await loadServers();
        modal.hidden = true; rerenderShell();
      } catch (e) { alert('Delete failed: ' + e.message); }
    });
    $('#doiSSLeave')?.addEventListener('click', async () => {
      if (!confirm('Leave ' + s.name + '?')) return;
      try {
        await api.leaveServer(s.id);
        delete cache.serversFull[s.id];
        state.server = 'home'; state.channel = null;
        await loadServers();
        modal.hidden = true; rerenderShell();
      } catch (e) { alert('Leave failed: ' + e.message); }
    });
  }

  /* ---------- RE-RENDERERS (no app.js round-trip) ---------- */
  function rerenderShell() {
    const container = document.getElementById('content');
    if (!container) return;
    container.innerHTML = renderShell();
    wire(container);
    afterMount(container);
  }
  function rerenderSidebarAndMain() {
    // Reuse rerenderShell — cheap enough since it's HTML strings only.
    rerenderShell();
  }
  // Full shell rebuild that preserves the composer's text + focus. Safe to
  // call for sidebar changes (no double-wiring: old nodes are discarded).
  function rerenderShellKeepComposer() {
    const container = document.getElementById('content');
    if (!container) return;
    const activeComposer = document.activeElement && document.activeElement.matches('.doi-composer input');
    const val = activeComposer ? document.activeElement.value : null;
    rerenderShell();
    if (val != null) {
      const inp = container.querySelector('.doi-composer input');
      if (inp) { inp.focus(); inp.value = val; }
    }
  }
  function rerenderSidebarOnly() { rerenderShellKeepComposer(); }
  function rerenderMainSoft() {
    const container = document.getElementById('content');
    if (!container) return;
    const main = container.querySelector('.doi-main');
    if (!main) return;
    // preserve composer input value + focus
    const active = document.activeElement && document.activeElement.matches('.doi-composer input');
    const val = active ? document.activeElement.value : null;
    main.innerHTML = renderMain();
    wireMainOnly(container);
    afterMount(container);
    if (val != null) {
      const inp = main.querySelector('.doi-composer input');
      if (inp) { inp.focus(); inp.value = val; }
    }
  }

  function afterMount(container) {
    const msgs = container.querySelector('#doi-msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  /* ---------- WIRING ---------- */
  // Resolve which message store the current view is editing.
  function msgCtx() {
    if (state.server === 'home' && state.homeView === 'group' && state.groupWith) {
      const gid = state.groupWith;
      return { group: true, gid, list: () => (cache.groupMessages[gid] || (cache.groupMessages[gid] = [])) };
    }
    if (state.server === 'home' && state.homeView === 'dm' && state.dmWith) {
      const dmKey = state.dmWith;
      return { dm: true, dmKey, list: () => (cache.dmMessages[dmKey] || (cache.dmMessages[dmKey] = [])) };
    }
    const key = state.server + ':' + state.channel;
    return { channel: true, list: () => (cache.chat[key] || (cache.chat[key] = [])) };
  }

  function wireMainOnly(container) {
    // shop page lives in main content
    if (state.server === 'home' && state.homeView === 'shop') { wireShopPage(container); return; }
    // composer (channel or DM)
    const form = container.querySelector('[data-composer]');
    if (form && !form.dataset.wired) {
      form.dataset.wired = '1';
      const inputEl = form.querySelector('input');
      if (inputEl) inputEl.addEventListener('keydown', ev => {
        if (ev.key !== 'ArrowUp' || inputEl.value.trim()) return;
        // find my last message and trigger its edit affordance
        const gid = form.dataset.gid;
        const isDM = form.dataset.dm;
        const list = gid ? (cache.groupMessages[gid] || [])
                    : isDM ? (cache.dmMessages[state.dmWith] || [])
                    : (cache.chat[state.server + ':' + state.channel] || []);
        const me = cache.profile;
        if (!me) return;
        for (let i = list.length - 1; i >= 0; i--) {
          const m = list[i];
          const mine = (m.authorKey === me.key) || (m.fromKey === me.key) || (m.author === me.name) || (m.from === me.name);
          if (mine) {
            ev.preventDefault();
            const btn = container.querySelector('.doi-msg[data-mid="' + m.id.replace(/"/g,'\\"') + '"] [data-msg-edit]');
            if (btn) btn.click();
            return;
          }
        }
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        input.disabled = true;
        try {
          const gid = form.dataset.gid;
          if (gid) {
            const r = await api.sendGroup(gid, text);
            const list = cache.groupMessages[gid] || (cache.groupMessages[gid] = []);
            list.push(r.message);
            cache.groupSince[gid] = r.message.ts;
            input.value = '';
            bumpConvo('group', gid, r.message.text, r.message.ts);
            rerenderShellKeepComposer();
          } else if (form.dataset.dm) {
            const otherKey = state.dmWith;
            if (!otherKey) return;
            const wasNew = !(cache.dms || []).some(c => c.kind !== 'group' && c.other && c.other.key === otherKey);
            const r = await api.sendDM(otherKey, text);
            const list = cache.dmMessages[otherKey] || (cache.dmMessages[otherKey] = []);
            list.push(r.message);
            cache.dmSince[otherKey] = r.message.ts;
            input.value = '';
            ensureConvoInList('dm', otherKey);
            bumpConvo('dm', otherKey, r.message.text, r.message.ts);
            // new conversation needs the sidebar rebuilt; otherwise soft-render main
            if (wasNew) rerenderShellKeepComposer(); else rerenderMainSoft();
          } else {
            if (state.server === 'home' || !state.channel) return;
            const r = await api.sendChat(state.server, state.channel, text);
            const key = state.server + ':' + state.channel;
            const list = cache.chat[key] || (cache.chat[key] = []);
            list.push(r.message);
            cache.chatSince[key] = r.message.ts;
            input.value = '';
            rerenderMainSoft();
          }
        } catch (e2) {
          alert('Send failed: ' + e2.message);
        } finally {
          const inp2 = form.querySelector('input');
          if (inp2) { inp2.disabled = false; inp2.focus(); }
        }
      });
    }
    // send friend request
    const addF = container.querySelector('#doiAddFriend');
    if (addF && !addF.dataset.wired) {
      addF.dataset.wired = '1';
      addF.addEventListener('submit', async e => {
        e.preventDefault();
        const inp = container.querySelector('#doiAddFriendInput');
        const msg = container.querySelector('#doiAddFriendMsg');
        const call = inp.value.trim();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(call)) { msg.innerHTML = '<span class="doi-hint-err">invalid callsign</span>'; return; }
        try {
          const r = await api.sendFriendReq(call);
          if (r.state === 'friends') msg.innerHTML = '<span class="doi-hint-ok">✓ You and ' + esc(call) + ' are now friends!</span>';
          else                        msg.innerHTML = '<span class="doi-hint-ok">✓ Friend request sent to ' + esc(call) + '</span>';
          inp.value = '';
          await Promise.all([loadFriends(), loadFriendRequests()]);
        } catch (e2) {
          msg.innerHTML = '<span class="doi-hint-err">' + esc(e2.message) + '</span>';
        }
      });
    }
    // remove friend
    $$('[data-remove-friend]', container).forEach(b => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Remove ' + b.dataset.removeFriend + '?')) return;
        try { await api.removeFriend(b.dataset.removeFriend); await Promise.all([loadFriends(), loadFriendRequests()]); rerenderMainSoft(); }
        catch (e2) { alert('Remove failed: ' + e2.message); }
      });
    });
    // accept friend
    $$('[data-accept-friend]', container).forEach(b => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', async e => {
        e.stopPropagation();
        try { await api.acceptFriend(b.dataset.acceptFriend); await Promise.all([loadFriends(), loadFriendRequests()]); rerenderShell(); }
        catch (e2) { alert('Accept failed: ' + e2.message); }
      });
    });
    // decline friend
    $$('[data-decline-friend]', container).forEach(b => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', async e => {
        e.stopPropagation();
        try { await api.declineFriend(b.dataset.declineFriend); await loadFriendRequests(); rerenderMainSoft(); }
        catch (e2) { alert('Decline failed: ' + e2.message); }
      });
    });
    // open profile popup
    $$('[data-open-profile]', container).forEach(el => {
      if (el.dataset.wired) return; el.dataset.wired = '1';
      el.addEventListener('click', e => {
        e.stopPropagation();
        openProfilePopup(el.dataset.openProfile);
      });
    });
    // message edit / delete
    $$('[data-msg-del]', container).forEach(b => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', async e => {
        e.stopPropagation();
        const msgEl = b.closest('.doi-msg');
        const mid = msgEl && msgEl.dataset.mid;
        if (!mid) return;
        if (!confirm('Delete this message?')) return;
        try {
          const ctx = msgCtx();
          if (ctx.group) await api.delGroupMsg(ctx.gid, mid);
          else if (ctx.dm) await api.delDM(ctx.dmKey, mid);
          else await api.delChat(state.server, state.channel, mid);
          const list = ctx.list();
          const i = list.findIndex(x => x.id === mid); if (i !== -1) list.splice(i, 1);
          rerenderMainSoft();
        } catch (e2) { alert('Delete failed: ' + e2.message); }
      });
    });
    $$('[data-msg-edit]', container).forEach(b => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', e => {
        e.stopPropagation();
        const msgEl = b.closest('.doi-msg');
        const mid = msgEl && msgEl.dataset.mid;
        const textEl = msgEl && msgEl.querySelector('.doi-msg-text');
        if (!mid || !textEl) return;
        const cur = textEl.textContent;
        const ta = document.createElement('textarea');
        ta.className = 'doi-msg-edit-ta';
        ta.value = cur; ta.maxLength = 2000;
        textEl.replaceWith(ta);
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
        const cancel = () => { rerenderMainSoft(); };
        const commit = async () => {
          const v = ta.value.trim();
          if (!v || v === cur) return cancel();
          try {
            const ctx = msgCtx();
            const r = ctx.group ? await api.editGroupMsg(ctx.gid, mid, v)
                    : ctx.dm ? await api.editDM(ctx.dmKey, mid, v)
                    : await api.editChat(state.server, state.channel, mid, v);
            const list = ctx.list();
            const i = list.findIndex(x => x.id === mid); if (i !== -1) list[i] = r.message;
            rerenderMainSoft();
          } catch (er) { alert('Edit failed: ' + er.message); cancel(); }
        };
        ta.addEventListener('keydown', ev => {
          if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
          else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commit(); }
        });
        ta.addEventListener('blur', commit, { once: true });
      });
    });

    // DM open from friend row
    $$('[data-dm-open]', container).forEach(b => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', async e => {
        e.stopPropagation();
        await openDM(b.dataset.dmOpen);
      });
    });
  }

  function wire(container) {
    // navigation: home | server | channel | home-friends | dm
    $$('[data-shell-nav]', container).forEach(el => el.addEventListener('click', async () => {
      const t = el.dataset.shellNav;
      if (t === 'home') {
        state.server = 'home'; state.channel = null; state.homeView = 'friends';
        await Promise.all([loadFriends(), loadFriendRequests(), loadDMs()]);
      }
      else if (t === 'home-friends') {
        state.homeView = 'friends';
      }
      else if (t === 'dm') {
        state.homeView = 'dm'; state.dmWith = el.dataset.dmKey; state.groupWith = null;
        await loadDMMessages(state.dmWith);
      }
      else if (t === 'group') {
        state.homeView = 'group'; state.groupWith = el.dataset.gid; state.dmWith = null;
        await loadGroup(state.groupWith);
      }
      else if (t === 'server') {
        state.server = el.dataset.sid; state.channel = null;
        const s = await loadServer(state.server);
        if (s && s.channels && s.channels.length) state.channel = s.channels[0].id;
        if (s && state.channel) await loadChat(state.server, state.channel);
      }
      else if (t === 'channel') {
        state.channel = el.dataset.cid;
        await loadChat(state.server, state.channel);
      }
      rerenderShell();
      startPoll();
    }));

    // friend tabs (sub-navigation within home > friends)
    $$('[data-friend-tab]', container).forEach(b => b.addEventListener('click', () => {
      state.homeView = 'friends';
      state.friendTab = b.dataset.friendTab;
      rerenderMainSoft();
    }));

    // close DM (X on hover)
    $$('[data-dm-close]', container).forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const key = b.dataset.dmClose;
      try {
        await api.closeDM(key);
        if (state.homeView === 'dm' && state.dmWith === key) { state.homeView = 'friends'; state.dmWith = null; }
        await loadDMs();
        rerenderShell();
      } catch (er) { alert('Close failed: ' + er.message); }
    }));

    // new DM / group → friend-picker modal
    $$('[data-shell-newdm]', container).forEach(el => el.addEventListener('click', () => openNewConvo()));

    // soft (placeholder) features → small toast
    $$('[data-shell-soft]', container).forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      toast(el.dataset.shellSoft + ' — coming soon');
    }));

    // shop / premium — open the shop as an in-app page (keeps sidebar)
    $$('[data-shell-shop]', container).forEach(el => el.addEventListener('click', async e => {
      e.stopPropagation();
      await openShop(el.dataset.shellShop);
    }));

    // group: leave / invite / settings
    $$('[data-group-leave]', container).forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const gid = b.dataset.groupLeave;
      if (!confirm('Leave this group?')) return;
      try {
        await api.groupLeave(gid);
        if (state.groupWith === gid) { state.homeView = 'friends'; state.groupWith = null; }
        delete cache.groupsFull[gid];
        await loadDMs();
        rerenderShell();
      } catch (er) { alert('Leave failed: ' + er.message); }
    }));
    $$('[data-group-invite]', container).forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      openGroupInvite(b.dataset.groupInvite);
    }));
    $$('[data-group-settings]', container).forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      openGroupSettings(b.dataset.groupSettings);
    }));

    // "Find or start a conversation" search — purely visual, toggles row
    // visibility so existing click handlers stay intact (no re-wiring).
    const dmSearch = container.querySelector('#doi-dm-search');
    if (dmSearch && !dmSearch.dataset.wired) {
      dmSearch.dataset.wired = '1';
      dmSearch.addEventListener('input', () => {
        state.dmSearch = dmSearch.value;
        const term = dmSearch.value.trim().toLowerCase();
        let shown = 0;
        $$('#doi-dm-list .doi-dm-row', container).forEach(row => {
          const hit = !term || (row.dataset.title || '').includes(term);
          row.style.display = hit ? '' : 'none';
          if (hit) shown++;
        });
        let empty = container.querySelector('#doi-dm-empty-hint');
        const list = container.querySelector('#doi-dm-list');
        if (!shown && list) {
          if (!empty) { empty = document.createElement('div'); empty.id = 'doi-dm-empty-hint'; empty.className = 'doi-empty'; empty.style.cssText = 'padding:12px 8px;font-size:11px'; list.appendChild(empty); }
          empty.textContent = term ? 'no matches' : 'no conversations yet';
        } else if (empty) { empty.remove(); }
      });
    }

    // user-panel controls (mute/deafen are visual state only; settings opens modal)
    $$('[data-shell-toggle-mute]', container).forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
    $$('[data-shell-toggle-deaf]', container).forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
    $$('[data-shell-opensettings]', container).forEach(b => b.addEventListener('click', openSettings));
    $$('[data-shell-openprofile]', container).forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      openProfilePopup(el.dataset.pkey);
    }));
    // bottom-left user panel → Discord-style mini popup
    $$('[data-shell-minipopup]', container).forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      openMiniPopup();
    }));

    // new server modal
    $$('[data-shell-newserver]', container).forEach(el => el.addEventListener('click', () => {
      $('#doiNewServerModal').hidden = false;
      setTimeout(() => $('#doiNSName')?.focus(), 30);
    }));
    // new-server tab switch
    $$('[data-newsrv-tab]', container).forEach(b => b.addEventListener('click', () => {
      $$('[data-newsrv-tab]', container).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const to = b.dataset.newsrvTab;
      container.querySelector('#doiNewSrvCreate').hidden = to !== 'create';
      container.querySelector('#doiNewSrvJoin').hidden = to !== 'join';
    }));
    // submit create-server
    const btnCS = container.querySelector('[data-submit-newserver]');
    if (btnCS) btnCS.addEventListener('click', async () => {
      const name = $('#doiNSName').value.trim();
      const desc = $('#doiNSDesc').value.trim();
      if (!name) return;
      btnCS.disabled = true; btnCS.textContent = '… creating';
      try {
        const r = await api.createServer(name, desc);
        cache.serversFull[r.server.id] = r.server;
        await loadServers();
        state.server = r.server.id;
        state.channel = r.server.channels[0] ? r.server.channels[0].id : null;
        if (state.channel) await loadChat(state.server, state.channel);
        $('#doiNewServerModal').hidden = true;
        rerenderShell();
      } catch (e) { alert('Create failed: ' + e.message); }
      finally { btnCS.disabled = false; btnCS.textContent = '▸ Create Server'; }
    });
    // submit join-server
    const btnJS = container.querySelector('[data-submit-joinserver]');
    if (btnJS) btnJS.addEventListener('click', async () => {
      const id = $('#doiNSJoin').value.trim();
      if (!id) return;
      btnJS.disabled = true; btnJS.textContent = '… joining';
      try {
        const r = await api.joinServer(id);
        cache.serversFull[id] = r.server;
        await loadServers();
        state.server = id;
        state.channel = r.server.channels[0] ? r.server.channels[0].id : null;
        if (state.channel) await loadChat(state.server, state.channel);
        $('#doiNewServerModal').hidden = true;
        rerenderShell();
      } catch (e) { alert('Join failed: ' + e.message); }
      finally { btnJS.disabled = false; btnJS.textContent = '▸ Join Server'; }
    });

    // server settings (guildhead click)
    $$('[data-shell-serversettings]', container).forEach(el => el.addEventListener('click', openServerSettings));

    // new channel
    $$('[data-newchannel]', container).forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      $('#doiNCCategory').value = b.dataset.newchannel;
      $('#doiNCName').value = '';
      $('#doiNCTopic').value = '';
      $('#doiNewChannelModal').hidden = false;
      setTimeout(() => $('#doiNCName')?.focus(), 30);
    }));
    const btnNC = container.querySelector('[data-submit-newchannel]');
    if (btnNC) btnNC.addEventListener('click', async () => {
      const name = $('#doiNCName').value.trim();
      const topic = $('#doiNCTopic').value.trim();
      const categoryId = $('#doiNCCategory').value || null;
      if (!name) return;
      btnNC.disabled = true;
      try {
        await api.newChannel(state.server, name, categoryId, topic);
        cache.serversFull[state.server] = (await api.server(state.server)).server;
        $('#doiNewChannelModal').hidden = true;
        rerenderShell();
      } catch (e) { alert('Create channel failed: ' + e.message); }
      finally { btnNC.disabled = false; }
    });

    // new category
    $$('[data-shell-newcategory]', container).forEach(b => b.addEventListener('click', () => {
      $('#doiNKName').value = '';
      $('#doiNewCategoryModal').hidden = false;
      setTimeout(() => $('#doiNKName')?.focus(), 30);
    }));
    const btnNK = container.querySelector('[data-submit-newcategory]');
    if (btnNK) btnNK.addEventListener('click', async () => {
      const name = $('#doiNKName').value.trim();
      if (!name) return;
      btnNK.disabled = true;
      try {
        await api.newCategory(state.server, name);
        cache.serversFull[state.server] = (await api.server(state.server)).server;
        $('#doiNewCategoryModal').hidden = true;
        rerenderShell();
      } catch (e) { alert('Create category failed: ' + e.message); }
      finally { btnNK.disabled = false; }
    });

    // delete channel
    $$('[data-del-channel]', container).forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const cid = b.dataset.delChannel;
      if (!confirm('Delete this channel?')) return;
      try {
        await api.deleteChannel(state.server, cid);
        if (state.channel === cid) state.channel = null;
        cache.serversFull[state.server] = (await api.server(state.server)).server;
        rerenderShell();
      } catch (e2) { alert('Delete failed: ' + e2.message); }
    }));

    // sign out
    const so = container.querySelector('[data-shell-signout]');
    if (so) so.addEventListener('click', signOut);

    // close modals
    $$('[data-close-modal]', container).forEach(b => b.addEventListener('click', () => b.closest('.doi-modal').hidden = true));
    $$('.doi-modal', container).forEach(m => m.addEventListener('click', e => { if (e.target === m) m.hidden = true; }));

    // main-pane specifics
    wireMainOnly(container);
  }

  /* ---------- PUBLIC ---------- */
  window.DOI = {
    renderGate,
    isAuthed,
    isDOI,
    signOut,
    LOGO_URL,
    renderHome() {
      if (!isAuthed()) return '';
      return renderShell();
    },
    wireHome(container) {
      if (!container) return;
      wire(container);
      afterMount(container);
      startPoll();
    },
    renderAdminHub() {
      return `
        <div class="doi-admin-warn"><b>▸ ADMIN CONSOLE</b> — Restricted. Only <b>DOI</b> has access.</div>
        <div class="doi-admin-grid">
          <a class="doi-admin-card" href="#/battlefeuer" data-link><span class="doi-adm-ico">🛰</span><h4>Battlefeuer Bridge</h4><p>Bridge, wonder-scripts, decoder, live console.</p></a>
          <a class="doi-admin-card" href="#/scripts" data-link><span class="doi-adm-ico">📂</span><h4>Script Library</h4><p>Every script + avatar vault.</p></a>
          <a class="doi-admin-card" href="#/world-builder" data-link><span class="doi-adm-ico">🌐</span><h4>World Builder</h4><p>Real-world terrain + Roblox world server.</p></a>
          <a class="doi-admin-card" href="#/map-drive" data-link><span class="doi-adm-ico">🚗</span><h4>Map Drive</h4><p>Satellite driving grid.</p></a>
        </div>`;
    },
    // Allow admin-gated pages to call this to check access
    requireDOI() {
      if (!isDOI()) {
        location.hash = '#/overview';
        return false;
      }
      return true;
    }
  };

  /* ---------- BOOT ---------- */
  async function boot() {
    applyTheme(); // midnight liquid-glass by default, even on the login gate
    if (!cache.token) { renderGate('login'); return; }
    try {
      const r = await api.me();
      cache.profile = r.profile;
      applyTheme();
      // preload core data once, then let render happen
      await Promise.all([loadServers(), loadFriends(), loadFriendRequests(), loadDMs(), preloadShop()]);
      // pre-select flagship server → first channel so users land in something usable
      if (state.server === 'home' && cache.servers && cache.servers.length) {
        // stay on home; user sees Friends first (Discord-like)
      }
      if (typeof window.__doiRender === 'function') window.__doiRender();
      window.dispatchEvent(new CustomEvent('doi:auth'));
    } catch (_) {
      cache.token = null; localStorage.removeItem(TOKEN_KEY);
      renderGate('login');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // sign-out cross-tab
  window.addEventListener('storage', e => {
    if (e.key === TOKEN_KEY) {
      cache.token = localStorage.getItem(TOKEN_KEY);
      if (!cache.token) { cache.profile = null; stopPoll(); renderGate('login'); }
    }
  });
})();
