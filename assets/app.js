/* =========================================================
   app.js — routing, sidebar, tabs, accordion, search, theme
   ========================================================= */
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const content  = $('#content');
  const sidebar  = $('#sidebar');
  const toc      = $('#toc');

  /* ---------- THEME ---------- */
  const themeKey = 'yesp-theme';
  const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.setItem(themeKey, t); };
  setTheme(localStorage.getItem(themeKey) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('#themeToggle').addEventListener('click', () =>
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  /* ---------- MOBILE MENU ---------- */
  $('#menuToggle').addEventListener('click', () => sidebar.classList.toggle('open'));

  /* ---------- ROUTER ---------- */
  function currentPath() {
    const h = location.hash.replace(/^#/, '');
    return PAGES[h] ? h : '/overview';
  }

  function render() {
    // auth gate before anything else
    if (window.DOI && !window.DOI.store.isAuthed()) {
      window.DOI.renderGate('login');
      return;
    }

    const path = currentPath();
    const page = PAGES[path];

    // discord-shell home gets full-bleed body
    document.body.classList.toggle('doi-home', path === '/overview');

    content.innerHTML = page.html();
    content.scrollIntoView({ block: 'start' });
    window.scrollTo(0, 0);

    syncSidebar(page.section, path);
    syncTopNav(page.section);
    buildTOC();
    wireInteractions();

    // wire the DOI shell interactions on the home page
    if (path === '/overview' && window.DOI && typeof window.DOI.wireHome === 'function') {
      window.DOI.wireHome(content);
    }

    sidebar.classList.remove('open');
    document.title = `${page.title} · DOI`;
  }

  // allow doi.js to trigger a full re-render (e.g. after posting a message)
  window.__doiRender = render;
  window.addEventListener('doi:auth', render);

  /* ---------- SIDEBAR (section-aware, like the reference) ---------- */
  function syncSidebar(section, path) {
    $$('.nav-group').forEach(g => g.classList.toggle('show', g.dataset.group === section));
    $$('.nav-group a').forEach(a =>
      a.classList.toggle('active', a.getAttribute('href') === '#' + path));
  }
  function syncTopNav(section) {
    $$('.top-nav a').forEach(a => a.classList.toggle('active', a.dataset.section === section));
  }

  /* ---------- ON-THIS-PAGE TOC ---------- */
  function buildTOC() {
    const heads = $$('.content h2[id]');
    if (!heads.length) { toc.innerHTML = ''; return; }
    toc.innerHTML = `<p class="toc-title">On this page</p>` +
      heads.map(h => `<a href="#${location.hash.slice(1)}__${h.id}" data-toc="${h.id}">${h.textContent}</a>`).join('');
    $$('[data-toc]', toc).forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById(a.dataset.toc)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    spyTOC(heads);
  }
  function spyTOC(heads) {
    const links = $$('[data-toc]', toc);
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          links.forEach(l => l.classList.toggle('active', l.dataset.toc === en.target.id));
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    heads.forEach(h => obs.observe(h));
  }

  /* ---------- TABS / ACCORDION / COPY ---------- */
  function wireInteractions() {
    // tabs
    $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
      const strip = btn.closest('.tabs');
      $$('.tab-btn', strip).forEach(b => b.classList.remove('active'));
      $$('.tab-panel', strip).forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('#' + btn.dataset.tab, strip).classList.add('active');
    }));

    // nested sub-tabs (scoped to their own .subtabs container)
    $$('.subtab-btn').forEach(btn => btn.addEventListener('click', () => {
      const strip = btn.closest('.subtabs');
      $$('.subtab-btn', strip).forEach(b => b.classList.remove('active'));
      $$('.subtab-panel', strip).forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('#' + btn.dataset.subtab, strip).classList.add('active');
    }));

    // AI list variant dropdown (group row toggles its sibling .ailist-variants)
    $$('[data-group-toggle]').forEach(row => {
      const toggle = () => {
        const panel = row.nextElementSibling;
        if (!panel || !panel.classList.contains('ailist-variants')) return;
        const opening = panel.hasAttribute('hidden');
        if (opening) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
        row.classList.toggle('open', opening);
        row.setAttribute('aria-expanded', opening ? 'true' : 'false');
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });

    // accordion
    $$('.acc-head').forEach(h => h.addEventListener('click', () =>
      h.closest('.acc-item').classList.toggle('open')));

    // copy buttons
    $$('.copy-btn').forEach(btn => btn.addEventListener('click', () => {
      const codeEl = btn.closest('.code').querySelector('pre');
      navigator.clipboard.writeText(codeEl.innerText).then(() => {
        btn.textContent = 'Copied!'; btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1400);
      });
    }));

    wireConverter();
    wireConsole();
    wireScriptLibrary();
    wireAvatarVault();
    if (typeof window.wireWorldBuilder === 'function') window.wireWorldBuilder();
    if (typeof window.wireRobloxWorld === 'function') window.wireRobloxWorld();
    if (typeof window.wireCpuBuilder === 'function') window.wireCpuBuilder();
    if (typeof window.wireMapGame === 'function') window.wireMapGame();
  }

  /* ---------- SCRIPT LIBRARY ---------- */
  const codeCache = {};
  async function loadScript(file) {
    if (codeCache[file]) return codeCache[file];
    try {
      const r = await fetch(file, { cache: 'no-store' });
      const t = await r.text();
      codeCache[file] = t;
      return t;
    } catch (e) { return '-- could not load ' + file; }
  }

  function wireScriptLibrary() {
    const grid = $('#script-grid');
    if (!grid || typeof SCRIPTS === 'undefined') return;
    const filterBar = $('#lib-filters');
    const search = $('#lib-search');

    const cats = ['All', ...[...new Set(SCRIPTS.map(s => s.category))]];
    let activeCat = 'All';

    filterBar.innerHTML = cats.map((c, i) =>
      `<button class="lib-chip${i === 0 ? ' active' : ''}" data-cat="${c}">${c}</button>`).join('');

    const render = () => {
      const q = (search.value || '').toLowerCase();
      const items = SCRIPTS.filter(s => {
        const inCat = activeCat === 'All' || s.category === activeCat;
        const hay = (s.title + ' ' + s.what + ' ' + s.does + ' ' + s.tags.join(' ')).toLowerCase();
        return inCat && (!q || hay.includes(q));
      });
      grid.innerHTML = items.length ? items.map(s => `
        <div class="lib-card" data-id="${s.id}">
          <div class="lib-card-top">
            <span class="lib-cat">${s.category}</span>
            <span class="lib-lang">${s.lang}</span>
          </div>
          <h3>${s.title}</h3>
          <p class="lib-what">${escapeHtml(s.what)}</p>
          <p class="lib-does">${escapeHtml(s.does)}</p>
          <div class="lib-tags">${s.tags.map(t => `<span>#${t}</span>`).join('')}</div>
          <div class="lib-actions">
            <button class="lib-view" data-file="${s.file}">View code</button>
            <button class="lib-copy" data-file="${s.file}">Copy</button>
            <a class="lib-dl" href="${s.file}" download>Download</a>
          </div>
          <div class="lib-code" hidden><div class="code"><div class="code-head"><span class="code-lang">${s.lang}</span></div><pre><code></code></pre></div></div>
        </div>`).join('') : `<div class="lib-empty">No scripts match that.</div>`;

      // view toggles (lazy-load file content)
      $$('.lib-view', grid).forEach(b => b.addEventListener('click', async () => {
        const card = b.closest('.lib-card');
        const box = $('.lib-code', card);
        if (!box.hidden) { box.hidden = true; b.textContent = 'View code'; return; }
        const codeEl = $('code', box);
        codeEl.textContent = 'loading…';
        box.hidden = false; b.textContent = 'Hide code';
        codeEl.textContent = await loadScript(b.dataset.file);
      }));
      // copy file content
      $$('.lib-copy', grid).forEach(b => b.addEventListener('click', async () => {
        const txt = await loadScript(b.dataset.file);
        navigator.clipboard.writeText(txt);
        b.textContent = 'Copied!'; setTimeout(() => b.textContent = 'Copy', 1300);
      }));
    };

    $$('.lib-chip', filterBar).forEach(c => c.addEventListener('click', () => {
      $$('.lib-chip', filterBar).forEach(x => x.classList.remove('active'));
      c.classList.add('active'); activeCat = c.dataset.cat; render();
    }));
    search.addEventListener('input', render);
    render();
  }

  /* ---------- AVATAR VAULT ---------- */
  let vaultTimer = null;
  function wireAvatarVault() {
    if (vaultTimer) { clearInterval(vaultTimer); vaultTimer = null; }
    const grid = $('#avatar-grid');
    if (!grid) return;
    const status = $('#vault-status'), dot = $('#vault-dot');
    let lastKey = '';

    const card = m => {
      const d = m.data || {};
      const items = (d.items || []).map(it => {
        const link = it.link || ('https://www.roblox.com/catalog/' + it.id);
        const img = it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"/>` : '';
        const name = escapeHtml(it.name || it.kind || ('Asset ' + it.id));
        return `<a class="av-it" href="${escapeHtml(link)}" target="_blank" rel="noopener" title="${name} · open on Roblox">
          ${img}<span class="av-it-name">${name}</span><span class="av-it-kind">${escapeHtml(it.kind || '')}</span></a>`;
      }).join('') || '<span class="av-none">no items read</span>';
      const when = d.joined ? new Date(d.joined).toLocaleString() : new Date(m.ts).toLocaleString();
      const img = d.thumb ? `<img src="${escapeHtml(d.thumb)}" alt="" loading="lazy" onerror="this.style.display='none'"/>` : '';
      const profile = d.userId ? `https://www.roblox.com/users/${d.userId}/profile` : '#';
      return `<div class="av-card">
        <div class="av-head">${img}<div><a class="av-name" href="${profile}" target="_blank" rel="noopener">${escapeHtml(d.name || '?')}</a><div class="av-sub">${escapeHtml(d.displayName || '')} · id ${escapeHtml(String(d.userId || '—'))}</div></div></div>
        <div class="av-when">🕒 ${when} &nbsp;·&nbsp; ${(d.items || []).length} items</div>
        <div class="av-items">${items}</div>
      </div>`;
    };

    const tick = async () => {
      try {
        const r = await fetch('/api/messages?room=avatars', { cache: 'no-store' });
        const list = await r.json();
        const totalItems = list.reduce((n, m) => n + ((m.data && m.data.items) ? m.data.items.length : 0), 0);
        dot.className = 'dot on'; status.textContent = `live · ${list.length} avatars · ${totalItems} items`;
        const key = list.map(m => (m.data && m.data.userId) + ':' + m.ts).join('|');
        if (key !== lastKey) {
          grid.innerHTML = list.length ? list.slice().reverse().map(card).join('')
            : '<div class="lib-empty">No avatars yet — run the Avatar Collector and join the game.</div>';
          lastKey = key;
        }
      } catch (e) { dot.className = 'dot off'; status.textContent = 'offline — start the server'; }
    };

    $('#vault-clear').addEventListener('click', async () => {
      try { await fetch('/api/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: 'avatars' }) }); } catch (_) {}
      lastKey = ''; tick();
    });

    tick();
    vaultTimer = setInterval(tick, 2000);
  }

  /* ---------- WONDERSCRIPT CONVERTER ---------- */
  // bijective Lua-keyword <-> glyph map (glyphs never appear in normal code)
  const WS = {
    "local":"✦","function":"ƒ","end":"■","then":"‹","else":"»","elseif":"«",
    "if":"¿","for":"∑","while":"∞","do":"◇","return":"➤","in":"∈","and":"∧",
    "or":"∨","not":"¬","nil":"∅","true":"⊤","false":"⊥","repeat":"↻","until":"⊣","break":"⊘"
  };
  const WS_REV = Object.fromEntries(Object.entries(WS).map(([k, v]) => [v, k]));
  const luaToWonder = s => s.replace(/\b(local|function|end|then|else|elseif|if|for|while|do|return|in|and|or|not|nil|true|false|repeat|until|break)\b/g, m => WS[m]);
  const wonderToLua = s => s.replace(new RegExp("[" + Object.values(WS).join("") + "]", "g"), m => WS_REV[m]);

  function otherToLua(src) {
    return src.split("\n").map(line => {
      let l = line;
      l = l.replace(/\/\/(.*)$/, "--$1");                       // // comment -> --
      l = l.replace(/\bconsole\.log\s*\(/g, "print(");           // console.log -> print
      l = l.replace(/\b(?:let|const|var)\s+/g, "local ");        // let/const/var -> local
      l = l.replace(/\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{/g, "function $1($2)"); // fn decl
      l = l.replace(/\}\s*else\s*\{/g, "else");                  // } else { -> else
      l = l.replace(/^\s*\}\s*$/, "end");                        // lone } -> end
      l = l.replace(/!==|!=/g, "~=").replace(/===|==/g, "==");   // inequality
      l = l.replace(/&&/g, "and").replace(/\|\|/g, "or");        // logical
      l = l.replace(/!(\s*\w)/g, "not $1");                       // !x -> not x
      l = l.replace(/;+\s*$/, "");                                // drop trailing ;
      return l;
    }).join("\n");
  }

  function wireConverter() {
    const inp = $('#conv-in'), out = $('#conv-out'), mode = $('#conv-mode');
    if (!inp) return;
    const run = () => {
      const v = inp.value;
      out.value = mode.value === 'lua2wonder' ? luaToWonder(v)
                : mode.value === 'wonder2lua' ? wonderToLua(v)
                : otherToLua(v);
    };
    $('#conv-run').addEventListener('click', run);
    inp.addEventListener('input', run);
    mode.addEventListener('change', run);
    $('#conv-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(out.value);
      const b = $('#conv-copy'); b.textContent = 'Copied!';
      setTimeout(() => b.textContent = 'Copy output', 1300);
    });
    run();
  }

  /* ---------- LIVE CONSOLE ---------- */
  let consoleTimer = null;
  function wireConsole() {
    if (consoleTimer) { clearInterval(consoleTimer); consoleTimer = null; }
    const feed = $('#console-feed');
    if (!feed) return;
    const ROOM = 'battlefeuer';
    const status = $('#console-status'), dot = $('#console-dot');
    let lastCount = 0;

    const fmt = m => {
      const t = new Date((m.ts || Date.now())).toLocaleTimeString();
      const data = m.data && Object.keys(m.data).length ? ` <span class="c-data">${escapeHtml(JSON.stringify(m.data))}</span>` : '';
      return `<div class="c-line"><span class="c-time">${t}</span><span class="c-from c-${m.from === 'game' ? 'g' : 'u'}">${escapeHtml(m.from || '?')}</span><span class="c-text">${escapeHtml(m.text || '')}</span>${data}</div>`;
    };

    const tick = async () => {
      try {
        const r = await fetch(`/api/messages?room=${ROOM}`, { cache: 'no-store' });
        const list = await r.json();
        dot.className = 'dot on'; status.textContent = `live · ${list.length} msgs`;
        if (list.length !== lastCount) {
          feed.innerHTML = list.map(fmt).join('') || '<div class="c-empty">waiting for the game to say hello…</div>';
          feed.scrollTop = feed.scrollHeight;
          lastCount = list.length;
        }
      } catch (e) {
        dot.className = 'dot off';
        status.textContent = 'offline — is server.js running the bridge API?';
      }
    };

    const send = async () => {
      const i = $('#console-input'); const text = i.value.trim();
      if (!text) return;
      i.value = '';
      try { await fetch('/api/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: ROOM, text }) }); } catch (_) {}
      tick();
    };

    $('#console-go').addEventListener('click', send);
    $('#console-input').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    $('#console-clear').addEventListener('click', async () => {
      try { await fetch('/api/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: ROOM }) }); } catch (_) {}
      lastCount = -1; tick();
    });

    tick();
    consoleTimer = setInterval(tick, 1000);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* ---------- SPA LINK INTERCEPT ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-link]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href && href.startsWith('#')) { /* hashchange handles render */ }
  });

  window.addEventListener('hashchange', render);

  /* ---------- SEARCH ---------- */
  const modal   = $('#searchModal');
  const input   = $('#searchInput');
  const results = $('#searchResults');
  let selIdx = 0, shown = [];

  function openSearch()  { modal.hidden = false; input.value = ''; runSearch(''); input.focus(); }
  function closeSearch() { modal.hidden = true; }

  $('#searchTrigger').addEventListener('click', openSearch);

  function runSearch(q) {
    q = q.trim().toLowerCase();
    shown = SEARCH_INDEX.filter(p =>
      !q || p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q) || p.section.includes(q)
    ).slice(0, 8);
    selIdx = 0;
    results.innerHTML = shown.length ? shown.map((p, i) => `
      <a href="#${p.href}" data-link class="${i === 0 ? 'sel' : ''}">
        <div class="r-sec">${p.section}</div>
        <div class="r-ttl">${p.title}</div>
        <div class="r-txt">${p.text.slice(0, 90)}…</div>
      </a>`).join('') : `<div class="empty">No matches.</div>`;
    $$('a', results).forEach(a => a.addEventListener('click', closeSearch));
  }

  input.addEventListener('input', e => runSearch(e.target.value));

  document.addEventListener('keydown', e => {
    if (e.key === '/' && modal.hidden && !/input|textarea/i.test(e.target.tagName)) {
      e.preventDefault(); openSearch();
    } else if (e.key === 'Escape') { closeSearch();
    } else if (!modal.hidden) {
      const links = $$('a', results);
      if (e.key === 'ArrowDown') { e.preventDefault(); selIdx = Math.min(selIdx + 1, links.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); }
      else if (e.key === 'Enter' && links[selIdx]) { location.hash = links[selIdx].getAttribute('href'); closeSearch(); return; }
      links.forEach((l, i) => l.classList.toggle('sel', i === selIdx));
      links[selIdx]?.scrollIntoView({ block: 'nearest' });
    }
  });

  modal.addEventListener('click', e => { if (e.target === modal) closeSearch(); });

  /* ---------- INIT ---------- */
  if (!location.hash) location.hash = '#/overview';
  render();
})();
