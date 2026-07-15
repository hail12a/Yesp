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
  const LOGO_URL       = 'assets/img/doi-logo.png?v=20260715f';
  const HERO_TEAM_URL  = 'assets/img/hero-team.png?v=20260715f';
  const HERO_GATE_URL  = 'assets/img/hero-gate.png?v=20260715f';
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
    dms: null,                         // conversation list
    dmMessages: {},                    // otherKey -> messages
    dmSince: {},                       // otherKey -> ts
    lastServersFetch: 0,
    lastFriendsFetch: 0,
    lastReqsFetch: 0,
    lastDMsFetch: 0,
  };

  /* ---------- STATE ---------- */
  const state = window.__doiHomeState = window.__doiHomeState || {
    server: 'home',                    // 'home' or serverId
    channel: null,                     // channelId within current server
    homeView: 'friends',               // 'friends' | 'dm'
    friendTab: 'all',                  // 'online' | 'all' | 'pending' | 'add'
    dmWith: null,                      // userKey when homeView='dm'
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

  function applyTheme() {
    // Non-owners are always Discord-dark. Owner can pick Insurgency.
    const wantIns = isDOI() && cache.profile && cache.profile.theme === 'insurgency';
    document.body.classList.toggle('doi-theme-insurgency', !!wantIns);
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
        <p class="doi-motto">${mode==='login' ? "We're so excited to see you again." : 'Join the Department of Insurgency network.'}</p>
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
        <div class="doi-gate-foot">Department of Insurgency · same-origin server</div>
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
        await Promise.all([loadServers(), loadFriends()]);
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
      }
    } catch (_) { /* ignore transient network */ }
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
      if (r.messages && r.messages.length) cache.dmSince[otherKey] = r.messages[r.messages.length - 1].ts;
    } catch (_) { cache.dmMessages[otherKey] = cache.dmMessages[otherKey] || []; }
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
      const dms = cache.dms || [];
      const reqCount = (cache.friendReqs.incoming || []).length;
      return `
        <div class="doi-channels doi-channels-home">
          <div class="doi-home-search">
            <input placeholder="Find or start a conversation" id="doi-dm-search"/>
          </div>
          <div class="doi-chan-scroll">
            <div class="doi-home-nav ${state.homeView==='friends'?'active':''}" data-shell-nav="home-friends">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>Friends</span>
              ${reqCount ? `<span class="doi-badge-count">${reqCount}</span>` : ''}
            </div>
            <div class="doi-catlabel doi-catlabel-dm">
              <span>Direct Messages</span>
              <button class="doi-catadd" data-shell-newdm title="New DM">+</button>
            </div>
            <div id="doi-dm-list">
              ${dms.length ? dms.map(dmRow).join('')
                : '<div class="doi-empty" style="padding:12px 8px;font-size:11px">no conversations yet</div>'}
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
  function dmRow(c) {
    const other = c.other || {};
    const active = state.homeView === 'dm' && state.dmWith === other.key;
    return `<div class="doi-dm-row ${active?'active':''}" data-shell-nav="dm" data-dm-key="${esc(other.key)}">
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
      <div class="doi-uleft" data-shell-opensettings title="Edit your account">
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
      ${msgs.length ? msgs.map(msgHTML).join('') : '<div class="doi-empty">no messages · be the first</div>'}
    </div>${composerHTML(ch.name)}`;
    return `<div class="doi-main-head">${head}</div>${body}`;
  }

  function renderMainHome() {
    if (state.homeView === 'dm' && state.dmWith) return renderMainDM();
    return renderMainFriends();
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
    return `<div class="doi-friend" data-open-profile="${esc(f.key || (f.name||'').toLowerCase())}">
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
      <button class="doi-topic doi-topic-btn" data-open-profile="${esc(otherKey)}">view profile</button>`;
    const body = `<div class="doi-main-body" id="doi-msgs">
      ${msgs.length ? msgs.map(dmMsgHTML).join('') : `<div class="doi-empty" style="padding:40px 20px">say hi to ${esc(other.name)}</div>`}
    </div>${composerHTML(other.name, true)}`;
    return `<div class="doi-main-head doi-main-head-dm">${head}</div>${body}`;
  }

  function dmMsgHTML(m) {
    return `<div class="doi-msg">
      ${avatarHTML(m.from, null, 40)}
      <div class="doi-msg-body">
        <div class="doi-msg-head">
          <span class="doi-msg-name">${esc(m.from)}</span>
          <span class="doi-msg-time">${timeAgo(m.ts)}</span>
        </div>
        <div class="doi-msg-text">${esc(m.text)}</div>
      </div>
    </div>`;
  }

  function msgHTML(m) {
    const isOfficer = m.author === 'DOI' || /^Cmdr\./i.test(m.author);
    return `<div class="doi-msg">
      ${avatarHTML(m.author, null, 40)}
      <div class="doi-msg-body">
        <div class="doi-msg-head">
          <span class="doi-msg-name ${isOfficer?'doi-officer':''}">${esc(m.author)}</span>
          <span class="doi-msg-time">${timeAgo(m.ts)}</span>
        </div>
        <div class="doi-msg-text">${esc(m.text)}</div>
      </div>
    </div>`;
  }
  function composerHTML(label, isDM) {
    const placeholder = isDM ? 'Message @' + esc(label || '') : 'Message #' + esc(label || 'channel');
    return `<div class="doi-composer">
      <form data-composer data-dm="${isDM ? '1':''}">
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

      <div class="doi-modal doi-modal-full" id="doiUserSettings" hidden></div>`;
  }

  async function openDM(otherKey) {
    if (!otherKey) return;
    state.server = 'home';
    state.homeView = 'dm';
    state.dmWith = otherKey;
    await Promise.all([loadDMs(), loadDMMessages(otherKey)]);
    rerenderShell();
    startPoll();
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
    inner.innerHTML = `
      <button class="doi-pp-close" data-close-modal title="Close">×</button>
      <div class="doi-pp-shell">
        <div class="doi-pp-col">
          <div class="doi-pp">
            <div class="doi-pp-banner ${isSelf?'editable':''}" data-pp-editbanner style="background:${esc(prof.bannerColor)}"></div>
            <div class="doi-pp-avatarwrap">${avatarHTML(prof.name, prof.avatar, 96)}
              <span class="doi-pp-online"></span>
            </div>
            <div class="doi-pp-body">
              <div class="doi-pp-namebox">
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
      const theme = p.theme || 'discord';
      body = `
        <h2>Appearance</h2>
        ${owner ? `
          <div class="doi-us-field">
            <label>Theme (Owner Only)</label>
            <div class="doi-theme-picker">
              <div class="doi-theme-choice ${theme==='discord'?'active':''}" data-us-theme="discord">
                <div class="doi-theme-choice-preview discord"></div>
                <div class="doi-theme-choice-label">Discord</div>
              </div>
              <div class="doi-theme-choice ${theme==='insurgency'?'active':''}" data-us-theme="insurgency">
                <div class="doi-theme-choice-preview insurgency"></div>
                <div class="doi-theme-choice-label">Insurgency</div>
              </div>
            </div>
            <div class="doi-us-hint">Users always see the Discord theme. Only the owner can switch to Insurgency.</div>
          </div>
        ` : `
          <div class="doi-us-field">
            <label>Theme</label>
            <div class="doi-us-val">Discord Dark</div>
            <div class="doi-us-hint">Alternate themes are owner-only.</div>
          </div>
        `}`;
    } else {
      body = `
        <h2>About DOI</h2>
        <p style="color:#c0c0c0"><b>Department of Insurgency</b> — Site-CI Terminal</p>
        <p style="color:#a0a0a0;font-size:13px">Server: same-origin Node process on Sparkedhost.</p>
        <p style="color:#a0a0a0;font-size:13px">Client build: 20260715e</p>
        <p style="color:#a0a0a0;font-size:13px">Motto: Dismantling Greed</p>`;
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
    // theme picker (owner only)
    $$('[data-us-theme]', modal).forEach(el => el.addEventListener('click', async () => {
      const t = el.dataset.usTheme;
      try {
        const r = await api.saveProfile({ theme: t });
        cache.profile = r.profile;
        applyTheme();
        renderSettings('appearance');
      } catch (e) { alert('Save failed: ' + e.message); }
    }));
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
    const membersHtml = (s.members || []).slice(0, 40).map(m =>
      `<div class="doi-member-row">${avatarHTML(m.name, m.avatar, 28)}
        <span class="doi-mem-name ${m.isOwner?'doi-officer':''}">${esc(m.name)}${m.isOwner?' · OWNER':''}</span></div>`).join('');
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
  function wireMainOnly(container) {
    // composer (channel or DM)
    const form = container.querySelector('[data-composer]');
    if (form && !form.dataset.wired) {
      form.dataset.wired = '1';
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        input.disabled = true;
        try {
          if (form.dataset.dm) {
            const otherKey = state.dmWith;
            if (!otherKey) return;
            const r = await api.sendDM(otherKey, text);
            const list = cache.dmMessages[otherKey] || (cache.dmMessages[otherKey] = []);
            list.push(r.message);
            cache.dmSince[otherKey] = r.message.ts;
          } else {
            if (state.server === 'home' || !state.channel) return;
            const r = await api.sendChat(state.server, state.channel, text);
            const key = state.server + ':' + state.channel;
            const list = cache.chat[key] || (cache.chat[key] = []);
            list.push(r.message);
            cache.chatSince[key] = r.message.ts;
          }
          input.value = '';
          rerenderMainSoft();
        } catch (e2) {
          alert('Send failed: ' + e2.message);
        } finally { input.disabled = false; input.focus(); }
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
        state.homeView = 'dm'; state.dmWith = el.dataset.dmKey;
        await loadDMMessages(state.dmWith);
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

    // new DM prompt
    $$('[data-shell-newdm]', container).forEach(el => el.addEventListener('click', async () => {
      const call = prompt('Callsign of the operative to message:');
      if (!call) return;
      await openDM(call.toLowerCase());
    }));

    // user-panel controls (mute/deafen are visual state only; settings opens modal)
    $$('[data-shell-toggle-mute]', container).forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
    $$('[data-shell-toggle-deaf]', container).forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
    $$('[data-shell-opensettings]', container).forEach(b => b.addEventListener('click', openSettings));
    $$('[data-shell-openprofile]', container).forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      openProfilePopup(el.dataset.pkey);
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
    if (!cache.token) { renderGate('login'); return; }
    try {
      const r = await api.me();
      cache.profile = r.profile;
      applyTheme();
      // preload core data once, then let render happen
      await Promise.all([loadServers(), loadFriends()]);
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
