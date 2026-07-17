/* =========================================================
   robloxworld.js — UI for the server-rendered Roblox tiles.

   Talks to the server endpoints:
     GET /api/world/tile?lat=&lng=&size=        → minimal JSON (preview)
     GET /api/world/roblox.lua?lat=&lng=&size=&host=  → ready Luau script

   The heavy data work happens on the server; this page just collects
   lat/lng/size, asks the server to generate the script, and shows it
   with copy/download. Exposes window.wireRobloxWorld(); called by app.js.
   ========================================================= */
(function () {
  const $ = (s, r = document) => r.querySelector(s);

  let lastScript = '';

  function setStatus(msg, kind) {
    const el = $('#rw-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = kind === 'err' ? '#e0626b' : kind === 'ok' ? '#5fbf6b' : '';
  }

  function currentSize() {
    const sel = $('#rw-size');
    if (sel && sel.value === 'custom') {
      const v = parseInt($('#rw-custom').value, 10);
      return Math.max(250, Math.min(6000, isFinite(v) ? v : 3000));
    }
    return parseInt((sel && sel.value) || '3000', 10);
  }

  async function preview() {
    const lat = parseFloat($('#rw-lat').value), lng = parseFloat($('#rw-lon').value);
    const size = currentSize();
    if (!isFinite(lat) || !isFinite(lng)) { setStatus('Enter a valid latitude and longitude.', 'err'); return; }
    setStatus(`Fetching tile data (${size} m)… first build of a new area can take a few seconds.`);
    try {
      const r = await fetch(`/api/world/tile?lat=${lat}&lng=${lng}&size=${size}`);
      const t = await r.json();
      if (t.error) { setStatus('Server: ' + t.error, 'err'); return; }
      const c = t.counts || {};
      $('#rw-stats').innerHTML =
        `<b>${c.buildings || 0}</b> buildings · <b>${c.roads || 0}</b> roads · <b>${c.water || 0}</b> water bodies · ` +
        `flat ground (no terrain) · ` +
        `${t.cached ? 'served from cache' : 'freshly built'}`;
      setStatus(`Tile ready: ${c.buildings || 0} buildings, ${c.roads || 0} roads, ${c.water || 0} water. ${t.cached ? '(cached)' : '(built + cached)'}`, 'ok');
    } catch (e) {
      setStatus('Could not reach the tile endpoint: ' + e.message, 'err');
    }
  }

  async function generate() {
    const lat = parseFloat($('#rw-lat').value), lng = parseFloat($('#rw-lon').value);
    const size = currentSize();
    if (!isFinite(lat) || !isFinite(lng)) { setStatus('Enter a valid latitude and longitude.', 'err'); return; }
    setStatus(`Generating script for ${size} × ${size} m around (${lat}, ${lng})…`);
    try {
      const url = `/api/world/roblox.lua?lat=${lat}&lng=${lng}&size=${size}&host=${encodeURIComponent(location.origin)}`;
      const r = await fetch(url);
      const lua = await r.text();
      if (!r.ok) { setStatus('Server: ' + lua.slice(0, 200), 'err'); return; }
      lastScript = lua;
      $('#rw-out').textContent = lua;
      $('#rw-copy').disabled = false;
      const dl = $('#rw-dl');
      dl.setAttribute('aria-disabled', 'false');
      dl.href = URL.createObjectURL(new Blob([lua], { type: 'text/plain' }));
      dl.download = `roblox_tile_${lat}_${lng}_${size}m.lua`;
      $('#rw-stats').innerHTML = `Script ready — <b>${(lua.length / 1024).toFixed(1)} KB</b>. It fetches the tile JSON at runtime, so its size never changes with the area.`;
      setStatus('Script generated. Paste it into the Studio Command Bar (View → Command Bar) and press Enter.', 'ok');
    } catch (e) {
      setStatus('Could not generate the script: ' + e.message, 'err');
    }
  }

  window.wireRobloxWorld = function wireRobloxWorld() {
    const gen = $('#rw-gen');
    if (!gen) return; // not on this page

    $('#rw-cities').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        $('#rw-lat').value = b.dataset.lat;
        $('#rw-lon').value = b.dataset.lon;
        setStatus(`Location set to ${b.textContent.trim()}.`);
      }));

    $('#rw-size').addEventListener('change', (e) => {
      $('#rw-custom-wrap').hidden = e.target.value !== 'custom';
    });

    gen.addEventListener('click', generate);
    $('#rw-preview').addEventListener('click', preview);

    $('#rw-copy').addEventListener('click', async () => {
      if (!lastScript) return;
      try { await navigator.clipboard.writeText(lastScript); setStatus('Script copied to clipboard.', 'ok'); }
      catch (_) { setStatus('Copy failed — select the code and copy manually.', 'err'); }
    });
  };
})();
