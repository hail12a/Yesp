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
