/* =========================================================
   doi.js — Department of Insurgency
   Auth, profile, forums, chat via the server (same-origin API)
   ========================================================= */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const TOKEN_KEY = 'doi.token';

  /* ---------- CACHE (in-memory) ---------- */
  const cache = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    profile: null,                 // { name, tag, bio, avatar, joined }
    forums: null,                  // array
    threads: {},                   // id -> full thread
    chat: {},                      // channel -> array
    chatSince: {},                 // channel -> last ts seen
    members: { online: [], offline: [] },
    fetchedForums: 0,
    fetchedMembers: 0,
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

  const api = {
    register: (user, pass) =>
      jfetch('/api/register', { method: 'POST', body: JSON.stringify({ user, pass }) }),
    login: (user, pass) =>
      jfetch('/api/login', { method: 'POST', body: JSON.stringify({ user, pass }) }),
    me: () =>
      jfetch('/api/doi/me?token=' + encodeURIComponent(cache.token || '')),
    saveProfile: (patch) =>
      jfetch('/api/doi/me', { method: 'POST', body: JSON.stringify({ token: cache.token, ...patch }) }),
    members: () => jfetch('/api/doi/members'),
    heartbeat: () =>
      jfetch('/api/doi/heartbeat', { method: 'POST', body: JSON.stringify({ token: cache.token }) }),
    forums: () => jfetch('/api/doi/forums'),
    thread: (id) => jfetch('/api/doi/forums/' + encodeURIComponent(id)),
    newThread: (title, body) =>
      jfetch('/api/doi/forums', { method: 'POST', body: JSON.stringify({ token: cache.token, title, body }) }),
    postThread: (id, text) =>
      jfetch('/api/doi/forums/' + encodeURIComponent(id) + '/msg', {
        method: 'POST', body: JSON.stringify({ token: cache.token, text })
      }),
    chat: (ch, since) =>
      jfetch('/api/doi/chat/' + encodeURIComponent(ch) + (since ? '?since=' + since : '')),
    sendChat: (ch, text) =>
      jfetch('/api/doi/chat/' + encodeURIComponent(ch), {
        method: 'POST', body: JSON.stringify({ token: cache.token, text })
      }),
  };

  /* ---------- ASSETS ---------- */
  const LOGO_URL = 'assets/img/doi-logo.png?v=20260715c';
  const HERO_TEAM_URL = 'assets/img/hero-team.png?v=20260715c';
  const HERO_GATE_URL = 'assets/img/hero-gate.png?v=20260715c';
  window.DOI_LOGO_URL = LOGO_URL;

  /* ---------- AUTH / GATE ---------- */
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
        <div class="doi-gate-foot">// SESSION-DOI · SERVER-BACKED · SPARKEDHOST · TLS RECOMMENDED</div>
      </div>`;
    $$('.doi-tabs button', gate).forEach(b => b.addEventListener('click', () => renderGate(b.dataset.mode)));
    $('#doiGateForm', gate).addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const user = String(fd.get('user') || '').trim();
      const pass = String(fd.get('pass') || '');
      if (!/^[A-Za-z0-9_]{3,16}$/.test(user)) return renderGate(mode, 'Callsign must be 3–16 chars, letters/numbers/_ only.');
      if (pass.length < 4) return renderGate(mode, 'Cipher too short.');
      try {
        const btn = $('.doi-gate-submit', gate);
        btn.disabled = true; btn.textContent = '… authenticating';
        const r = mode === 'login' ? await api.login(user, pass) : await api.register(user, pass);
        cache.token = r.token;
        localStorage.setItem(TOKEN_KEY, cache.token);
        const me = await api.me();
        cache.profile = me.profile;
        gate.hidden = true;
        startHeartbeat();
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
    stopHeartbeat();
    state.view = 'welcome'; state.channel = null; state.thread = null;
    renderGate('login');
  }

  function isAuthed() { return !!cache.token && !!cache.profile; }

  /* ---------- HEARTBEAT ---------- */
  let hbTimer = null;
  function startHeartbeat() {
    stopHeartbeat();
    if (!cache.token) return;
    hbTimer = setInterval(() => { api.heartbeat().catch(() => {}); }, 30_000);
    api.heartbeat().catch(() => {});
  }
  function stopHeartbeat() { if (hbTimer) { clearInterval(hbTimer); hbTimer = null; } }

  /* ---------- STATE ---------- */
  const state = window.__doiHomeState = window.__doiHomeState || { view: 'welcome', channel: null, thread: null };

  const CHANNELS = [
    { id:'general',   name:'general',   topic:'DOI general chat — everyone welcome.' },
    { id:'ops',       name:'ops',       topic:'Operations coordination.' },
    { id:'blackline', name:'blackline', topic:'BLACKLINE · restricted.' }
  ];

  /* ---------- HELPERS ---------- */
  function timeAgo(ts) {
    const d = Date.now() - ts;
    if (d < 60_000) return 'just now';
    if (d < 3_600_000) return Math.floor(d/60_000) + 'm ago';
    if (d < 86_400_000) return Math.floor(d/3_600_000) + 'h ago';
    const day = Math.floor(d / 86_400_000);
    if (day < 7) return day + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  function avatarHTML(name, dataUrl, size) {
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    const style = size ? `style="width:${size}px;height:${size}px"` : '';
    if (name === 'DOI') return `<div class="doi-avatar" ${style}><img src="${LOGO_URL}" alt="DOI"/></div>`;
    if (dataUrl) return `<div class="doi-avatar" ${style}><img src="${esc(dataUrl)}" alt=""/></div>`;
    return `<div class="doi-avatar" ${style}>${esc(initial)}</div>`;
  }

  /* ---------- SHELL ---------- */
  function shell(centerHTML, headHTML) {
    const p = cache.profile || { name:'…', tag:'#0000', bio:'' };
    const forums = cache.forums || [];
    const online = cache.members.online || [];
    const offline = cache.members.offline || [];

    return `
      <div class="doi-shell">
        <div class="doi-rail">
          <div class="doi-rail-item active" title="DOI · Home" data-shell-nav="welcome">
            <img src="${LOGO_URL}" alt="DOI" class="doi-rail-logo"/>
          </div>
          <div class="doi-rail-sep"></div>
          <a class="doi-rail-item" title="Admin Console" href="#/admin" data-link>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z"/></svg>
          </a>
          <a class="doi-rail-item" title="AI Cores" href="#/ai" data-link>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>
          </a>
          <a class="doi-rail-item" title="CPU Builder" href="#/cpu-builder" data-link>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>
          </a>
          <div class="doi-rail-sep"></div>
          <div class="doi-rail-item doi-signout" title="Sign out" data-shell-signout>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
          </div>
        </div>

        <div class="doi-channels">
          <div class="doi-guildhead">
            <span class="doi-dot"></span>
            <span>DOI · Site-CI</span>
          </div>
          <div class="doi-chan-scroll">
            <div class="doi-catlabel"><span class="doi-chev">▾</span> Text Channels</div>
            ${CHANNELS.map(ch => `
              <div class="doi-ch ${state.view==='channel' && state.channel===ch.id ? 'active':''}" data-shell-nav="channel" data-ch="${ch.id}">
                <span class="doi-hash">#</span>
                <span class="doi-ch-name">${esc(ch.name)}</span>
              </div>`).join('')}

            <div class="doi-catlabel">
              <span class="doi-chev">▾</span> Forums
              <button class="doi-catadd" data-shell-newthread title="New thread">+</button>
            </div>
            <div class="doi-ch ${state.view==='forums' ? 'active':''}" data-shell-nav="forums">
              <span class="doi-hash">▤</span>
              <span class="doi-ch-name">forum-index</span>
              <span class="doi-ch-count">${forums.length}</span>
            </div>
            ${forums.slice(0, 12).map(t => `
              <div class="doi-ch thread ${state.view==='thread' && state.thread===t.id ? 'active':''}" data-shell-nav="thread" data-thread="${t.id}">
                <span class="doi-hash">›</span>
                <span class="doi-ch-name">${esc(t.title)}</span>
                <span class="doi-ch-count">${t.count != null ? t.count : (t.messages ? t.messages.length : 0)}</span>
              </div>`).join('')}
          </div>

          <div class="doi-userpanel">
            ${avatarHTML(p.name, p.avatar, 36)}
            <div class="doi-uinfo">
              <div class="doi-uname">${esc(p.name)}</div>
              <div class="doi-utag">${esc(p.tag)} · ${esc(p.bio || 'Insurgent')}</div>
            </div>
            <button class="doi-uedit" data-shell-editprofile title="Customize profile">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
            </button>
          </div>
        </div>

        <div class="doi-main">
          <div class="doi-main-head">${headHTML}</div>
          ${centerHTML}
        </div>

        <div class="doi-members">
          <div class="doi-mem-scroll">
            <div class="doi-mem-cat">Online · <b>${online.length}</b></div>
            ${online.length ? online.map(memberRow).join('') : '<div class="doi-empty" style="padding:14px 6px;font-size:11px">no one online</div>'}
            <div class="doi-mem-cat">Offline · ${offline.length}</div>
            ${offline.map(memberRow).join('')}
          </div>
        </div>
      </div>

      <div class="doi-modal" id="doiNewThreadModal" hidden>
        <div class="doi-modal-inner">
          <h3>▸ Open a new thread</h3>
          <div class="doi-field">
            <label>Title</label>
            <input id="doiNTTitle" type="text" maxlength="120" placeholder="What's the intel?"/>
          </div>
          <div class="doi-field">
            <label>First message (optional)</label>
            <textarea id="doiNTBody" maxlength="4000" placeholder="Details, coordinates, source…"></textarea>
          </div>
          <div class="doi-modal-actions">
            <button class="doi-btn-cancel" data-close-modal>Cancel</button>
            <button class="doi-btn-primary" data-submit-thread>▸ Create Thread</button>
          </div>
        </div>
      </div>

      <div class="doi-modal" id="doiProfileModal" hidden>
        <div class="doi-modal-inner">
          <h3>▸ Customize Profile</h3>
          <div class="doi-field">
            <label>Callsign</label>
            <input type="text" value="${esc(p.name)}" disabled title="Username is fixed at registration"/>
            <div class="doi-hint">Callsign is locked to the account.</div>
          </div>
          <div class="doi-field">
            <label>Bio</label>
            <input id="doiPfBio" type="text" maxlength="120" value="${esc(p.bio || '')}"/>
          </div>
          <div class="doi-field">
            <label>Avatar (image file, small!)</label>
            <input id="doiPfAvatar" type="file" accept="image/*"/>
            <div class="doi-hint">Stored on the server as base64. ~150KB max.</div>
          </div>
          <div class="doi-modal-actions">
            <button class="doi-btn-cancel" data-close-modal>Cancel</button>
            <button class="doi-btn-primary" data-submit-profile>▸ Save</button>
          </div>
        </div>
      </div>
    `;
  }

  function memberRow(m) {
    return `<div class="doi-member ${m.online?'':'offline'}">
      ${avatarHTML(m.name, m.avatar, 32)}
      <span class="doi-mem-name ${m.officer?'doi-officer':''}">${esc(m.name)}</span>
      <span class="doi-mem-status">${esc(m.status || '')}</span>
    </div>`;
  }

  /* ---------- CENTER VIEWS ---------- */
  function viewWelcome() {
    const forums = cache.forums || [];
    const online = cache.members.online || [];
    const total = online.length + (cache.members.offline || []).length;
    const head = `<span class="doi-hash">▸</span><h2>Home</h2>
      <span class="doi-topic">Chat Home · DOI Terminal</span>`;
    const body = `
      <div class="doi-main-body">
        <div class="doi-hero">
          <div class="doi-hero-img" style="background-image:url('${HERO_TEAM_URL}')"></div>
          <div class="doi-hero-vign"></div>
          <div class="doi-hero-inner">
            <img class="doi-hero-mark" src="${LOGO_URL}" alt="DOI"/>
            <div class="doi-hero-txt">
              <h1>Department of Insurgency</h1>
              <p>Site-CI Terminal · Operational</p>
              <p class="doi-motto">Dismantling Greed · Since 2026</p>
            </div>
          </div>
          <div class="doi-hero-stats">
            <div>Operatives<b>${online.length}/${total}</b></div>
            <div>Threads<b>${forums.length}</b></div>
            <div>Channels<b>${CHANNELS.length}</b></div>
            <div>Status<b>▲ GREEN</b></div>
          </div>
        </div>

        <div class="doi-sec-title">Go to page</div>
        <div class="doi-quicklinks">
          <div class="doi-quick" data-shell-nav="channel" data-ch="general" style="cursor:pointer">
            <span class="doi-quick-ico">#</span>
            <h4>General Chat</h4>
            <p>Open channel · everyone welcome</p>
          </div>
          <div class="doi-quick" data-shell-nav="forums" style="cursor:pointer">
            <span class="doi-quick-ico">▤</span>
            <h4>Forums</h4>
            <p>${forums.length} threads · anyone can post</p>
          </div>
          <a class="doi-quick" href="#/ai" data-link>
            <span class="doi-quick-ico">◉</span>
            <h4>AI Cores</h4>
            <p>The neural-net program</p>
          </a>
          <a class="doi-quick" href="#/cpu-builder" data-link>
            <span class="doi-quick-ico">▣</span>
            <h4>CPU Builder</h4>
            <p>Silicon build tools</p>
          </a>
          <a class="doi-quick" href="#/admin" data-link>
            <span class="doi-quick-ico">⚑</span>
            <h4>Admin Console</h4>
            <p>Bridge, scripts, world, drive</p>
          </a>
        </div>

        <div class="doi-sec-title">Recent Threads</div>
        <div class="doi-threads">
          ${forums.slice(0, 5).map(threadRow).join('') || '<div class="doi-empty">no threads yet — be the first</div>'}
        </div>
      </div>`;
    return { head, body };
  }

  function viewChannel(chId) {
    const ch = CHANNELS.find(c => c.id === chId);
    if (!ch) return viewWelcome();
    const msgs = cache.chat[chId] || [];
    const head = `<span class="doi-hash">#</span><h2>${esc(ch.name)}</h2>
      <span class="doi-topic">${esc(ch.topic)}</span>`;
    const body = `
      <div class="doi-main-body" id="doi-msgs">
        ${msgs.length ? msgs.map(msgHTML).join('') : '<div class="doi-empty">no messages · be the first</div>'}
      </div>
      ${composerHTML('channel', chId, ch.name)}`;
    return { head, body };
  }

  function viewForums() {
    const forums = cache.forums || [];
    const head = `<span class="doi-hash">▤</span><h2>forum-index</h2>
      <span class="doi-topic">${forums.length} threads · start one any time</span>`;
    const body = `
      <div class="doi-main-body">
        <div class="doi-forum-head">
          <input class="doi-forum-search" id="doi-forum-search" placeholder="Search threads…"/>
          <button class="doi-newthread" data-shell-newthread>▸ NEW THREAD</button>
        </div>
        <div class="doi-threads" id="doi-thread-list">
          ${forums.length ? forums.map(threadRow).join('') : '<div class="doi-empty">no threads yet</div>'}
        </div>
      </div>`;
    return { head, body };
  }

  function viewThread(tid) {
    const t = cache.threads[tid];
    if (!t) {
      const head = `<span class="doi-hash">›</span><h2>Loading thread…</h2>
        <span class="doi-topic">fetching from server</span>`;
      return { head, body: `<div class="doi-main-body"><div class="doi-empty">loading…</div></div>` };
    }
    const head = `<span class="doi-hash">›</span><h2>${esc(t.title)}</h2>
      <span class="doi-topic">by <b>${esc(t.author)}</b> · ${timeAgo(t.ts)} · ${t.messages.length} posts</span>`;
    const body = `
      <div class="doi-main-body" id="doi-msgs">
        ${t.messages.length ? t.messages.map(msgHTML).join('') : '<div class="doi-empty">empty thread</div>'}
      </div>
      ${composerHTML('thread', tid, 'thread')}`;
    return { head, body };
  }

  function threadRow(t) {
    return `<div class="doi-thread" data-shell-nav="thread" data-thread="${t.id}">
      <div class="doi-thread-info">
        <div class="doi-thread-title">${esc(t.title)}</div>
        <div class="doi-thread-meta">by <b>${esc(t.author)}</b> · ${timeAgo(t.ts)}</div>
      </div>
      <span class="doi-thread-count">${t.count != null ? t.count : (t.messages ? t.messages.length : 0)} ◆</span>
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

  function composerHTML(kind, id, label) {
    return `<div class="doi-composer">
      <form data-composer data-kind="${kind}" data-id="${esc(id)}">
        <input type="text" placeholder="Message ${esc(label || '')}" maxlength="2000" autocomplete="off"/>
        <button type="submit">Send ▸</button>
      </form>
    </div>`;
  }

  /* ---------- POLLING (live updates) ---------- */
  let pollTimer = null;
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function startPoll() {
    stopPoll();
    // members refreshed on a slower cadence
    let tick = 0;
    pollTimer = setInterval(async () => {
      tick++;
      try {
        if (state.view === 'channel' && state.channel) {
          const ch = state.channel;
          const since = cache.chatSince[ch] || 0;
          const r = await api.chat(ch, since);
          if (r.messages && r.messages.length) {
            const prev = cache.chat[ch] || [];
            // if since was 0 replace, else append
            cache.chat[ch] = since ? [...prev, ...r.messages] : r.messages;
            const last = cache.chat[ch][cache.chat[ch].length - 1];
            cache.chatSince[ch] = last.ts;
            rerenderCenterSoft();
          } else if (!cache.chat[ch]) {
            cache.chat[ch] = r.messages || [];
          }
        } else if (state.view === 'thread' && state.thread) {
          const r = await api.thread(state.thread);
          if (r.thread) {
            const prev = cache.threads[state.thread];
            const changed = !prev || prev.messages.length !== r.thread.messages.length;
            cache.threads[state.thread] = r.thread;
            if (changed) rerenderCenterSoft();
          }
        }
        if (tick % 5 === 0) { // every ~15s, refresh members
          const m = await api.members();
          cache.members = { online: m.online || [], offline: m.offline || [] };
          // don't full re-render on member updates alone (avoid input focus loss)
          rerenderMembersOnly();
        }
      } catch (_) { /* ignore poll errors */ }
    }, 3_000);
  }

  function rerenderCenterSoft() {
    // Preserve composer input value + focus across re-render of just the main pane
    const container = document.getElementById('content');
    if (!container) return;
    const activeVal = document.activeElement && document.activeElement.matches('.doi-composer input')
      ? document.activeElement.value : null;
    let view;
    if (state.view === 'channel') view = viewChannel(state.channel);
    else if (state.view === 'thread') view = viewThread(state.thread);
    else if (state.view === 'forums') view = viewForums();
    else view = viewWelcome();
    const mainHead = container.querySelector('.doi-main-head');
    const main = container.querySelector('.doi-main');
    if (main && mainHead) {
      mainHead.innerHTML = view.head;
      // replace everything after head inside main
      $$('.doi-main-body, .doi-composer', main).forEach(n => n.remove());
      main.insertAdjacentHTML('beforeend', view.body);
      wireComposers(container);
      const msgs = container.querySelector('#doi-msgs');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
      if (activeVal != null) {
        const input = container.querySelector('.doi-composer input');
        if (input) { input.focus(); input.value = activeVal; }
      }
    }
  }
  function rerenderMembersOnly() {
    const container = document.getElementById('content');
    if (!container) return;
    const membersBox = container.querySelector('.doi-members .doi-mem-scroll');
    if (!membersBox) return;
    const online = cache.members.online || [];
    const offline = cache.members.offline || [];
    membersBox.innerHTML = `
      <div class="doi-mem-cat">Online · <b>${online.length}</b></div>
      ${online.length ? online.map(memberRow).join('') : '<div class="doi-empty" style="padding:14px 6px;font-size:11px">no one online</div>'}
      <div class="doi-mem-cat">Offline · ${offline.length}</div>
      ${offline.map(memberRow).join('')}`;
  }

  function rerenderAll() {
    if (typeof window.__doiRender === 'function') window.__doiRender();
  }

  /* ---------- WIRE ---------- */
  function wireComposers(container) {
    $$('[data-composer]', container).forEach(f => {
      if (f.dataset.wired) return;
      f.dataset.wired = '1';
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const input = f.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        const kind = f.dataset.kind, id = f.dataset.id;
        input.disabled = true;
        try {
          if (kind === 'channel') {
            const r = await api.sendChat(id, text);
            const list = cache.chat[id] || (cache.chat[id] = []);
            list.push(r.message);
            cache.chatSince[id] = r.message.ts;
          } else if (kind === 'thread') {
            const r = await api.postThread(id, text);
            const t = cache.threads[id];
            if (t) t.messages.push(r.message);
          }
          input.value = '';
          rerenderCenterSoft();
        } catch (e2) {
          alert('Send failed: ' + e2.message);
        } finally {
          input.disabled = false; input.focus();
        }
      });
    });
  }

  function wire(container) {
    // navigation
    $$('[data-shell-nav]', container).forEach(el => el.addEventListener('click', async e => {
      const t = el.dataset.shellNav;
      if (t === 'welcome') { state.view = 'welcome'; }
      else if (t === 'channel') { state.view = 'channel'; state.channel = el.dataset.ch; }
      else if (t === 'forums')  { state.view = 'forums'; }
      else if (t === 'thread')  { state.view = 'thread'; state.thread = el.dataset.thread; }
      // eagerly fetch data for the target view before rerender
      await preloadForView();
      rerenderAll();
      startPoll();
    }));

    // sign out
    const so = container.querySelector('[data-shell-signout]');
    if (so) so.addEventListener('click', signOut);

    // new-thread modal open
    $$('[data-shell-newthread]', container).forEach(el => el.addEventListener('click', () => {
      const m = container.querySelector('#doiNewThreadModal');
      if (m) { m.hidden = false; setTimeout(() => container.querySelector('#doiNTTitle')?.focus(), 30); }
    }));

    // profile modal open
    $$('[data-shell-editprofile]', container).forEach(el => el.addEventListener('click', () => {
      const m = container.querySelector('#doiProfileModal');
      if (m) m.hidden = false;
    }));

    // close modals
    $$('[data-close-modal]', container).forEach(b => b.addEventListener('click', () => b.closest('.doi-modal').hidden = true));
    $$('.doi-modal', container).forEach(m => m.addEventListener('click', e => { if (e.target === m) m.hidden = true; }));

    // submit new thread
    const submitT = container.querySelector('[data-submit-thread]');
    if (submitT) submitT.addEventListener('click', async () => {
      const title = container.querySelector('#doiNTTitle').value.trim();
      const body  = container.querySelector('#doiNTBody').value.trim();
      if (!title) return;
      submitT.disabled = true; submitT.textContent = '… posting';
      try {
        const r = await api.newThread(title, body);
        // refresh forum list
        const list = await api.forums();
        cache.forums = list.threads || [];
        cache.threads[r.thread.id] = r.thread;
        state.view = 'thread'; state.thread = r.thread.id;
        rerenderAll();
      } catch (e2) {
        alert('Failed: ' + e2.message);
      } finally {
        submitT.disabled = false; submitT.textContent = '▸ Create Thread';
      }
    });

    // submit profile
    const submitP = container.querySelector('[data-submit-profile]');
    if (submitP) submitP.addEventListener('click', async () => {
      const bio = container.querySelector('#doiPfBio').value.trim();
      const file = container.querySelector('#doiPfAvatar').files[0];
      const finish = async (avatar) => {
        submitP.disabled = true; submitP.textContent = '… saving';
        try {
          const r = await api.saveProfile({ bio, avatar });
          cache.profile = r.profile;
          const modal = container.querySelector('#doiProfileModal');
          if (modal) modal.hidden = true;
          rerenderAll();
        } catch (e2) {
          alert('Save failed: ' + e2.message);
        } finally {
          submitP.disabled = false; submitP.textContent = '▸ Save';
        }
      };
      if (file) {
        if (file.size > 200_000) return alert('Avatar too big — keep it under 200KB.');
        const rd = new FileReader();
        rd.onload = () => finish(String(rd.result));
        rd.readAsDataURL(file);
      } else finish(undefined);
    });

    wireComposers(container);

    // scroll chat to bottom, focus composer
    const msgs = container.querySelector('#doi-msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    const inp = container.querySelector('.doi-composer input');
    if (inp) inp.focus();

    // forum search
    const search = container.querySelector('#doi-forum-search');
    const list = container.querySelector('#doi-thread-list');
    if (search && list) {
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        const filtered = (cache.forums || []).filter(t =>
          !q || t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q));
        list.innerHTML = filtered.length ? filtered.map(threadRow).join('') : '<div class="doi-empty">no threads match</div>';
        $$('[data-shell-nav="thread"]', list).forEach(el => el.addEventListener('click', async () => {
          state.view = 'thread'; state.thread = el.dataset.thread;
          await preloadForView(); rerenderAll(); startPoll();
        }));
      });
    }
  }

  /* ---------- PRELOAD PER VIEW ---------- */
  async function preloadForView() {
    try {
      // forums list is used by the sidebar every view
      if (!cache.forums || Date.now() - cache.fetchedForums > 30_000) {
        const r = await api.forums();
        cache.forums = r.threads || [];
        cache.fetchedForums = Date.now();
      }
      if (!cache.members || Date.now() - cache.fetchedMembers > 20_000) {
        const m = await api.members();
        cache.members = { online: m.online || [], offline: m.offline || [] };
        cache.fetchedMembers = Date.now();
      }
      if (state.view === 'channel' && state.channel) {
        const ch = state.channel;
        if (!cache.chat[ch]) {
          const r = await api.chat(ch);
          cache.chat[ch] = r.messages || [];
          if (cache.chat[ch].length) cache.chatSince[ch] = cache.chat[ch][cache.chat[ch].length - 1].ts;
        }
      } else if (state.view === 'thread' && state.thread) {
        if (!cache.threads[state.thread]) {
          const r = await api.thread(state.thread);
          if (r.thread) cache.threads[state.thread] = r.thread;
        }
      }
    } catch (e) { /* soft fail */ }
  }

  /* ---------- PUBLIC RENDERERS ---------- */
  window.DOI = {
    renderGate,
    ensureGate: () => { if (!isAuthed()) renderGate('login'); else $('#doiGate').hidden = true; },
    signOut,
    isAuthed,
    LOGO_URL,
    renderHome() {
      if (!isAuthed()) return '';
      let view;
      if (state.view === 'channel') view = viewChannel(state.channel);
      else if (state.view === 'forums') view = viewForums();
      else if (state.view === 'thread') view = viewThread(state.thread);
      else view = viewWelcome();
      return shell(view.body, view.head);
    },
    wireHome(container) {
      if (!container) return;
      wire(container);
      startPoll();
      // if we haven't loaded initial data yet, do it now and re-render
      preloadForView().then(() => { rerenderAll(); });
    },
    renderAdminHub() {
      return `
        <div class="doi-admin-warn">
          <b>▸ ADMIN CONSOLE</b> — Restricted tooling. Bridge, script vault, world builder, and vehicle grid moved here.
        </div>
        <div class="doi-admin-grid">
          <a class="doi-admin-card" href="#/battlefeuer" data-link>
            <span class="doi-adm-ico">🛰</span>
            <h4>Battlefeuer Bridge</h4>
            <p>The bridge script, wonder-scripts, decoder, live console.</p>
          </a>
          <a class="doi-admin-card" href="#/scripts" data-link>
            <span class="doi-adm-ico">📂</span>
            <h4>Script Library</h4>
            <p>Every script + avatar vault.</p>
          </a>
          <a class="doi-admin-card" href="#/world-builder" data-link>
            <span class="doi-adm-ico">🌐</span>
            <h4>World Builder</h4>
            <p>Real-world terrain + Roblox world server.</p>
          </a>
          <a class="doi-admin-card" href="#/map-drive" data-link>
            <span class="doi-adm-ico">🚗</span>
            <h4>Map Drive</h4>
            <p>Satellite driving grid.</p>
          </a>
        </div>`;
    },
  };

  /* ---------- BOOT ---------- */
  // On page load, if we have a token, verify it against /api/doi/me and pull profile.
  // If it fails, clear token and show gate.
  async function boot() {
    if (!cache.token) { renderGate('login'); return; }
    try {
      const r = await api.me();
      cache.profile = r.profile;
      startHeartbeat();
      // trigger the app render once so home actually shows the shell
      if (typeof window.__doiRender === 'function') window.__doiRender();
      window.dispatchEvent(new CustomEvent('doi:auth'));
    } catch (_) {
      cache.token = null;
      localStorage.removeItem(TOKEN_KEY);
      renderGate('login');
    }
  }
  // defer to ensure #doiGate is in the DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Sign-out on manual token removal from other tabs
  window.addEventListener('storage', e => {
    if (e.key === TOKEN_KEY) {
      cache.token = localStorage.getItem(TOKEN_KEY);
      if (!cache.token) { cache.profile = null; stopHeartbeat(); rerenderAll(); renderGate('login'); }
    }
  });
})();
