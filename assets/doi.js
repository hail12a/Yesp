/* =========================================================
   doi.js — Department of Insurgency
   Auth gate, profile store, forums, chat, Discord-style shell
   ========================================================= */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /* ---------- STORE (localStorage) ---------- */
  const PROFILE_KEY = 'doi.profile';
  const FORUM_KEY   = 'doi.forums';
  const CHAT_KEY    = 'doi.chat';
  const AUTH_KEY    = 'doi.auth';

  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  const DOI_BADGE_SVG = `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="98" fill="#0a0a0a" stroke="#c8102e" stroke-width="4"/>
      <circle cx="100" cy="100" r="86" fill="none" stroke="#c8102e" stroke-width="2"/>
      <path id="doi-top" d="M 22,100 A 78,78 0 0 1 178,100" fill="none"/>
      <path id="doi-bot" d="M 22,100 A 78,78 0 0 0 178,100" fill="none"/>
      <text fill="#fff" font-family="monospace" font-weight="800" font-size="12" letter-spacing="2">
        <textPath href="#doi-top" startOffset="50%" text-anchor="middle">DEPARTMENT · OF · INSURGENCY</textPath>
      </text>
      <text fill="#fff" font-family="monospace" font-weight="800" font-size="10" letter-spacing="2">
        <textPath href="#doi-bot" startOffset="50%" text-anchor="middle">DISMANTLING · GREED</textPath>
      </text>
      <circle cx="100" cy="100" r="46" fill="#111" stroke="#2a2a2a" stroke-width="1"/>
      <g stroke="#666" stroke-width="1">
        <line x1="100" y1="56" x2="100" y2="62"/>
        <line x1="100" y1="138" x2="100" y2="144"/>
        <line x1="56" y1="100" x2="62" y2="100"/>
        <line x1="138" y1="100" x2="144" y2="100"/>
        <line x1="69" y1="69" x2="73" y2="73"/>
        <line x1="127" y1="127" x2="131" y2="131"/>
        <line x1="131" y1="69" x2="127" y2="73"/>
        <line x1="73" y1="127" x2="69" y2="131"/>
      </g>
      <g stroke="#0a0a0a" stroke-width="1.5" fill="#3a3a3a">
        <circle cx="100" cy="100" r="30"/>
        <path d="M100 70 L106 82 L100 80 L94 82 Z M100 130 L94 118 L100 120 L106 118 Z M70 100 L82 94 L80 100 L82 106 Z M130 100 L118 106 L120 100 L118 94 Z" fill="#1a1a1a"/>
      </g>
      <circle cx="100" cy="100" r="8" fill="#c8102e"/>
      <g stroke="#c8102e" stroke-width="1.5" fill="none" opacity=".9">
        <path d="M 100 100 L 82 82"/><path d="M 100 100 L 118 82"/>
        <path d="M 100 100 L 82 118"/><path d="M 100 100 L 118 118"/>
      </g>
    </svg>`;

  window.DOI_BADGE_SVG = DOI_BADGE_SVG;

  const DEFAULT_MEMBERS = [
    { id:'m-doi', name:'DOI', officer: true, status:'operator', online:true },
    { id:'m-cmdr', name:'Cmdr. Ash', officer: true, status:'briefing', online:true },
    { id:'m-nine', name:'Ninetails', status:'field', online:true },
    { id:'m-halo', name:'Halo-6', status:'listening', online:true },
    { id:'m-vector', name:'Vector', status:'idle', online:true },
    { id:'m-recon', name:'Recon-04', status:'offline', online:false },
    { id:'m-echo', name:'Echo', status:'offline', online:false }
  ];

  const DEFAULT_FORUMS = () => ([
    { id:'t-welcome', title:'Field Manual · Welcome, Insurgent', author:'DOI', ts: 1704067200000,
      messages:[{ id:'m1', author:'DOI', ts: 1704067200000,
        text:'Welcome to the Department of Insurgency network. This is a secure forum. Introduce yourself, and remember — dismantling greed is the mission.' }] },
    { id:'t-ops',     title:'Ops Briefing · Report a target', author:'DOI', ts: 1704067200000,
      messages:[{ id:'m1', author:'DOI', ts: 1704067200000,
        text:'Post confirmed targets, sightings, and intel here. Include location, source, and confidence.' }] }
  ]);

  const DEFAULT_CHAT = () => ({
    'general':   [{ id:'c1', author:'DOI', ts: 1704067200000, text:'DOI network online. Speak freely.' }],
    'ops':       [{ id:'c1', author:'DOI', ts: 1704067200000, text:'Ops channel is open. Keep it professional.' }],
    'blackline': [{ id:'c1', author:'DOI', ts: 1704067200000, text:'BLACKLINE — restricted channel. Anti-greed operations only.' }]
  });

  const store = {
    getProfile() { return load(PROFILE_KEY, null); },
    setProfile(p) { save(PROFILE_KEY, p); },

    getForums() {
      let f = load(FORUM_KEY, null);
      if (!f) { f = DEFAULT_FORUMS(); save(FORUM_KEY, f); }
      return f;
    },
    saveForums(f) { save(FORUM_KEY, f); },
    addThread(title, body) {
      const p = store.getProfile();
      const f = store.getForums();
      const t = {
        id: 't-' + Date.now().toString(36),
        title: title.trim(),
        author: p ? p.name : 'anon',
        ts: Date.now(),
        messages: body ? [{ id:'m1', author: p ? p.name : 'anon', ts: Date.now(), text: body.trim() }] : []
      };
      f.unshift(t);
      store.saveForums(f);
      return t;
    },
    getThread(id) { return store.getForums().find(t => t.id === id); },
    addThreadMsg(id, text) {
      const p = store.getProfile();
      const f = store.getForums();
      const t = f.find(x => x.id === id);
      if (!t) return null;
      const m = { id: 'm-' + Date.now().toString(36), author: p ? p.name : 'anon', ts: Date.now(), text: text.trim() };
      t.messages.push(m);
      store.saveForums(f);
      return m;
    },

    getChat() {
      let c = load(CHAT_KEY, null);
      if (!c) { c = DEFAULT_CHAT(); save(CHAT_KEY, c); }
      return c;
    },
    addChatMsg(channel, text) {
      const p = store.getProfile();
      const c = store.getChat();
      if (!c[channel]) c[channel] = [];
      const m = { id: 'c-' + Date.now().toString(36), author: p ? p.name : 'anon', ts: Date.now(), text: text.trim() };
      c[channel].push(m);
      save(CHAT_KEY, c);
      return m;
    },

    isAuthed() { return !!load(AUTH_KEY, false) && !!store.getProfile(); },
    authIn(name) {
      const existing = store.getProfile();
      const p = existing && existing.name === name ? existing : {
        name, tag: '#' + String(Math.floor(1000 + Math.random() * 9000)),
        bio: 'Insurgent',
        avatar: null, // dataURL if uploaded
        joined: Date.now()
      };
      store.setProfile(p);
      save(AUTH_KEY, true);
      return p;
    },
    signOut() { save(AUTH_KEY, false); }
  };

  window.DOI = { store, DEFAULT_MEMBERS };

  /* ---------- LOGIN GATE ---------- */
  function renderGate(mode = 'login', err = '') {
    const gate = $('#doiGate');
    gate.hidden = false;
    gate.innerHTML = `
      <div class="doi-gate-inner">
        <div class="doi-gate-badge">${DOI_BADGE_SVG}</div>
        <h1>Department of Insurgency</h1>
        <p class="doi-motto">Dismantling Greed</p>
        <p class="doi-classified"><b>◆ CLASSIFIED</b> · Site-DOI Terminal · Authorization Required</p>
        <div class="doi-tabs" role="tablist">
          <button data-mode="login" class="${mode==='login'?'active':''}">Sign In</button>
          <button data-mode="register" class="${mode==='register'?'active':''}">Register</button>
        </div>
        <form id="doiGateForm" autocomplete="off">
          <div class="doi-field">
            <label>Callsign</label>
            <input name="name" required minlength="2" maxlength="24" placeholder="e.g. Vector-7" />
            <div class="doi-hint">Alphanumeric, up to 24 chars.</div>
          </div>
          <div class="doi-field">
            <label>Cipher</label>
            <input name="pw" type="password" required minlength="3" placeholder="Any local cipher" />
            <div class="doi-hint">Local-only. Never sent anywhere.</div>
          </div>
          ${err ? `<div class="doi-gate-err">${esc(err)}</div>` : ''}
          <button class="doi-gate-submit" type="submit">
            ${mode==='login' ? '▸ ACCESS TERMINAL' : '▸ REGISTER OPERATIVE'}
          </button>
        </form>
        <div class="doi-gate-foot">// SESSION-DOI · LOCAL PROFILE · NO NETWORK TRANSIT</div>
      </div>`;
    $$('.doi-tabs button', gate).forEach(b => b.addEventListener('click', () => renderGate(b.dataset.mode)));
    $('#doiGateForm', gate).addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = String(fd.get('name') || '').trim();
      const pw = String(fd.get('pw') || '');
      if (!name || name.length < 2) return renderGate(mode, 'Callsign too short.');
      if (!pw || pw.length < 3)     return renderGate(mode, 'Cipher too short.');
      if (!/^[A-Za-z0-9_\- .]+$/.test(name)) return renderGate(mode, 'Callsign has invalid characters.');
      store.authIn(name);
      gate.hidden = true;
      // trigger re-render of current page
      if (typeof window.__doiRender === 'function') window.__doiRender();
      window.dispatchEvent(new CustomEvent('doi:auth'));
    });
  }

  function ensureGate() {
    if (!store.isAuthed()) renderGate('login');
    else $('#doiGate').hidden = true;
  }

  window.DOI.renderGate = renderGate;
  window.DOI.ensureGate = ensureGate;

  /* ---------- AVATAR HTML ---------- */
  function avatarHTML(name, dataUrl, size) {
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    const style = size ? `style="width:${size}px;height:${size}px"` : '';
    if (name === 'DOI') return `<div class="doi-avatar" ${style}>${DOI_BADGE_SVG}</div>`;
    if (dataUrl) return `<div class="doi-avatar" ${style}><img src="${esc(dataUrl)}" alt=""/></div>`;
    return `<div class="doi-avatar" ${style}>${esc(initial)}</div>`;
  }
  window.DOI.avatarHTML = avatarHTML;

  function timeAgo(ts) {
    const d = Date.now() - ts;
    if (d < 60_000) return 'just now';
    if (d < 3_600_000) return Math.floor(d/60_000) + 'm ago';
    if (d < 86_400_000) return Math.floor(d/3_600_000) + 'h ago';
    const day = Math.floor(d / 86_400_000);
    if (day < 7) return day + 'd ago';
    return new Date(ts).toLocaleDateString();
  }
  window.DOI.timeAgo = timeAgo;

  /* ---------- HOME SHELL RENDERER ---------- */
  // state kept in window so re-renders can persist across nav within /overview
  const state = window.__doiHomeState = window.__doiHomeState || { view: 'welcome', channel: null, thread: null };

  const CHANNELS = {
    text: [
      { id:'general',   name:'general',   topic:'DOI general chat — everyone welcome.' },
      { id:'ops',       name:'ops',       topic:'Operations coordination.' },
      { id:'blackline', name:'blackline', topic:'BLACKLINE · restricted.' }
    ],
    forums: [
      { id:'forums', name:'forums', topic:'Threaded discussions. Any operative can start one.' }
    ]
  };

  function shell(centerHTML, headHTML) {
    const p = store.getProfile() || { name:'anon', tag:'#0000' };
    const members = DEFAULT_MEMBERS;
    const online = members.filter(m => m.online);
    const offline = members.filter(m => !m.online);
    const forums = store.getForums();

    return `
      <div class="doi-shell">
        <div class="doi-rail">
          <div class="doi-rail-item active" title="DOI · Home" data-shell-nav="welcome">${DOI_BADGE_SVG}</div>
          <div class="doi-rail-sep"></div>
          <a class="doi-rail-item" title="Admin Console" href="#/admin" data-link style="text-decoration:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z"/></svg>
          </a>
          <a class="doi-rail-item" title="AI Cores" href="#/ai" data-link style="text-decoration:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>
          </a>
          <a class="doi-rail-item" title="CPU Builder" href="#/cpu-builder" data-link style="text-decoration:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>
          </a>
          <div class="doi-rail-sep"></div>
          <div class="doi-rail-item" title="Sign out" data-shell-signout>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
          </div>
        </div>

        <div class="doi-channels">
          <div class="doi-guildhead">
            <span class="doi-dot"></span>
            <span>DOI · Site-CI</span>
          </div>
          <div class="doi-chan-scroll">
            <div class="doi-catlabel">
              <span class="doi-chev">▾</span> Text Channels
            </div>
            ${CHANNELS.text.map(ch => `
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
            ${forums.slice(0, 8).map(t => `
              <div class="doi-ch thread ${state.view==='thread' && state.thread===t.id ? 'active':''}" data-shell-nav="thread" data-thread="${t.id}">
                <span class="doi-hash">›</span>
                <span class="doi-ch-name">${esc(t.title)}</span>
                <span class="doi-ch-count">${t.messages.length}</span>
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
            ${online.map(m => memberRow(m)).join('')}
            <div class="doi-mem-cat">Offline · ${offline.length}</div>
            ${offline.map(m => memberRow(m)).join('')}
          </div>
        </div>
      </div>

      <div class="doi-modal" id="doiNewThreadModal" hidden>
        <div class="doi-modal-inner">
          <h3>▸ Open a new thread</h3>
          <div class="doi-field">
            <label>Title</label>
            <input id="doiNTTitle" type="text" maxlength="80" placeholder="What's the intel?" />
          </div>
          <div class="doi-field">
            <label>First message (optional)</label>
            <textarea id="doiNTBody" maxlength="2000" placeholder="Details, coordinates, source…"></textarea>
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
            <input id="doiPfName" type="text" maxlength="24" value="${esc(p.name)}"/>
          </div>
          <div class="doi-field">
            <label>Bio</label>
            <input id="doiPfBio" type="text" maxlength="80" value="${esc(p.bio || '')}"/>
          </div>
          <div class="doi-field">
            <label>Avatar (image file)</label>
            <input id="doiPfAvatar" type="file" accept="image/*"/>
            <div class="doi-hint">Stored locally as base64. Keep it small.</div>
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
      ${avatarHTML(m.name, null, 32)}
      <span class="doi-mem-name ${m.officer?'doi-officer':''}">${esc(m.name)}</span>
      <span class="doi-mem-status">${esc(m.status || '')}</span>
    </div>`;
  }

  /* ---------- CENTER VIEWS ---------- */
  function viewWelcome() {
    const forums = store.getForums();
    const head = `<span class="doi-hash">▸</span><h2>Home</h2>
      <span class="doi-topic">Chat Home · DOI Terminal</span>`;
    const body = `
      <div class="doi-main-body">
        <div class="doi-hero">
          <div class="doi-hero-img" id="doi-hero-bg"></div>
          <div class="doi-hero-vign"></div>
          <div class="doi-hero-inner">
            <div class="doi-hero-mark">${DOI_BADGE_SVG}</div>
            <div class="doi-hero-txt">
              <h1>Department of Insurgency</h1>
              <p>Site-CI Terminal · Operational</p>
              <p class="doi-motto">Dismantling Greed · Since 2026</p>
            </div>
          </div>
          <div class="doi-hero-stats">
            <div>Operatives<b>${DEFAULT_MEMBERS.filter(m=>m.online).length}/${DEFAULT_MEMBERS.length}</b></div>
            <div>Threads<b>${forums.length}</b></div>
            <div>Channels<b>${CHANNELS.text.length}</b></div>
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
          ${forums.slice(0, 5).map(t => threadRow(t)).join('') || '<div class="doi-empty">no threads yet</div>'}
        </div>
      </div>`;
    return { head, body };
  }

  function viewChannel(chId) {
    const ch = CHANNELS.text.find(c => c.id === chId);
    if (!ch) return viewWelcome();
    const msgs = (store.getChat()[chId] || []);
    const p = store.getProfile();
    const head = `<span class="doi-hash">#</span><h2>${esc(ch.name)}</h2>
      <span class="doi-topic">${esc(ch.topic)}</span>`;
    const body = `
      <div class="doi-main-body" id="doi-msgs">
        ${msgs.length ? msgs.map(m => msgHTML(m)).join('') : '<div class="doi-empty">no messages · be the first</div>'}
      </div>
      ${composerHTML('channel', chId, ch.name)}`;
    return { head, body };
  }

  function viewForums() {
    const forums = store.getForums();
    const head = `<span class="doi-hash">▤</span><h2>forum-index</h2>
      <span class="doi-topic">${forums.length} threads · start one any time</span>`;
    const body = `
      <div class="doi-main-body">
        <div class="doi-forum-head">
          <input class="doi-forum-search" id="doi-forum-search" placeholder="Search threads…"/>
          <button class="doi-newthread" data-shell-newthread>▸ NEW THREAD</button>
        </div>
        <div class="doi-threads" id="doi-thread-list">
          ${forums.length ? forums.map(t => threadRow(t)).join('') : '<div class="doi-empty">no threads yet</div>'}
        </div>
      </div>`;
    return { head, body };
  }

  function viewThread(tid) {
    const t = store.getThread(tid);
    if (!t) return viewForums();
    const head = `<span class="doi-hash">›</span><h2>${esc(t.title)}</h2>
      <span class="doi-topic">by <b>${esc(t.author)}</b> · ${timeAgo(t.ts)} · ${t.messages.length} posts</span>`;
    const body = `
      <div class="doi-main-body" id="doi-msgs">
        ${t.messages.length ? t.messages.map(m => msgHTML(m)).join('') : '<div class="doi-empty">empty thread</div>'}
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
      <span class="doi-thread-count">${t.messages.length} ◆</span>
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
    if (!kind) return '';
    return `<div class="doi-composer">
      <form data-composer data-kind="${kind}" data-id="${esc(id)}">
        <input type="text" placeholder="Message ${esc(label || '')}" maxlength="1000" autocomplete="off"/>
        <button type="submit">Send ▸</button>
      </form>
    </div>`;
  }

  /* ---------- WIRE UP ---------- */
  function wire(container) {
    // navigate within shell
    $$('[data-shell-nav]', container).forEach(el => el.addEventListener('click', e => {
      const t = el.dataset.shellNav;
      if (t === 'welcome') { state.view = 'welcome'; }
      else if (t === 'channel') { state.view = 'channel'; state.channel = el.dataset.ch; }
      else if (t === 'forums')  { state.view = 'forums'; }
      else if (t === 'thread')  { state.view = 'thread'; state.thread = el.dataset.thread; }
      rerender();
    }));

    // sign out
    const so = $('[data-shell-signout]', container);
    if (so) so.addEventListener('click', () => {
      store.signOut();
      state.view = 'welcome'; state.channel = null; state.thread = null;
      renderGate('login');
    });

    // new thread modal open
    $$('[data-shell-newthread]', container).forEach(el => el.addEventListener('click', () => {
      const m = $('#doiNewThreadModal', container); if (m) { m.hidden = false; $('#doiNTTitle', m)?.focus(); }
    }));
    // profile modal open
    $$('[data-shell-editprofile]', container).forEach(el => el.addEventListener('click', () => {
      const m = $('#doiProfileModal', container); if (m) { m.hidden = false; }
    }));
    // close modals
    $$('[data-close-modal]', container).forEach(b => b.addEventListener('click', () => {
      b.closest('.doi-modal').hidden = true;
    }));
    $$('.doi-modal', container).forEach(m => m.addEventListener('click', e => {
      if (e.target === m) m.hidden = true;
    }));

    // submit new thread
    const submitT = $('[data-submit-thread]', container);
    if (submitT) submitT.addEventListener('click', () => {
      const title = $('#doiNTTitle', container).value.trim();
      const body  = $('#doiNTBody', container).value.trim();
      if (!title) return;
      const t = store.addThread(title, body);
      state.view = 'thread'; state.thread = t.id;
      rerender();
    });

    // submit profile
    const submitP = $('[data-submit-profile]', container);
    if (submitP) submitP.addEventListener('click', () => {
      const p = store.getProfile() || {};
      const name = $('#doiPfName', container).value.trim() || p.name;
      const bio  = $('#doiPfBio', container).value.trim();
      const file = $('#doiPfAvatar', container).files[0];
      const finish = (dataUrl) => {
        const np = { ...p, name, bio };
        if (dataUrl) np.avatar = dataUrl;
        store.setProfile(np);
        rerender();
      };
      if (file) {
        const rd = new FileReader();
        rd.onload = () => finish(String(rd.result));
        rd.readAsDataURL(file);
      } else finish();
    });

    // composer submit
    $$('[data-composer]', container).forEach(f => f.addEventListener('submit', e => {
      e.preventDefault();
      const input = f.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      const kind = f.dataset.kind, id = f.dataset.id;
      if (kind === 'channel') store.addChatMsg(id, text);
      else if (kind === 'thread') store.addThreadMsg(id, text);
      input.value = '';
      rerender();
    }));

    // if user has dropped assets/img/soldiers-team.jpg, try loading it
    const heroBg = $('#doi-hero-bg', container);
    if (heroBg) {
      const img = new Image();
      img.onload = () => {
        heroBg.style.backgroundImage = `url('assets/img/soldiers-team.jpg')`;
        heroBg.classList.remove('placeholder');
      };
      img.onerror = () => { heroBg.classList.add('placeholder'); };
      img.src = 'assets/img/soldiers-team.jpg';
    }

    // auto-scroll chat to bottom
    const msgs = $('#doi-msgs', container);
    if (msgs) msgs.scrollTop = msgs.scrollHeight;

    // forum search
    const search = $('#doi-forum-search', container);
    const list = $('#doi-thread-list', container);
    if (search && list) {
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        const forums = store.getForums().filter(t =>
          !q || t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q));
        list.innerHTML = forums.length ? forums.map(threadRow).join('') : '<div class="doi-empty">no threads match</div>';
        $$('[data-shell-nav="thread"]', list).forEach(el => el.addEventListener('click', () => {
          state.view = 'thread'; state.thread = el.dataset.thread; rerender();
        }));
      });
    }
  }

  function rerender() {
    if (typeof window.__doiRender === 'function') window.__doiRender();
  }

  /* ---------- PUBLIC RENDERERS ---------- */
  window.DOI.renderHome = function () {
    if (!store.isAuthed()) return '';
    let view;
    if (state.view === 'channel') view = viewChannel(state.channel);
    else if (state.view === 'forums') view = viewForums();
    else if (state.view === 'thread') view = viewThread(state.thread);
    else view = viewWelcome();
    return shell(view.body, view.head);
  };

  window.DOI.wireHome = function (container) {
    if (!container) return;
    wire(container);
  };

  window.DOI.renderAdminHub = function () {
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
  };

  // dispatch an event when any storage-affecting local update happens so
  // other tabs on the same origin refresh
  window.addEventListener('storage', e => {
    if (e.key === PROFILE_KEY || e.key === FORUM_KEY || e.key === CHAT_KEY) rerender();
  });
})();
