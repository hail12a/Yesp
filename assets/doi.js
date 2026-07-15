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
  const LOGO_URL       = 'assets/img/doi-logo.png?v=20260715d';
  const HERO_TEAM_URL  = 'assets/img/hero-team.png?v=20260715d';
  const HERO_GATE_URL  = 'assets/img/hero-gate.png?v=20260715d';
  window.DOI_LOGO_URL = LOGO_URL;

  /* ---------- CACHE ---------- */
  const cache = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    profile: null,                     // { name, tag, bio, avatar, isDOI }
    servers: null,                     // [brief]
    serversFull: {},                   // id -> full
    chat: {},                          // `${serverId}:${channelId}` -> messages
    chatSince: {},                     // same key -> ts
    friends: null,                     // list
    lastServersFetch: 0,
    lastFriendsFetch: 0,
  };

  /* ---------- STATE ---------- */
  const state = window.__doiHomeState = window.__doiHomeState || {
    server: 'home',                    // 'home' or serverId
    channel: null,                     // channelId within current server
    friendTab: 'all',                  // 'all' | 'add'
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
    addFriend:    (callsign) => jfetch('/api/doi/friends/add',    { method: 'POST', body: JSON.stringify({ token: cache.token, callsign }) }),
    removeFriend: (callsign) => jfetch('/api/doi/friends/remove', { method: 'POST', body: JSON.stringify({ token: cache.token, callsign }) }),
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

  /* ---------- LOGIN GATE ---------- */
  function renderGate(mode = 'login', err = '') {
    const gate = $('#doiGate');
    if (!gate) return;
    gate.hidden = false;
    gate.innerHTML = `
      <div class="doi-gate-bg" style="background-image:url('${HERO_GATE_URL}')"></div>
      <div class="doi-gate-inner">
        <div class="doi-gate-badge"><img src="${LOGO_URL}" alt="DOI"/></div>
        <h1>Department of Insurgency</h1>
        <p class="doi-motto">Dismantling Greed</p>
        <p class="doi-classified"><b>◆ CLASSIFIED</b> · Site-CI Terminal · Authorization Required</p>
        <div class="doi-tabs" role="tablist">
          <button data-mode="login" class="${mode==='login'?'active':''}">Sign In</button>
          <button data-mode="register" class="${mode==='register'?'active':''}">Register</button>
        </div>
        <form id="doiGateForm" autocomplete="off">
          <div class="doi-field">
            <label>Callsign</label>
            <input name="user" required minlength="3" maxlength="16" pattern="[A-Za-z0-9_]{3,16}"
              placeholder="e.g. Vector_7" autocomplete="off"/>
            <div class="doi-hint">3–16 chars · letters, numbers, underscore.</div>
          </div>
          <div class="doi-field">
            <label>Cipher</label>
            <input name="pass" type="password" required minlength="4" placeholder="At least 4 characters"/>
            <div class="doi-hint">Hashed on the server. Never logged.</div>
          </div>
          ${err ? `<div class="doi-gate-err">${esc(err)}</div>` : ''}
          <button class="doi-gate-submit" type="submit">
            ${mode==='login' ? '▸ ACCESS TERMINAL' : '▸ REGISTER OPERATIVE'}
          </button>
        </form>
        <div class="doi-gate-foot">// SESSION-DOI · SERVER-BACKED · SPARKEDHOST</div>
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

  /* Pre-load whatever's needed for the current view. Called once per navigation. */
  async function preload() {
    const jobs = [];
    if (!cache.servers || Date.now() - cache.lastServersFetch > 60_000) jobs.push(loadServers());
    if (state.server === 'home') {
      if (!cache.friends || Date.now() - cache.lastFriendsFetch > 30_000) jobs.push(loadFriends());
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
      return `
        <div class="doi-channels">
          <div class="doi-guildhead"><span class="doi-dot"></span><span>Friends</span></div>
          <div class="doi-chan-scroll">
            <div class="doi-friend-tabs">
              <button class="doi-friend-tab ${state.friendTab==='all'?'active':''}" data-friend-tab="all">Friends</button>
              <button class="doi-friend-tab ${state.friendTab==='add'?'active':''}" data-friend-tab="add">Add friend</button>
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
  function userPanel(p) {
    return `<div class="doi-userpanel">
      ${avatarHTML(p.name, p.avatar, 36)}
      <div class="doi-uinfo">
        <div class="doi-uname">${esc(p.name)}${p.isDOI ? ' <span class="doi-badge-owner">OWNER</span>':''}</div>
        <div class="doi-utag">${esc(p.tag)} · ${esc(p.bio || 'Insurgent')}</div>
      </div>
      <button class="doi-uedit" data-shell-editprofile title="Customize profile">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
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
    const p = cache.profile || {};
    const tab = state.friendTab;
    const friends = cache.friends || [];
    const head = `<span class="doi-hash">◈</span><h2>Home · Friends</h2>
      <span class="doi-topic">${friends.length} friend${friends.length===1?'':'s'}</span>`;
    let body;
    if (tab === 'add') {
      body = `<div class="doi-main-body">
        <div class="doi-sec-title">Add a friend</div>
        <form id="doiAddFriend" style="display:flex;gap:10px;max-width:520px">
          <input id="doiAddFriendInput" placeholder="operative callsign (e.g. Vector_7)" maxlength="16" pattern="[A-Za-z0-9_]{3,16}" style="flex:1;background:#131313;border:1px solid #2a2a2a;color:#ececec;padding:10px 12px;border-radius:2px;font-family:var(--mono);font-size:13px"/>
          <button type="submit" class="doi-btn-primary" style="padding:10px 18px;border:1px solid #000">▸ Send</button>
        </form>
        <div id="doiAddFriendMsg" style="margin-top:10px;font-family:var(--mono);font-size:12px"></div>
        <div class="doi-sec-title" style="margin-top:24px">Notes</div>
        <p style="color:#8a8a8a;font-size:13px">Friends are symmetric. Both operatives immediately see each other in the roster.</p>
      </div>`;
    } else {
      body = `<div class="doi-main-body">
        <div class="doi-hero" style="min-height:180px">
          <div class="doi-hero-img" style="background-image:url('${HERO_TEAM_URL}')"></div>
          <div class="doi-hero-vign"></div>
          <div class="doi-hero-inner">
            <img class="doi-hero-mark" src="${LOGO_URL}"/>
            <div class="doi-hero-txt">
              <h1>${esc(p.name || 'Operative')}</h1>
              <p>Welcome back to the DOI network</p>
              <p class="doi-motto">${esc(p.bio || 'Dismantling Greed')}</p>
            </div>
          </div>
        </div>
        <div class="doi-sec-title">Friends · <b>${friends.length}</b></div>
        ${friends.length ? `<div class="doi-friend-list">${friends.map(friendRow).join('')}</div>`
          : `<div class="doi-empty" style="text-align:left;padding:14px 0">no friends yet — hit "Add friend" in the sidebar</div>`}
      </div>`;
    }
    return `<div class="doi-main-head">${head}</div>${body}`;
  }

  function friendRow(f) {
    return `<div class="doi-friend">
      ${avatarHTML(f.name, f.avatar, 40)}
      <div class="doi-friend-info">
        <div class="doi-friend-name">${esc(f.name)}</div>
        <div class="doi-friend-tag">${esc(f.tag || '')} · ${esc(f.bio || '')}</div>
      </div>
      <button class="doi-friend-remove" data-remove-friend="${esc(f.name)}" title="Remove">×</button>
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
  function composerHTML(label) {
    return `<div class="doi-composer">
      <form data-composer>
        <input type="text" placeholder="Message #${esc(label || 'channel')}" maxlength="2000" autocomplete="off"/>
        <button type="submit">Send ▸</button>
      </form>
    </div>`;
  }

  /* ---------- MODALS ---------- */
  function modalHTML() {
    return `
      <div class="doi-modal" id="doiProfileModal" hidden><div class="doi-modal-inner">
        <h3>▸ Customize Profile</h3>
        <div class="doi-field"><label>Callsign</label>
          <input type="text" value="${esc((cache.profile||{}).name||'')}" disabled/>
          <div class="doi-hint">Callsign is locked to the account.</div>
        </div>
        <div class="doi-field"><label>Bio</label>
          <input id="doiPfBio" type="text" maxlength="120" value="${esc((cache.profile||{}).bio||'')}"/>
        </div>
        <div class="doi-field"><label>Avatar (image, small!)</label>
          <input id="doiPfAvatar" type="file" accept="image/*"/>
          <div class="doi-hint">Max ~200KB. Stored on the server.</div>
        </div>
        <div class="doi-modal-actions">
          <button class="doi-btn-cancel" data-close-modal>Cancel</button>
          <button class="doi-btn-primary" data-submit-profile>▸ Save</button>
        </div>
      </div></div>

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
      </div></div>`;
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
    // composer
    const form = container.querySelector('[data-composer]');
    if (form && !form.dataset.wired) {
      form.dataset.wired = '1';
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (!text || state.server === 'home' || !state.channel) return;
        input.disabled = true;
        try {
          const r = await api.sendChat(state.server, state.channel, text);
          const key = state.server + ':' + state.channel;
          const list = cache.chat[key] || (cache.chat[key] = []);
          list.push(r.message);
          cache.chatSince[key] = r.message.ts;
          input.value = '';
          rerenderMainSoft();
        } catch (e2) {
          alert('Send failed: ' + e2.message);
        } finally { input.disabled = false; input.focus(); }
      });
    }
    // add-friend
    const addF = container.querySelector('#doiAddFriend');
    if (addF && !addF.dataset.wired) {
      addF.dataset.wired = '1';
      addF.addEventListener('submit', async e => {
        e.preventDefault();
        const inp = container.querySelector('#doiAddFriendInput');
        const msg = container.querySelector('#doiAddFriendMsg');
        const call = inp.value.trim();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(call)) { msg.textContent = 'invalid callsign'; msg.style.color = '#ff5566'; return; }
        try {
          await api.addFriend(call);
          msg.textContent = '✓ ' + call + ' added'; msg.style.color = '#4dd867';
          inp.value = '';
          await loadFriends();
        } catch (e2) {
          msg.textContent = e2.message; msg.style.color = '#ff5566';
        }
      });
    }
    // remove friend
    $$('[data-remove-friend]', container).forEach(b => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', async () => {
        if (!confirm('Remove ' + b.dataset.removeFriend + '?')) return;
        try { await api.removeFriend(b.dataset.removeFriend); await loadFriends(); rerenderMainSoft(); }
        catch (e) { alert('Remove failed: ' + e.message); }
      });
    });
  }

  function wire(container) {
    // navigation: home | server | channel
    $$('[data-shell-nav]', container).forEach(el => el.addEventListener('click', async () => {
      const t = el.dataset.shellNav;
      if (t === 'home') { state.server = 'home'; state.channel = null; }
      else if (t === 'server') {
        state.server = el.dataset.sid; state.channel = null;
        // load the full server; then auto-select the first channel
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

    // friend tabs
    $$('[data-friend-tab]', container).forEach(b => b.addEventListener('click', () => {
      state.friendTab = b.dataset.friendTab;
      rerenderShell();
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

    // profile modal
    $$('[data-shell-editprofile]', container).forEach(el => el.addEventListener('click', () => {
      $('#doiProfileModal').hidden = false;
    }));
    const btnP = container.querySelector('[data-submit-profile]');
    if (btnP) btnP.addEventListener('click', async () => {
      const bio = $('#doiPfBio').value.trim();
      const file = $('#doiPfAvatar').files[0];
      const send = async (avatar) => {
        btnP.disabled = true;
        try {
          const r = await api.saveProfile({ bio, ...(avatar !== undefined ? { avatar } : {}) });
          cache.profile = r.profile;
          $('#doiProfileModal').hidden = true;
          rerenderShell();
        } catch (e) { alert('Save failed: ' + e.message); }
        finally { btnP.disabled = false; }
      };
      if (file) {
        if (file.size > 200_000) return alert('Avatar too big — under 200KB.');
        const rd = new FileReader();
        rd.onload = () => send(String(rd.result));
        rd.readAsDataURL(file);
      } else send(undefined);
    });

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
