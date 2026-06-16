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
    const path = currentPath();
    const page = PAGES[path];

    content.innerHTML = page.html();
    content.scrollIntoView({ block: 'start' });
    window.scrollTo(0, 0);

    syncSidebar(page.section, path);
    syncTopNav(page.section);
    buildTOC();
    wireInteractions();
    sidebar.classList.remove('open');
    document.title = `${page.title} · Yesp Docs`;
  }

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
