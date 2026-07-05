/* =========================================================
   content.js — all page content for the Yesp docs hub.
   Each page returns an HTML string. Routing lives in app.js.
   ========================================================= */

/* small helpers so the content below stays readable */
const code = (lang, body) => `
  <div class="code">
    <div class="code-head"><span class="code-lang">${lang}</span><button class="copy-btn">Copy</button></div>
    <pre><code>${body}</code></pre>
  </div>`;

const tabs = (id, items) => {
  const strip = items.map((t, i) =>
    `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="${id}-${i}">${t.label}</button>`).join('');
  const panels = items.map((t, i) =>
    `<div class="tab-panel${i === 0 ? ' active' : ''}" id="${id}-${i}">${t.body}</div>`).join('');
  return `<div class="tabs"><div class="tab-strip">${strip}</div>${panels}</div>`;
};

/* nested tabs — distinct classes so the outer .tabs wiring never touches them */
const subtabs = (id, items) => {
  const strip = items.map((t, i) =>
    `<button class="subtab-btn${i === 0 ? ' active' : ''}" data-subtab="${id}-${i}">${t.label}</button>`).join('');
  const panels = items.map((t, i) =>
    `<div class="subtab-panel${i === 0 ? ' active' : ''}" id="${id}-${i}">${t.body}</div>`).join('');
  return `<div class="subtabs"><div class="subtab-strip">${strip}</div>${panels}</div>`;
};

const accordion = items => `<div class="accordion">${items.map(it => `
  <div class="acc-item">
    <button class="acc-head"><span class="acc-ico">${it.ico}</span>${it.title}
      <svg class="acc-arrow" viewBox="0 0 24 24" width="16" height="16"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="acc-body">${it.body}</div>
  </div>`).join('')}</div>`;

const pager = (prev, next) => `<div class="pager">
  ${prev ? `<a href="#${prev.href}" data-link><div class="dir">← Previous</div><div class="ttl">${prev.title}</div></a>` : '<span></span>'}
  ${next ? `<a class="next" href="#${next.href}" data-link><div class="dir">Next →</div><div class="ttl">${next.title}</div></a>` : '<span></span>'}
</div>`;

/* =========================================================
   PAGES
   ========================================================= */
const PAGES = {

/* ----------------------- OVERVIEW ----------------------- */
'/overview': {
  section: 'overview', title: 'Overview',
  html: () => `
    <span class="eyebrow">YESP DOCS</span>
    <h1>Welcome to Yesp</h1>
    <p class="lead">Two worlds, one docs hub. Open the <strong>Battlefeuer Bridge</strong> — a live two-way link between the Roblox game and this website — or step into the <strong>Quantum Lab</strong>, where we write code the way no one was supposed to.</p>

    <div class="hero">
      <p style="margin:0 0 6px;font-family:var(--mono);font-size:13px;color:var(--accent-ink)">// pick a universe</p>
      <p style="margin:0;font-size:17px;color:var(--ink)">This site borrows the layout you love from the Claude Code docs — the tabs, the sidebar, the clean panels — and points it at the things <em>we</em> care about.</p>
    </div>

    <div class="card-grid">
      <a class="card" href="#/battlefeuer" data-link>
        <div class="card-icon">📡</div>
        <h4>Battlefeuer Bridge</h4>
        <p>A Lua script + live console that link the game to this site, plus a Lua converter.</p>
      </a>
      <a class="card" href="#/quantum" data-link>
        <div class="card-icon">⚛️</div>
        <h4>Quantum Lab</h4>
        <p>Revolutionary, boundary-pushing experiments in quantum-inspired code.</p>
      </a>
      <a class="card" href="#/overview-howto" data-link>
        <div class="card-icon">🧭</div>
        <h4>How it works</h4>
        <p>The tab system, search, and theming explained in 60 seconds.</p>
      </a>
    </div>

    <h2 id="two-tabs">The two tabs</h2>
    ${tabs('ov', [
      { label: '📡 Battlefeuer Bridge', body: `
        <p>The <strong>Battlefeuer Bridge</strong> tab turns the Roblox game <em>Battlefeuer S2 [FFS] B39.11</em> into a live data source for this website. Paste one Lua script and the game starts talking to the browser.</p>
        <ul><li>A ready-to-paste <strong>bridge script</strong> using HttpService</li><li><strong>Wonder-Scripts</strong> — scientific experiments that report live data</li><li>A <strong>Decoder & Converter</strong>: Lua ⇄ WonderScript, and other→Lua</li><li>A <strong>Live Console</strong> that shows game events and sends commands back</li></ul>
        <p><a class="inline" href="#/battlefeuer" data-link>Open the bridge →</a></p>` },
      { label: '⚛️ Quantum Lab', body: `
        <p>The <strong>Quantum Lab</strong> tab is where code stops being ordinary. Each experiment takes a normal programming idea and pushes it to the edge of what's reasonable — superposition data types, entangled variables, quantum-walk search, simulated annealing of "reality".</p>
        <p>It's part real algorithm, part thought experiment. Every snippet runs as plain Python or JS — the <em>thinking</em> is the revolutionary part.</p>
        <p><a class="inline" href="#/quantum" data-link>Enter the lab →</a></p>` },
    ])}

    <div class="callout info"><span class="ico">💡</span><p>Press <kbd>/</kbd> anywhere to search across both tabs. Toggle dark mode from the top-right.</p></div>

    ${pager(null, { href: '/battlefeuer', title: 'Battlefeuer S2' })}
  `
},

'/overview-howto': {
  section: 'overview', title: 'How this hub works',
  html: () => `
    <span class="eyebrow">GETTING STARTED</span>
    <h1>How this hub works</h1>
    <p class="lead">Everything you need to navigate Yesp in under a minute.</p>

    <h2 id="nav">Navigation</h2>
    <p>The <strong>top bar</strong> switches between the three sections. When you pick one, the <strong>left sidebar</strong> swaps to show only that section's pages — exactly like the docs you liked.</p>

    <h2 id="features">Features</h2>
    <div class="card-grid">
      <div class="card"><div class="card-icon">🔍</div><h4>Search</h4><p>Hit <kbd>/</kbd> to fuzzy-search every page.</p></div>
      <div class="card"><div class="card-icon">🌗</div><h4>Themes</h4><p>Light & dark, remembered between visits.</p></div>
      <div class="card"><div class="card-icon">📑</div><h4>Tabs</h4><p>Inline tabbed panels on most pages.</p></div>
      <div class="card"><div class="card-icon">📋</div><h4>Copy code</h4><p>Every code block has a copy button.</p></div>
    </div>

    <div class="callout tip"><span class="ico">✅</span><p>The whole site is static HTML/CSS/JS — no build step. Open <code class="inline-code">index.html</code> and it just works.</p></div>
    ${pager({ href: '/overview', title: 'Overview' }, { href: '/battlefeuer', title: 'Battlefeuer S2' })}
  `
},

/* ----------------------- BATTLEFEUER BRIDGE ----------------------- */
'/battlefeuer': {
  section: 'battlefeuer', title: 'Bridge Overview',
  html: () => `
    <span class="eyebrow">BATTLEFEUER BRIDGE · LIVE COMMS</span>
    <h1>The Game ↔ Website Bridge</h1>
    <p class="lead">Paste one Lua script into <strong>Battlefeuer S2</strong> and the game starts talking to <em>this</em> website in real time — events flow out, commands flow back. It's a two-way radio between Roblox and the browser.</p>

    <div class="hero">
      <p style="margin:0 0 8px;font-family:var(--mono);font-size:13px;color:var(--accent-ink)">// how it flows</p>
      <p style="margin:0;font-size:16px;color:var(--ink)"><strong>Roblox Lua</strong> &nbsp;──HttpService──▶&nbsp; <strong>server.js /api</strong> &nbsp;──fetch──▶&nbsp; <strong>Live Console</strong><br/>and back the other way for commands.</p>
    </div>

    <div class="stat-row">
      <div class="stat"><b>POST</b><span>game → site events</span></div>
      <div class="stat"><b>GET</b><span>site → game commands</span></div>
      <div class="stat"><b>JSON</b><span>the wire format</span></div>
      <div class="stat"><b>~1s</b><span>poll interval</span></div>
    </div>

    <h2 id="parts">The three parts</h2>
    <div class="card-grid">
      <a class="card" href="#/bf-getstarted" data-link><div class="card-icon">📡</div><h4>Get the Script</h4><p>The Lua you paste into the game to open the radio link.</p></a>
      <a class="card" href="#/bf-loadout" data-link><div class="card-icon">🔭</div><h4>Wonder-Scripts</h4><p>Scientific experiment scripts that report live data to the site.</p></a>
      <a class="card" href="#/bf-maps" data-link><div class="card-icon">🧬</div><h4>Decoder & Converter</h4><p>Lua ⇄ our custom WonderScript, plus other→Lua.</p></a>
    </div>

    <div class="callout warn"><span class="ico">⚠️</span><p>Roblox <code class="inline-code">HttpService</code> must be enabled (Game Settings → Security → <em>Allow HTTP Requests</em>), and scripts must run server-side. This is for your <strong>own</strong> experience / experiments — don't use it where it breaks a game's rules.</p></div>
    ${pager({ href: '/overview', title: 'Overview' }, { href: '/bf-getstarted', title: 'Get the Script' })}
  `
},

'/bf-getstarted': {
  section: 'battlefeuer', title: 'Get the Script',
  html: () => `
    <span class="eyebrow">BRIDGE · SETUP</span>
    <h1>Get the Script</h1>
    <p class="lead">Drop this into a server <code class="inline-code">Script</code> in Roblox Studio (or your executor's server context). It opens the live link to this website.</p>

    <h2 id="endpoint">1 · Point it at your site</h2>
    <p>The bridge talks to the API built into <code class="inline-code">server.js</code>. Your site is hosted at the address below — the script already uses it:</p>
    ${code('lua', `<span class="tok-key">local</span> ENDPOINT = <span class="tok-str">"http://78.108.218.209:8098"</span>  <span class="tok-com">-- your Yesp site</span>`)}

    <h2 id="script">2 · The bridge script</h2>
    <p>Paste this whole thing. It sends a hello, streams events out, and listens for commands coming back from the <a class="inline" href="#/bf-tips" data-link>Live Console</a>.</p>
    ${code('lua', `<span class="tok-com">-- ============================================================
--  Yesp Bridge — Battlefeuer S2  <->  website
--  Paste into a server Script. Requires HttpService enabled.
-- ============================================================</span>
<span class="tok-key">local</span> HttpService = game:GetService(<span class="tok-str">"HttpService"</span>)
<span class="tok-key">local</span> Players     = game:GetService(<span class="tok-str">"Players"</span>)

<span class="tok-key">local</span> ENDPOINT = <span class="tok-str">"http://78.108.218.209:8098"</span>
<span class="tok-key">local</span> ROOM     = <span class="tok-str">"battlefeuer"</span>          <span class="tok-com">-- channel name</span>

<span class="tok-com">-- send one message out to the website</span>
<span class="tok-key">local function</span> <span class="tok-fn">say</span>(from, text, data)
    <span class="tok-key">local</span> ok, err = pcall(<span class="tok-key">function</span>()
        HttpService:PostAsync(
            ENDPOINT .. <span class="tok-str">"/api/say"</span>,
            HttpService:JSONEncode({
                room = ROOM, from = from, text = text, data = data or {}
            }),
            Enum.HttpContentType.ApplicationJson
        )
    <span class="tok-key">end</span>)
    <span class="tok-key">if</span> <span class="tok-key">not</span> ok <span class="tok-key">then</span> warn(<span class="tok-str">"[Yesp] send failed:"</span>, err) <span class="tok-key">end</span>
<span class="tok-key">end</span>

<span class="tok-com">-- poll the website for commands typed in the Live Console</span>
<span class="tok-key">local function</span> <span class="tok-fn">poll</span>()
    <span class="tok-key">local</span> ok, res = pcall(<span class="tok-key">function</span>()
        <span class="tok-key">return</span> HttpService:GetAsync(ENDPOINT .. <span class="tok-str">"/api/commands?room="</span> .. ROOM)
    <span class="tok-key">end</span>)
    <span class="tok-key">if</span> <span class="tok-key">not</span> ok <span class="tok-key">then</span> <span class="tok-key">return</span> {} <span class="tok-key">end</span>
    <span class="tok-key">local</span> okj, list = pcall(HttpService.JSONDecode, HttpService, res)
    <span class="tok-key">return</span> okj <span class="tok-key">and</span> list <span class="tok-key">or</span> {}
<span class="tok-key">end</span>

<span class="tok-com">-- handle a command from the website</span>
<span class="tok-key">local function</span> <span class="tok-fn">onCommand</span>(cmd)
    say(<span class="tok-str">"game"</span>, <span class="tok-str">"received command: "</span> .. tostring(cmd.text))
    <span class="tok-com">-- TODO: react however you like, e.g.:</span>
    <span class="tok-key">if</span> cmd.text == <span class="tok-str">"ping"</span> <span class="tok-key">then</span> say(<span class="tok-str">"game"</span>, <span class="tok-str">"pong "</span> .. os.time()) <span class="tok-key">end</span>
<span class="tok-key">end</span>

<span class="tok-com">-- ---- wire up live game events ----</span>
say(<span class="tok-str">"game"</span>, <span class="tok-str">"bridge online — Battlefeuer S2"</span>)

Players.PlayerAdded:Connect(<span class="tok-key">function</span>(p)
    say(<span class="tok-str">"game"</span>, p.Name .. <span class="tok-str">" joined"</span>, { players = #Players:GetPlayers() })
<span class="tok-key">end</span>)
Players.PlayerRemoving:Connect(<span class="tok-key">function</span>(p)
    say(<span class="tok-str">"game"</span>, p.Name .. <span class="tok-str">" left"</span>)
<span class="tok-key">end</span>)

<span class="tok-com">-- heartbeat + command poll loop</span>
<span class="tok-key">while</span> task.wait(<span class="tok-num">1</span>) <span class="tok-key">do</span>
    <span class="tok-key">for</span> _, cmd <span class="tok-key">in</span> ipairs(poll()) <span class="tok-key">do</span> onCommand(cmd) <span class="tok-key">end</span>
<span class="tok-key">end</span>`)}

    <h2 id="test">3 · Test the link</h2>
    <ol>
      <li>Run the game. You should see <code class="inline-code">bridge online</code> appear on the <a class="inline" href="#/bf-tips" data-link>Live Console</a> page.</li>
      <li>Type <code class="inline-code">ping</code> in the console and send — the game replies <code class="inline-code">pong</code>.</li>
    </ol>

    <div class="callout tip"><span class="ico">✅</span><p>No errors but nothing shows up? Make sure <strong>Allow HTTP Requests</strong> is on, and that the script is a <em>server</em> Script (not a LocalScript).</p></div>
    ${pager({ href: '/battlefeuer', title: 'Bridge Overview' }, { href: '/bf-loadout', title: 'Wonder-Scripts' })}
  `
},

'/bf-loadout': {
  section: 'battlefeuer', title: 'Wonder-Scripts',
  html: () => `
    <span class="eyebrow">BRIDGE · EXPERIMENTS</span>
    <h1>Wonder-Scripts</h1>
    <p class="lead">Small, scientific Lua experiments that don't just run in the game — they <em>report</em> to the website so you can watch the data live. Paste any below the bridge script.</p>

    ${tabs('wonder', [
      { label: '📈 Telemetry', body: `
        <p>Streams each player's position and speed to the site once a second — turn the game into a live sensor.</p>
        ${code('lua', `<span class="tok-key">local</span> Players = game:GetService(<span class="tok-str">"Players"</span>)
<span class="tok-key">while</span> task.wait(<span class="tok-num">1</span>) <span class="tok-key">do</span>
  <span class="tok-key">for</span> _, p <span class="tok-key">in</span> ipairs(Players:GetPlayers()) <span class="tok-key">do</span>
    <span class="tok-key">local</span> hrp = p.Character <span class="tok-key">and</span> p.Character:FindFirstChild(<span class="tok-str">"HumanoidRootPart"</span>)
    <span class="tok-key">if</span> hrp <span class="tok-key">then</span>
      say(<span class="tok-str">"telemetry"</span>, p.Name, {
        pos   = { math.floor(hrp.Position.X), math.floor(hrp.Position.Y), math.floor(hrp.Position.Z) },
        speed = math.floor(hrp.AssemblyLinearVelocity.Magnitude)
      })
    <span class="tok-key">end</span>
  <span class="tok-key">end</span>
<span class="tok-key">end</span>`)}` },
      { label: '🌡️ Heat Map', body: `
        <p>A "wonder" experiment: bucket the arena into a grid and count how often players stand in each cell. Send the hottest cell to the site — emergent map knowledge from raw motion.</p>
        ${code('lua', `<span class="tok-key">local</span> Players = game:GetService(<span class="tok-str">"Players"</span>)
<span class="tok-key">local</span> heat, CELL = {}, <span class="tok-num">16</span>
<span class="tok-key">local function</span> <span class="tok-fn">key</span>(v) <span class="tok-key">return</span> math.floor(v.X/CELL)..<span class="tok-str">","</span>..math.floor(v.Z/CELL) <span class="tok-key">end</span>
<span class="tok-key">while</span> task.wait(<span class="tok-num">0.5</span>) <span class="tok-key">do</span>
  <span class="tok-key">for</span> _, p <span class="tok-key">in</span> ipairs(Players:GetPlayers()) <span class="tok-key">do</span>
    <span class="tok-key">local</span> hrp = p.Character <span class="tok-key">and</span> p.Character.PrimaryPart
    <span class="tok-key">if</span> hrp <span class="tok-key">then</span> <span class="tok-key">local</span> k = key(hrp.Position); heat[k] = (heat[k] <span class="tok-key">or</span> <span class="tok-num">0</span>) + <span class="tok-num">1</span> <span class="tok-key">end</span>
  <span class="tok-key">end</span>
  <span class="tok-key">local</span> top, n = <span class="tok-str">"-"</span>, <span class="tok-num">0</span>
  <span class="tok-key">for</span> k, v <span class="tok-key">in</span> pairs(heat) <span class="tok-key">do</span> <span class="tok-key">if</span> v > n <span class="tok-key">then</span> top, n = k, v <span class="tok-key">end</span> <span class="tok-key">end</span>
  say(<span class="tok-str">"heatmap"</span>, <span class="tok-str">"hottest cell "</span>..top, { hits = n })
<span class="tok-key">end</span>`)}` },
      { label: '🔔 Event Tap', body: `
        <p>Hook any in-game event and echo it out. Here: every time a character dies, the site hears about it instantly.</p>
        ${code('lua', `<span class="tok-key">local</span> Players = game:GetService(<span class="tok-str">"Players"</span>)
Players.PlayerAdded:Connect(<span class="tok-key">function</span>(p)
  p.CharacterAdded:Connect(<span class="tok-key">function</span>(char)
    <span class="tok-key">local</span> hum = char:WaitForChild(<span class="tok-str">"Humanoid"</span>)
    hum.Died:Connect(<span class="tok-key">function</span>()
      say(<span class="tok-str">"event"</span>, p.Name .. <span class="tok-str">" died"</span>, { at = os.time() })
    <span class="tok-key">end</span>)
  <span class="tok-key">end</span>)
<span class="tok-key">end</span>)`)}` },
    ])}

    <div class="callout info"><span class="ico">🔭</span><p>Every one of these reuses the <code class="inline-code">say()</code> function from the bridge script — so the website's <a class="inline" href="#/bf-tips" data-link>Live Console</a> shows it all with zero extra setup.</p></div>
    ${pager({ href: '/bf-getstarted', title: 'Get the Script' }, { href: '/bf-maps', title: 'Decoder & Converter' })}
  `
},

'/bf-maps': {
  section: 'battlefeuer', title: 'Decoder & Converter',
  html: () => `
    <span class="eyebrow">BRIDGE · TOOLS</span>
    <h1>Decoder & Converter</h1>
    <p class="lead">Translate code three ways: wrap Lua into our custom <strong>WonderScript</strong>, decode WonderScript back to Lua, or convert other-language snippets into Lua. All runs live in your browser.</p>

    <h2 id="tool">The converter</h2>
    <div class="conv">
      <div class="conv-bar">
        <label>Mode</label>
        <select id="conv-mode">
          <option value="lua2wonder">Lua → WonderScript (encode)</option>
          <option value="wonder2lua">WonderScript → Lua (decode)</option>
          <option value="other2lua">Other (JS / Python-ish) → Lua</option>
        </select>
        <button class="conv-run" id="conv-run">Convert ▸</button>
        <button class="conv-copy" id="conv-copy">Copy output</button>
      </div>
      <div class="conv-io">
        <textarea id="conv-in" spellcheck="false" placeholder="paste code here…">local function greet(name)
  print("hello " .. name)
end
greet("world")</textarea>
        <textarea id="conv-out" spellcheck="false" placeholder="output appears here…" readonly></textarea>
      </div>
    </div>

    <h2 id="what-is">What is WonderScript?</h2>
    <p>WonderScript is a tiny, reversible re-skin of Lua: every Lua keyword is swapped for a unique glyph, so the logic is intact but the source reads like an alien artifact. Decode it and you get byte-for-byte Lua back. Great for puzzles, light obfuscation, or just for fun.</p>
    ${code('text', `<span class="tok-com">-- Lua</span>
local x = 10
<span class="tok-com">-- becomes WonderScript</span>
✦ x = 10        <span class="tok-com">(local → ✦)</span>`)}

    <h2 id="other">"Other → Lua" notes</h2>
    <p>The <strong>Other → Lua</strong> mode is a best-effort line translator for simple snippets. It handles the common stuff:</p>
    <table class="tbl">
      <tr><th>From (JS / Python-ish)</th><th>To (Lua)</th></tr>
      <tr><td><code class="inline-code">let</code> / <code class="inline-code">const</code> / <code class="inline-code">var x = …</code></td><td><code class="inline-code">local x = …</code></td></tr>
      <tr><td><code class="inline-code">console.log(…)</code></td><td><code class="inline-code">print(…)</code></td></tr>
      <tr><td><code class="inline-code">function f(a) {</code> … <code class="inline-code">}</code></td><td><code class="inline-code">function f(a)</code> … <code class="inline-code">end</code></td></tr>
      <tr><td><code class="inline-code">//</code> comment</td><td><code class="inline-code">--</code> comment</td></tr>
      <tr><td><code class="inline-code">!=</code> · <code class="inline-code">&&</code> · <code class="inline-code">||</code> · <code class="inline-code">!x</code></td><td><code class="inline-code">~=</code> · <code class="inline-code">and</code> · <code class="inline-code">or</code> · <code class="inline-code">not x</code></td></tr>
    </table>
    <div class="callout warn"><span class="ico">🧪</span><p>It's a helper, not a full transpiler — always eyeball the output before pasting it into the game.</p></div>
    ${pager({ href: '/bf-loadout', title: 'Wonder-Scripts' }, { href: '/bf-tips', title: 'Live Console' })}
  `
},

'/bf-tips': {
  section: 'battlefeuer', title: 'Live Console',
  html: () => `
    <span class="eyebrow">BRIDGE · LIVE</span>
    <h1>Live Console</h1>
    <p class="lead">Messages from the game land here in real time, and anything you send goes straight back to the running Lua script. This is the other end of the radio.</p>

    <div class="console">
      <div class="console-head">
        <span class="dot" id="console-dot"></span>
        <span id="console-status">connecting…</span>
        <span class="console-room">room: battlefeuer</span>
        <button class="console-clear" id="console-clear">Clear</button>
      </div>
      <div class="console-feed" id="console-feed"></div>
      <div class="console-send">
        <input id="console-input" placeholder="type a command (e.g. ping) and press Enter…" autocomplete="off" />
        <button id="console-go">Send ▸</button>
      </div>
    </div>

    <div class="callout info"><span class="ico">📡</span><p>This page polls <code class="inline-code">/api/messages</code> every second and posts to <code class="inline-code">/api/cmd</code>. Both are served by the bridge API inside <code class="inline-code">server.js</code> — no third-party backend.</p></div>

    <h2 id="protocol">The wire protocol</h2>
    <p>Everything is small JSON. Game → site:</p>
    ${code('json', `POST /api/say
{ "room": "battlefeuer", "from": "game", "text": "Alex joined", "data": { "players": 7 } }`)}
    <p>Site → game (the script polls this and clears it after reading):</p>
    ${code('json', `GET  /api/commands?room=battlefeuer   ->  [ { "text": "ping", "ts": 1718… } ]
POST /api/cmd   { "room": "battlefeuer", "text": "ping" }`)}

    ${pager({ href: '/bf-maps', title: 'Decoder & Converter' }, { href: '/quantum', title: 'Quantum Lab' })}
  `
},

/* ----------------------- SCRIPT LIBRARY ----------------------- */
'/scripts': {
  section: 'scripts', title: 'Browse Scripts',
  html: () => `
    <span class="eyebrow">SCRIPT LIBRARY · FREE TO USE</span>
    <h1>Script Library</h1>
    <p class="lead">A shelf of ready-to-use scripts. Each one says what it is and what it does — filter, read, copy, or download the raw file. No setup walls.</p>

    <div class="lib-controls">
      <input id="lib-search" class="lib-search" placeholder="🔎  search scripts, tags…" autocomplete="off" />
      <div class="lib-filters" id="lib-filters"></div>
    </div>

    <div class="lib-grid" id="script-grid"></div>

    <div class="callout info"><span class="ico">📦</span><p>Every script is a real file under <code class="inline-code">/scripts</code>. <strong>Download</strong> grabs the file directly; <strong>Copy</strong> puts it on your clipboard. Drop it into a server <code class="inline-code">Script</code> and it runs.</p></div>
  `
},

'/avatars': {
  section: 'scripts', title: 'Avatar Vault',
  html: () => `
    <span class="eyebrow">SCRIPT LIBRARY · LIVE DATA</span>
    <h1>Avatar Vault</h1>
    <p class="lead">The other end of the <a class="inline" href="#/scripts" data-link>Avatar Collector</a>. As players join your game, their avatars, worn items and join dates land here in real time.</p>

    <div class="vault-head">
      <span class="dot" id="vault-dot"></span>
      <span id="vault-status">connecting…</span>
      <button class="console-clear" id="vault-clear">Clear vault</button>
    </div>

    <div class="vault-grid" id="avatar-grid"></div>

    <div class="callout warn"><span class="ico">🧪</span><p>Prototype storage is in-memory (resets when the server restarts). Paste the <strong>Avatar Collector</strong> script into your game and join to populate it.</p></div>
  `
},

/* ----------------------- WORLD BUILDER ----------------------- */
'/world-builder': {
  section: 'world', title: 'World Builder',
  html: () => `
    <span class="eyebrow">REAL-WORLD TERRAIN · 1:1</span>
    <h1>World Builder</h1>
    <p class="lead">Pick a spot on Earth and a size. This pulls <strong>real elevation data</strong> (NASA/SRTM via Terrarium tiles) and <strong>real roads</strong> (OpenStreetMap), then writes you a Roblox Studio script that builds the terrain and roads <strong>1 stud = 1 metre</strong>. Default start: Vienna.</p>

    <div class="callout info"><span class="ico">🌍</span><p>All data is fetched live in your browser from open sources — no keys, no server. Bigger areas take longer and are auto-downsampled so the script stays runnable.</p></div>

    <h2 id="pick">1 · Pick a location</h2>
    <div class="wb-cities" id="wb-cities">
      <button data-lat="48.2082" data-lon="16.3738">🇦🇹 Vienna</button>
      <button data-lat="47.0707" data-lon="15.4395">🇦🇹 Graz</button>
      <button data-lat="46.6247" data-lon="14.3055">🇦🇹 Klagenfurt</button>
      <button data-lat="47.2692" data-lon="11.4041">🇦🇹 Innsbruck</button>
      <button data-lat="45.9763" data-lon="7.6586">🏔️ Matterhorn</button>
      <button data-lat="36.5785" data-lon="-118.2923">🏔️ Mt Whitney</button>
    </div>

    <div class="wb-grid">
      <label class="wb-field"><span>Latitude</span><input id="wb-lat" type="number" step="0.0001" value="48.2082" /></label>
      <label class="wb-field"><span>Longitude</span><input id="wb-lon" type="number" step="0.0001" value="16.3738" /></label>
      <label class="wb-field"><span>Area size</span>
        <select id="wb-size">
          <option value="1">1 × 1 km</option>
          <option value="2">2 × 2 km</option>
          <option value="4">4 × 4 km</option>
          <option value="8">8 × 8 km</option>
          <option value="16">16 × 16 km</option>
        </select>
      </label>
      <label class="wb-field"><span>Detail</span>
        <select id="wb-detail">
          <option value="2">Ultra (2 m)</option>
          <option value="4" selected>High (4 m)</option>
          <option value="8">Medium (8 m)</option>
          <option value="16">Fast (16 m)</option>
        </select>
      </label>
      <label class="wb-check"><input id="wb-roads" type="checkbox" checked /> <span>Include roads (OpenStreetMap)</span></label>
      <label class="wb-check"><input id="wb-water" type="checkbox" checked /> <span>Fill water below sea-ish level</span></label>
    </div>

    <button class="wb-gen" id="wb-gen">⛰️  Generate terrain script</button>
    <div class="wb-status" id="wb-status">Idle — pick a place and hit generate.</div>

    <h2 id="result">2 · Your script</h2>
    <div class="wb-stats" id="wb-stats">No script yet.</div>

    <div class="wb-out-actions">
      <button class="wb-copy" id="wb-copy" disabled>Copy script</button>
      <a class="wb-dl" id="wb-dl" aria-disabled="true">Download .lua</a>
    </div>
    <div class="code wb-codebox"><div class="code-head"><span class="code-lang">lua · paste into Studio</span></div><pre><code id="wb-out">-- generate a script above, then paste it into the Studio Command Bar (View → Command Bar) and press Enter</code></pre></div>

    <h2 id="how">3 · Run it in Studio</h2>
    <ol class="wb-steps">
      <li>Open <strong>Roblox Studio</strong> on a new baseplate.</li>
      <li>Show the Command Bar: <strong>View → Command Bar</strong>.</li>
      <li><strong>Copy</strong> the script above and paste it into the Command Bar, then press <kbd>Enter</kbd>. (For big areas, paste it into a <code class="inline-code">Script</code> and run — the Command Bar has a length limit.)</li>
      <li>Watch the terrain build. It draws in chunks so Studio stays responsive.</li>
    </ol>

    <div class="callout warn"><span class="ico">⚠️</span><p>The Command Bar caps very long input. If the script is large, the <strong>Download .lua</strong> button gives you a file — drop it into <code class="inline-code">ServerScriptService</code> as a <code class="inline-code">Script</code>, run once, then delete it.</p></div>

    ${pager({ href: '/avatars', title: 'Avatar Vault' }, { href: '/roblox-world', title: 'Roblox World Server' })}
  `
},

/* ----------------------- ROBLOX WORLD SERVER ----------------------- */
'/roblox-world': {
  section: 'world', title: 'Roblox World Server',
  html: () => `
    <span class="eyebrow">SERVER-RENDERED · TERRAIN · WATER · ROADS · BUILDINGS</span>
    <h1>Roblox World Server</h1>
    <p class="lead">A heavier sibling of the World Builder. Your <strong>server</strong> does all the data gathering — elevation (SRTM1, 30 m native), water, roads <em>and</em> building footprints from OpenStreetMap — and digests it into tiny JSON. You paste the generated script into the <strong>Studio Command Bar</strong>; it fetches that JSON once with <code class="inline-code">HttpService</code> and bakes the world into your place: terrain heights, water fill, road parts, and <strong>extruded boxy buildings</strong>. One tile at a time, default <strong>3 × 3 km</strong>.</p>

    <div class="callout info"><span class="ico">🧠</span><p>The split: HttpService can only move text, so the box pre-digests everything to numbers and sends it once per tile (cached on disk for instant re-fetch). Roblox just spawns cheap parts and paints terrain. Great in cities, patchy where OSM is sparse — it's procedural and blocky, but it's a real place.</p></div>

    <h2 id="pick">1 · Pick a location &amp; size</h2>
    <div class="wb-cities" id="rw-cities">
      <button data-lat="48.2082" data-lon="16.3738">🇦🇹 Vienna</button>
      <button data-lat="47.0707" data-lon="15.4395">🇦🇹 Graz</button>
      <button data-lat="40.7128" data-lon="-74.0060">🗽 Manhattan</button>
      <button data-lat="51.5074" data-lon="-0.1278">🇬🇧 London</button>
      <button data-lat="35.6586" data-lon="139.7454">🗼 Tokyo</button>
      <button data-lat="37.8199" data-lon="-122.4783">🌉 Golden Gate</button>
    </div>

    <div class="wb-grid">
      <label class="wb-field"><span>Latitude</span><input id="rw-lat" type="number" step="0.0001" value="48.2082" /></label>
      <label class="wb-field"><span>Longitude</span><input id="rw-lon" type="number" step="0.0001" value="16.3738" /></label>
      <label class="wb-field"><span>Tile size</span>
        <select id="rw-size">
          <option value="1000">1 × 1 km</option>
          <option value="2000">2 × 2 km</option>
          <option value="3000" selected>3 × 3 km (default)</option>
          <option value="4000">4 × 4 km</option>
          <option value="6000">6 × 6 km (max)</option>
          <option value="custom">Custom…</option>
        </select>
      </label>
      <label class="wb-field" id="rw-custom-wrap" hidden><span>Custom size (m)</span><input id="rw-custom" type="number" min="250" max="6000" step="50" value="3000" /></label>
    </div>

    <div class="wb-out-actions">
      <button class="wb-gen" id="rw-gen">🧱  Generate Roblox script</button>
      <button class="wb-copy" id="rw-preview">🔎 Preview tile data</button>
    </div>
    <div class="wb-status" id="rw-status">Idle — pick a place and generate. First build of a new tile takes a few seconds (then it's cached).</div>

    <h2 id="result">2 · Your script</h2>
    <div class="wb-stats" id="rw-stats">No script yet.</div>
    <div class="wb-out-actions">
      <button class="wb-copy" id="rw-copy" disabled>Copy script</button>
      <a class="wb-dl" id="rw-dl" aria-disabled="true">Download .lua</a>
    </div>
    <div class="code wb-codebox"><div class="code-head"><span class="code-lang">lua · paste into the Studio Command Bar</span></div><pre><code id="rw-out">-- generate a script above. It fetches your server's /api/world/tile endpoint once, so it stays tiny no matter how big the area is.</code></pre></div>

    <h2 id="how">3 · Run it in Studio</h2>
    <ol class="wb-steps">
      <li>Open <strong>Roblox Studio</strong> on a new baseplate.</li>
      <li>Turn on HTTP: <strong>Game Settings → Security → Allow HTTP Requests</strong>.</li>
      <li>Show the Command Bar: <strong>View → Command Bar</strong>.</li>
      <li><strong>Copy</strong> the script above, paste it into the Command Bar, and press <kbd>Enter</kbd>. The world builds in <em>edit mode</em> — it's baked into your place and saved, with nothing to run at Play time.</li>
    </ol>

    <div class="callout warn"><span class="ico">⚠️</span><p>The script calls <code class="inline-code">${location.origin}/api/world/tile</code> — that URL must be reachable from Roblox (a public host, not <code class="inline-code">localhost</code>). It runs on a background thread so Studio stays responsive while terrain, water, roads and buildings appear.</p></div>

    ${pager({ href: '/world-builder', title: 'Real-World Terrain' }, { href: '/map-drive', title: 'Map Drive' })}
  `
},

/* ----------------------- CPU BUILDER ----------------------- */
'/cpu-builder': {
  section: 'cpu', title: 'CPU Builder',
  html: () => `
    <span class="eyebrow">SANDBOX · CIRCUIT WIRING · TYPED PORTS · AI MARKET</span>
    <h1>Silicon — CPU Builder</h1>
    <p class="lead">Buy components from the marketplace, drop them on the blueprint, and <strong>wire their typed ports together</strong> like a chip architect — clock to control, control to ALU, cache between registers and the memory controller, the memory controller out to memory and the northbridge. Get the graph right and the CPU <em>works</em>; then the physics kicks in (clock, heat, thermal throttle) and an <strong>AI buyer</strong> decides whether your chip is worth the price.</p>

    <div class="callout info"><span class="ico">🔌</span><p><strong>Wiring rules are strict.</strong> Each port has a type — <b>clock</b>, <b>data</b>, <b>address</b>, <b>control</b> — and a direction. A wire only connects matching types with compatible directions (an output to an input or bus). Click a port, then click a compatible one to wire them. Compatible ports glow when you start a wire. Click a wire to delete it.</p></div>

    <div id="cpu-app"><!-- the game mounts here --></div>

    <h2 id="how">How to build a working CPU</h2>
    <ol class="wb-steps">
      <li><strong>Buy the eight core blocks</strong> (Clock, Control Unit, ALU, Registers, a Cache tier, Memory Controller, Memory, Northbridge) from the <b>Shop</b> tab.</li>
      <li><strong>Wire the clock</strong> out to the Control Unit, ALU, Registers and Memory Controller — every timed block needs it.</li>
      <li><strong>Data path:</strong> ALU ↔ Registers ↔ Cache ↔ Memory Controller ↔ Memory, plus Memory Controller ↔ Northbridge ↔ Memory. The Memory Controller's <b>address</b> output must reach Memory.</li>
      <li><strong>Control lines:</strong> Control Unit → ALU.</li>
      <li>When the error list is clear, the CPU works. <strong>Tune the price</strong> against the buyer's fair value and <strong>List for sale</strong>. Selling ships the parts, so you rebuild from the marketplace.</li>
      <li><strong>Upgrade the fab</strong> (lower nm) to raise the clock ceiling and slash heat — the path to high-value chips.</li>
    </ol>

    <div class="callout tip"><span class="ico">🔥</span><p><strong>The physics:</strong> heat ≈ nm × GHz. Old, large transistors running fast get hot, and past <b>88&nbsp;°C</b> the chip thermal-throttles — real clock drops, performance and stability fall. Lower nm runs cooler <em>and</em> clocks higher, so tech upgrades pay off twice. Bigger cache boosts performance but adds heat and cost.</p></div>

    ${pager({ href: '/map-drive', title: 'Map Drive' }, { href: '/quantum', title: 'Quantum Lab' })}
  `
},

/* ----------------------- AI CORES ----------------------- */
'/ai-cores': {
  section: 'ai', title: 'AI Cores',
  html: () => `
    <span class="eyebrow">NEURAL CORES · KITLERNET FAMILY · CPU-TRAINED</span>
    <h1>AI Cores</h1>
    <p class="lead">Three hand-built neural network cores — from a modern CPU-tuned transformer, to a regularization-hardened variant, to a biologically extreme spiking brain. Each tab lays out the <strong>core design</strong>, exactly <strong>how it's made</strong>, its <strong>power level</strong>, and a <strong>downloadable</strong> ready-to-run Python file.</p>

    <div class="callout info"><span class="ico">🧠</span><p>Every core trains on <b>Tiny Shakespeare</b>, clamps to <b>4 CPU threads</b>, and checkpoints so you can <kbd>Ctrl+C</kbd> and resume. Download a core, drop it in your home folder, and run <code class="inline-code">python3 core.py</code>.</p></div>

    ${tabs('aicore', [
      /* ============ v1x ============ */
      { label: '🚀 v1x — Original MoE', body: `
        <div class="aicore-head">
          <div>
            <h3 style="margin:0">KitlerNet v1x</h3>
            <p class="aicore-sub">The first core — a big 2025-stack GPT with a Mixture-of-Experts feed-forward, CPU edition</p>
          </div>
          <span class="aicore-badge original">ORIGINAL</span>
        </div>

        <div class="aicore-power">
          <div class="aicore-power-label">Power level <b>70</b><span>/100 · biggest raw capacity</span></div>
          <div class="aicore-meter"><i style="width:70%"></i></div>
          <div class="aicore-power-legend">The most parameters of the family thanks to MoE, but char-level and un-fused — bold and heavy rather than efficient. The prototype the later cores were refined from.</div>
        </div>

        <div class="aicore-specs">
          <div class="aicore-spec"><span>Type</span><b>Transformer + MoE</b></div>
          <div class="aicore-spec"><span>Parameters</span><b>≈ 110M (top-2 active)</b></div>
          <div class="aicore-spec"><span>Layers</span><b>12 × 512-dim</b></div>
          <div class="aicore-spec"><span>Experts</span><b>4 · route top-2</b></div>
          <div class="aicore-spec"><span>Attention</span><b>GQA · 8 Q / 2 KV heads</b></div>
          <div class="aicore-spec"><span>Tokenizer</span><b>Char-level</b></div>
        </div>

        <h4 class="aicore-h">Core design — go big, add experts</h4>
        <p>v1x already runs the full modern stack (RMSNorm + RoPE + GQA + SwiGLU) but swaps the plain feed-forward for a <strong>Mixture of Experts</strong>: four SwiGLU experts with a learned router that fires only the top-2 per token, so capacity scales without every weight running every step.</p>
        <div class="aicore-flow">
          <span>chars</span><em>→</em><span>embed</span><em>→</em><span class="hl">12× Block</span><em>→</em><span>RMSNorm</span><em>→</em><span>tied&nbsp;head</span>
        </div>
        <div class="aicore-flow sub">
          <span>Block =</span><span>RMSNorm</span><em>→</em><span class="hl">GQA + RoPE</span><em>→</em><span>+residual</span><em>→</em><span>RMSNorm</span><em>→</em><span class="hl">MoE (4×SwiGLU)</span><em>→</em><span>+residual</span>
        </div>

        <h4 class="aicore-h">How it's made</h4>
        <ol class="wb-steps">
          <li><strong>Mixture of Experts:</strong> a router scores 4 SwiGLU experts per token, softmaxes the top-2, and blends only those — big model, sparse compute.</li>
          <li><strong>GQA</strong> with 8 query heads sharing 2 KV heads (4× less attention memory), RoPE rotary positions, causal-masked manual attention.</li>
          <li><strong>Weight tying</strong> between token embedding and output head; RMSNorm throughout.</li>
          <li><strong>Training:</strong> AdamW, warmup + linear decay LR, grad-accum ×4, grad-clip 1.0, best-val checkpoint + auto-resume.</li>
          <li><strong>CPU edition:</strong> 8 threads, oneDNN — no <code class="inline-code">torch.compile</code> and no BPE yet, which is exactly what v2x fixed for speed.</li>
        </ol>

        ${code('python — the MoE router', `<span class="tok-kw">def</span> <span class="tok-fn">forward</span>(self, x):
    logits = self.router(flat)
    weights, idx = torch.topk(logits, <span class="tok-num">2</span>, dim=-<span class="tok-num">1</span>)   <span class="tok-com"># top-2 experts</span>
    weights = F.softmax(weights, dim=-<span class="tok-num">1</span>)
    <span class="tok-kw">for</span> e, expert <span class="tok-kw">in</span> <span class="tok-fn">enumerate</span>(self.experts):
        mask = (idx == e).any(dim=-<span class="tok-num">1</span>)          <span class="tok-com"># route tokens</span>
        out[mask] += expert(flat[mask]) * w`)}

        <div class="callout tip"><span class="ico">🚀</span><p><strong>Lineage:</strong> v1x proved the stack works. v2x traded MoE + char-level for BPE + <code class="inline-code">torch.compile</code> to run far faster per token; v3x then hardened it against overfitting.</p></div>

        <a class="aicore-dl" href="assets/cores/kitlernet_v1x.py" download>⬇ Download kitlernet_v1x.py</a>
      ` },

      /* ============ v2x ============ */
      { label: '⚙️ v2x — Transformer', body: `
        <div class="aicore-head">
          <div>
            <h3 style="margin:0">KitlerNet v2x</h3>
            <p class="aicore-sub">Dense decoder-only transformer, tuned for an i3-14100F (AVX2, 4 cores)</p>
          </div>
          <span class="aicore-badge stable">STABLE</span>
        </div>

        <div class="aicore-power">
          <div class="aicore-power-label">Power level <b>78</b><span>/100 · production-lite language core</span></div>
          <div class="aicore-meter"><i style="width:78%"></i></div>
          <div class="aicore-power-legend">Balanced. A real, modern LLM stack sized so each training step stays snappy on four cores.</div>
        </div>

        <div class="aicore-specs">
          <div class="aicore-spec"><span>Type</span><b>Transformer (GPT-style)</b></div>
          <div class="aicore-spec"><span>Parameters</span><b>≈ 20M</b></div>
          <div class="aicore-spec"><span>Layers</span><b>8 × 384-dim</b></div>
          <div class="aicore-spec"><span>Attention</span><b>GQA · 6 Q / 2 KV heads</b></div>
          <div class="aicore-spec"><span>Context</span><b>256 tokens</b></div>
          <div class="aicore-spec"><span>Tokenizer</span><b>BPE · 4096 vocab</b></div>
        </div>

        <h4 class="aicore-h">Core design — the 2025 stack, bias-free</h4>
        <p>Every layer is the modern recipe: pre-norm residual blocks with rotary attention and a gated MLP. No biases, weights tied between the embedding and the output head.</p>
        <div class="aicore-flow">
          <span>tokens</span><em>→</em><span>BPE&nbsp;embed</span><em>→</em><span class="hl">8× Block</span><em>→</em><span>RMSNorm</span><em>→</em><span>tied&nbsp;head</span><em>→</em><span>logits</span>
        </div>
        <div class="aicore-flow sub">
          <span>Block =</span><span>RMSNorm</span><em>→</em><span class="hl">GQA + RoPE</span><em>→</em><span>+residual</span><em>→</em><span>RMSNorm</span><em>→</em><span class="hl">SwiGLU</span><em>→</em><span>+residual</span>
        </div>

        <h4 class="aicore-h">How it's made</h4>
        <ol class="wb-steps">
          <li><strong>RMSNorm</strong> instead of LayerNorm — cheaper, no mean-subtraction, one learned scale per dim.</li>
          <li><strong>RoPE</strong> rotary position encoding baked into Q/K, so position is relative and length-flexible.</li>
          <li><strong>Grouped-Query Attention</strong> — 6 query heads share just 2 key/value heads, cutting the KV footprint ~3× while <code class="inline-code">scaled_dot_product_attention</code> handles causal masking with no T×T matrix.</li>
          <li><strong>SwiGLU</strong> feed-forward (<code class="inline-code">w3(silu(w1·x) * w2·x)</code>), hidden size rounded to a multiple of 64 so matmuls stay AVX2-friendly.</li>
          <li><strong>CPU speed levers:</strong> <code class="inline-code">torch.compile</code> Inductor (max-autotune AVX2 kernels), thread pinning to the 4 real cores, oneDNN matmul, cached BPE token stream.</li>
          <li><strong>Training:</strong> AdamW, cosine LR with warmup, grad-clip 1.0, grad-accum for an effective batch of 32, best-val checkpointing.</li>
        </ol>

        ${code('python — the transformer block', `<span class="tok-kw">class</span> <span class="tok-fn">Block</span>(nn.Module):
    <span class="tok-kw">def</span> <span class="tok-fn">forward</span>(self, x):
        x = x + self.att(self.n1(x))   <span class="tok-com"># RMSNorm → GQA+RoPE</span>
        x = x + self.ff(self.n2(x))    <span class="tok-com"># RMSNorm → SwiGLU</span>
        <span class="tok-kw">return</span> x`)}

        <a class="aicore-dl" href="assets/cores/kitlernet_v2x.py" download>⬇ Download kitlernet_v2x.py</a>
      ` },

      /* ============ v3x ============ */
      { label: '🛡️ v3x — Hardened', body: `
        <div class="aicore-head">
          <div>
            <h3 style="margin:0">KitlerNet v3x</h3>
            <p class="aicore-sub">v2x's architecture wrapped in full anti-overfit armor — PaLM z-loss, label smoothing, targeted decay</p>
          </div>
          <span class="aicore-badge flagship">FLAGSHIP</span>
        </div>

        <div class="aicore-power">
          <div class="aicore-power-label">Power level <b>88</b><span>/100 · best generalization</span></div>
          <div class="aicore-meter"><i style="width:88%"></i></div>
          <div class="aicore-power-legend">The strongest core for real training runs: same brain as v2x, but far harder to overfit and more stable at high confidence.</div>
        </div>

        <div class="aicore-specs">
          <div class="aicore-spec"><span>Type</span><b>Regularized Transformer</b></div>
          <div class="aicore-spec"><span>Parameters</span><b>≈ 20M</b></div>
          <div class="aicore-spec"><span>Weight decay</span><b>0.25 (isolated)</b></div>
          <div class="aicore-spec"><span>Label smoothing</span><b>0.1</b></div>
          <div class="aicore-spec"><span>Z-loss coeff</span><b>1e-4</b></div>
          <div class="aicore-spec"><span>Dropout</span><b>0.1 attn + residual</b></div>
        </div>

        <h4 class="aicore-h">Core design — same body, reinforced training</h4>
        <p>v3x keeps the RMSNorm + RoPE + GQA + SwiGLU skeleton and adds four independent regularizers that each attack a different overfitting failure mode.</p>
        <div class="aicore-flow">
          <span>logits</span><em>→</em><span class="hl">CE + label-smooth</span><em>+</em><span class="hl">z-loss·logsumexp²</span><em>→</em><span>loss</span>
        </div>

        <h4 class="aicore-h">How it's made — the four-layer armor</h4>
        <ol class="wb-steps">
          <li><strong>PaLM logit z-loss</strong> — penalizes <code class="inline-code">logsumexp(logits)²</code> so the network can't inflate raw logits; keeps the softmax well-conditioned.</li>
          <li><strong>Label smoothing 0.1</strong> — stops the model chasing 100% confidence, which improves calibration and generalization.</li>
          <li><strong>Targeted weight decay 0.25</strong> — a hard L2 penalty, but norm layers and biases are split into a separate zero-decay parameter group so only real weight matrices get pulled toward zero.</li>
          <li><strong>Structural dropout 0.1</strong> — added on attention scores <em>and</em> residual paths inside every block.</li>
          <li><strong>Early stopping</strong> on validation loss — only the best-val configuration is saved.</li>
        </ol>

        ${code('python — the reinforced loss', `<span class="tok-kw">def</span> <span class="tok-fn">compute_palm_loss</span>(logits, targets):
    ce = F.cross_entropy(logits_flat, targets_flat,
                         label_smoothing=<span class="tok-num">0.1</span>)   <span class="tok-com"># calibration</span>
    z  = <span class="tok-num">1e-4</span> * (torch.logsumexp(logits, -1) ** <span class="tok-num">2</span>).mean()  <span class="tok-com"># PaLM z-loss</span>
    <span class="tok-kw">return</span> ce + z`)}

        <div class="callout tip"><span class="ico">🛡️</span><p><strong>When to pick v3x over v2x:</strong> any run long enough to start memorizing the data. Same speed per step, dramatically better validation behavior.</p></div>

        <a class="aicore-dl" href="assets/cores/kitlernet_v3x.py" download>⬇ Download kitlernet_v3x.py</a>
      ` },

      /* ============ MaximalBio — a family of bio/plastic models ============ */
      { label: '🧬 MaximalBio — Bio Lab', body: `
        <div class="aicore-head">
          <div>
            <h3 style="margin:0">MaximalBio — Biological & Plastic Cores</h3>
            <p class="aicore-sub">Not one model but a lab of experimental brains: spiking cortex, fast-weight programmers, cross-layer plasticity, and continual Hebbian learning. Pick a model below — each has its own power and features.</p>
          </div>
          <span class="aicore-badge experimental">LAB</span>
        </div>

        <div class="callout info"><span class="ico">🧪</span><p>These four share one idea — <strong>weights that change while the network runs</strong> — taken to different extremes. All are char-level, CPU-clamped, and download separately.</p></div>

        ${subtabs('aicorebio', [
          /* ---- Spiking ---- */
          { label: '⚡ Spiking (SNN)', body: `
            <div class="aicore-head">
              <div><h4 style="margin:0">KitlerNet-MaximalBio</h4>
              <p class="aicore-sub">A biologically extreme spiking cortical network — six interacting brain mechanisms, no plain backprop MLP</p></div>
              <span class="aicore-badge experimental">SNN</span>
            </div>
            <div class="aicore-power">
              <div class="aicore-power-label">Power level <b>45</b><span>/100 · neuromorphic</span></div>
              <div class="aicore-meter"><i style="width:45%"></i></div>
              <div class="aicore-power-legend">Lowest raw text quality, highest biological realism — it learns the way a cortex does, not the way a GPT does.</div>
            </div>
            <div class="aicore-specs">
              <div class="aicore-spec"><span>Type</span><b>Spiking Neural Net</b></div>
              <div class="aicore-spec"><span>Neurons</span><b>LIF · 2 × 192</b></div>
              <div class="aicore-spec"><span>Learning</span><b>STDP + backprop</b></div>
              <div class="aicore-spec"><span>Context</span><b>96 chars</b></div>
              <div class="aicore-spec"><span>Plasticity</span><b>Dopamine-gated</b></div>
              <div class="aicore-spec"><span>Delays</span><b>1–3 step axonal</b></div>
            </div>
            <h4 class="aicore-h">Features — six mechanisms per cortical layer</h4>
            <div class="aicore-mech">
              <div class="aicore-m"><b>1 · LIF neurons</b><p>Leaky integrate-and-fire membranes with a surrogate-gradient spike (Heaviside forward, fast-sigmoid backward).</p></div>
              <div class="aicore-m"><b>2 · STDP</b><p>Unsupervised pre/post spike-timing traces grow a local plastic weight matrix — LTP minus LTD.</p></div>
              <div class="aicore-m"><b>3 · Homeostasis</b><p>Each neuron tracks its firing rate and nudges its own threshold toward a target frequency.</p></div>
              <div class="aicore-m"><b>4 · Lateral inhibition</b><p>A spike injects negative current into neighbors next step — winner-take-all competition.</p></div>
              <div class="aicore-m"><b>5 · Dopamine gating</b><p>A global reward scalar scales every STDP update; a sharp loss drop doubles plasticity.</p></div>
              <div class="aicore-m"><b>6 · Axonal delays</b><p>Each neuron routes its spike 1–3 steps into the future through a delay buffer.</p></div>
            </div>
            <h4 class="aicore-h">How it's made</h4>
            <ol class="wb-steps">
              <li>Chars embed + position, then flow through <strong>2 cortical layers</strong>, each a full simulation loop over 96 time-steps.</li>
              <li>Every step integrates input, fires against homeostatic thresholds, resets, then applies inhibition, delays, STDP and dopamine — all <em>outside</em> autograd.</li>
              <li>Only task synapses + readout train via <strong>AdamW</strong>; the six bio-mechanisms self-organize locally.</li>
              <li>Eval reports <strong>homeostatic threshold stability</strong> (vth std + mean rate per layer) alongside loss.</li>
            </ol>
            ${code('python — surrogate-gradient spike', `<span class="tok-kw">class</span> <span class="tok-fn">SurrogateSpike</span>(torch.autograd.Function):
    <span class="tok-kw">def</span> <span class="tok-fn">forward</span>(ctx, v):
        <span class="tok-kw">return</span> (v > <span class="tok-num">0</span>).float()                 <span class="tok-com"># sharp Heaviside</span>
    <span class="tok-kw">def</span> <span class="tok-fn">backward</span>(ctx, g):
        <span class="tok-kw">return</span> g * (<span class="tok-num">1</span> / (<span class="tok-num">10</span>*v.abs() + <span class="tok-num">1</span>)**<span class="tok-num">2</span>)  <span class="tok-com"># fast-sigmoid</span>`)}
            <a class="aicore-dl" href="assets/cores/kitlernet_maximalbio.py" download>⬇ Download kitlernet_maximalbio.py</a>
          ` },

          /* ---- FWP ---- */
          { label: '🧩 FWP', body: `
            <div class="aicore-head">
              <div><h4 style="margin:0">KitlerNet-FWP</h4>
              <p class="aicore-sub">Fast Weight Programmer — the hidden state writes its own low-rank delta-weights every token (Schmidhuber '92 / Schlag '21)</p></div>
              <span class="aicore-badge original">BASE</span>
            </div>
            <div class="aicore-power">
              <div class="aicore-power-label">Power level <b>60</b><span>/100 · foundation</span></div>
              <div class="aicore-meter"><i style="width:60%"></i></div>
              <div class="aicore-power-legend">The clean, fully-differentiable fast-weight core the other two plastic models build on. Transformer attention + one dynamic FFN layer.</div>
            </div>
            <div class="aicore-specs">
              <div class="aicore-spec"><span>Type</span><b>Fast-weight transformer</b></div>
              <div class="aicore-spec"><span>Size</span><b>4 × 256-dim</b></div>
              <div class="aicore-spec"><span>Fast weight</span><b>Rank-4 outer product</b></div>
              <div class="aicore-spec"><span>Attention</span><b>4-head SDPA</b></div>
              <div class="aicore-spec"><span>Context</span><b>128 chars</b></div>
              <div class="aicore-spec"><span>Params</span><b>≈ 4M</b></div>
            </div>
            <h4 class="aicore-h">Features</h4>
            <ul>
              <li><strong>Per-token dynamic weights</strong> — the FFN's first projection is <code class="inline-code">W0 + a·bᵀ</code>, where a and b are generated from the token itself.</li>
              <li><strong>Memory-tractable</strong> — the delta never materializes a full d×d matrix; two einsums keep it CPU-feasible.</li>
              <li><strong>Fully differentiable</strong> end-to-end — no local rules, just backprop through the hypernetwork.</li>
            </ul>
            <h4 class="aicore-h">How it's made</h4>
            <div class="aicore-flow"><span>x</span><em>→</em><span class="hl">W0·x</span><em>+</em><span class="hl">(x·b)·a</span><em>→</em><span>y</span></div>
            <p>Standard RMSNorm + SDPA attention block, then a fast-weight GELU FFN. The generators <code class="inline-code">gen_a</code> / <code class="inline-code">gen_b</code> map the hidden state to the two rank-4 vectors that modulate the projection.</p>
            ${code('python — the fast-weight linear', `<span class="tok-kw">def</span> <span class="tok-fn">forward</span>(self, x):
    base  = self.W0(x)                              <span class="tok-com"># static weight</span>
    a = self.gen_a(x).view(B,T,rank,D)
    b = self.gen_b(x).view(B,T,rank,D)
    coeff = torch.einsum(<span class="tok-str">"btd,btrd->btr"</span>, x, b)   <span class="tok-com"># x · b</span>
    fast  = torch.einsum(<span class="tok-str">"btr,btrd->btd"</span>, coeff, a) <span class="tok-com"># (x·b)·a</span>
    <span class="tok-kw">return</span> base + self.scale*fast`)}
            <a class="aicore-dl" href="assets/cores/kitlernet_fwp.py" download>⬇ Download kitlernet_fwp.py</a>
          ` },

          /* ---- SCLP ---- */
          { label: '🔀 SCLP', body: `
            <div class="aicore-head">
              <div><h4 style="margin:0">KitlerNet-SCLP</h4>
              <p class="aicore-sub">Sequential Cross-Layer Plasticity — every projection is a fast-weight layer, modulated by feedback from the layers above and below</p></div>
              <span class="aicore-badge flagship">ENTANGLED</span>
            </div>
            <div class="aicore-power">
              <div class="aicore-power-label">Power level <b>66</b><span>/100 · cross-wired</span></div>
              <div class="aicore-meter"><i style="width:66%"></i></div>
              <div class="aicore-power-legend">FWP taken everywhere (Q,K,V,O + both FFN matrices) and wired vertically between layers — bidirectional influence that stays a strict DAG per step.</div>
            </div>
            <div class="aicore-specs">
              <div class="aicore-spec"><span>Type</span><b>Cross-layer fast-weight</b></div>
              <div class="aicore-spec"><span>Size</span><b>4 × 256-dim</b></div>
              <div class="aicore-spec"><span>Fast weight</span><b>6 per block</b></div>
              <div class="aicore-spec"><span>Feedback</span><b>N−1 now + N+1 delayed</b></div>
              <div class="aicore-spec"><span>Reg.</span><b>z-loss · 0.3 decay</b></div>
              <div class="aicore-spec"><span>Params</span><b>≈ 15M</b></div>
            </div>
            <h4 class="aicore-h">Features</h4>
            <ul>
              <li><strong>Fast weights everywhere</strong> — all attention projections <em>and</em> both FFN matrices are dynamically modulated, not just one FFN layer.</li>
              <li><strong>Cross-layer feedback</strong> — each layer's modulation is conditioned on layer N−1's current output and layer N+1's <em>previous-step</em> output.</li>
              <li><strong>Deadlock-free</strong> — the delayed N+1 wire keeps the whole thing a valid DAG within a step while still feeling bidirectional.</li>
              <li><strong>Hardened</strong> — z-loss + label smoothing + isolated 0.3 weight decay.</li>
            </ul>
            <h4 class="aicore-h">How it's made</h4>
            <div class="aicore-flow"><span>fb: N−1 now</span><em>+</em><span>N+1 delayed</span><em>→</em><span class="hl">fuse → mod</span><em>→</em><span>drives every fast weight</span></div>
            ${code('python — cross-layer modulation', `mod = self.fuse(torch.cat([fb_prev_layer, fb_next_delayed], -<span class="tok-num">1</span>))
q = self.q(h, mod); k = self.k(h, mod); v = self.v(h, mod)  <span class="tok-com"># all fast-weight</span>
<span class="tok-com"># fb_prev = layer N-1 this step · fb_next = layer N+1 last step</span>`)}
            <a class="aicore-dl" href="assets/cores/kitlernet_sclp.py" download>⬇ Download kitlernet_sclp.py</a>
          ` },

          /* ---- CHH ---- */
          { label: '♾️ CHH', body: `
            <div class="aicore-head">
              <div><h4 style="margin:0">KitlerNet-CHH</h4>
              <p class="aicore-sub">Continuous Hebbian Hybrid — persistent Hebbian memory traces carried across token-steps, plus a local predictive-coding loss</p></div>
              <span class="aicore-badge flagship">CONTINUAL</span>
            </div>
            <div class="aicore-power">
              <div class="aicore-power-label">Power level <b>68</b><span>/100 · self-adapting</span></div>
              <div class="aicore-meter"><i style="width:68%"></i></div>
              <div class="aicore-power-legend">The most capable plastic core: memory that persists across steps and keeps adapting <em>during generation</em>, guided by per-block predictive coding.</div>
            </div>
            <div class="aicore-specs">
              <div class="aicore-spec"><span>Type</span><b>Hebbian fast-weight</b></div>
              <div class="aicore-spec"><span>Size</span><b>4 × 256-dim</b></div>
              <div class="aicore-spec"><span>Memory</span><b>Persistent trace M</b></div>
              <div class="aicore-spec"><span>Decay λ</span><b>0.9</b></div>
              <div class="aicore-spec"><span>Aux loss</span><b>Local predictive coding</b></div>
              <div class="aicore-spec"><span>Params</span><b>≈ 15M</b></div>
            </div>
            <h4 class="aicore-h">Features</h4>
            <ul>
              <li><strong>Persistent Hebbian traces</strong> — each fast-weight layer carries a memory <code class="inline-code">M ← λ·M + a⊗b</code> across token-steps, differentiable within a step.</li>
              <li><strong>Local predictive coding</strong> — every block predicts the next block's input; the summed error is added to the global loss.</li>
              <li><strong>Live streaming adaptation</strong> — during generation the traces keep updating per token, so the model tunes to the context as it reads.</li>
              <li><strong>Hardened</strong> — z-loss + label smoothing + isolated 0.3 weight decay.</li>
            </ul>
            <h4 class="aicore-h">How it's made</h4>
            <div class="aicore-flow"><span>a⊗b this step</span><em>→</em><span class="hl">M = λM + a⊗b</span><em>→</em><span>x·M = fast term</span><em>→</em><span>carry M forward</span></div>
            ${code('python — the persistent trace', `hebb = torch.einsum(<span class="tok-str">"btrd,btre->bde"</span>, a, b) / (T*rank)
M = HEBB_LAMBDA * self.M + hebb        <span class="tok-com"># accumulate across steps</span>
self.M = M.detach()                    <span class="tok-com"># carry forward, cut graph</span>
fast = torch.einsum(<span class="tok-str">"btd,bde->bte"</span>, x, M)  <span class="tok-com"># apply memory</span>`)}
            <a class="aicore-dl" href="assets/cores/kitlernet_chh.py" download>⬇ Download kitlernet_chh.py</a>
          ` },
        ])}
      ` },
    ])}

    <h2 id="compare">Core comparison</h2>
    <div class="aicore-table-wrap">
      <table class="aicore-table">
        <thead><tr><th>Core</th><th>Paradigm</th><th>Params</th><th>Power</th><th>Best for</th></tr></thead>
        <tbody>
          <tr><td><b>v1x</b></td><td>Transformer + MoE</td><td>≈110M</td><td>70</td><td>Biggest raw capacity, original prototype</td></tr>
          <tr><td><b>v2x</b></td><td>Transformer</td><td>≈20M</td><td>78</td><td>Fast, clean baseline text generation</td></tr>
          <tr><td><b>v3x</b></td><td>Regularized transformer</td><td>≈20M</td><td>88</td><td>Long runs without overfitting</td></tr>
          <tr class="aicore-grouprow"><td colspan="5">🧬 MaximalBio — Bio Lab</td></tr>
          <tr><td><b>· Spiking</b></td><td>Spiking neural net</td><td>~1M</td><td>45</td><td>Neuromorphic / biological research</td></tr>
          <tr><td><b>· FWP</b></td><td>Fast-weight transformer</td><td>≈4M</td><td>60</td><td>Clean per-token dynamic weights</td></tr>
          <tr><td><b>· SCLP</b></td><td>Cross-layer fast-weight</td><td>≈15M</td><td>66</td><td>Vertically entangled plasticity</td></tr>
          <tr><td><b>· CHH</b></td><td>Hebbian fast-weight</td><td>≈15M</td><td>68</td><td>Continual, self-adapting memory</td></tr>
        </tbody>
      </table>
    </div>

    ${pager({ href: '/cpu-builder', title: 'CPU Builder' }, { href: '/map-drive', title: 'Map Drive' })}
  `
},

/* ----------------------- MAP DRIVE ----------------------- */
'/map-drive': {
  section: 'drive', title: 'Map Drive',
  html: () => `
    <span class="eyebrow">LIVE SATELLITE · MULTIPLAYER</span>
    <h1>Map Drive</h1>
    <p class="lead">Make an account, spawn into a shared satellite world, and drive real roads with other players. Pick from sedans and a humble Golf 1.9 SDI, hop out and walk around — everyone sees your name and your parked car.</p>

    <div class="mg-wrap" id="mg-wrap">
      <div id="mg-map"></div>

      <!-- AUTH / SPAWN overlay -->
      <div class="mg-auth" id="mg-auth">
        <div class="mg-auth-card">
          <div class="mg-auth-stage" id="mg-stage-auth">
            <h2>Map Drive</h2>
            <div class="mg-auth-tabs" id="mg-auth-tabs">
              <button class="active" data-at="login">Log in</button>
              <button data-at="register">Create account</button>
            </div>
            <input id="mg-user" placeholder="username" autocomplete="username" maxlength="16" />
            <input id="mg-pass" type="password" placeholder="password" autocomplete="current-password" />
            <button class="mg-auth-go" id="mg-auth-go">Log in &amp; continue</button>
            <div class="mg-auth-msg" id="mg-auth-msg"></div>
          </div>

          <div class="mg-auth-stage" id="mg-stage-spawn" hidden>
            <h2>Choose a spawn</h2>
            <p class="mg-welcome" id="mg-welcome"></p>
            <div class="mg-spawn-list" id="mg-spawn-list"></div>
            <button class="mg-auth-go" id="mg-spawn-go">Spawn ▸</button>
          </div>
        </div>
      </div>

      <!-- top-left controls -->
      <div class="mg-panel mg-controls" id="mg-controls" hidden>
        <div class="mg-mode" id="mg-mode">🚗 Driving</div>
        <div class="mg-row">
          <input id="mg-setspeed" type="number" value="50" min="0" max="280" />
          <span class="mg-unit">km/h</span>
          <button id="mg-setbtn">Set</button>
        </div>
        <div class="mg-row mg-presets" id="mg-presets">
          <button data-v="30">30</button><button data-v="50">50</button>
          <button data-v="80">80</button><button data-v="130">130</button>
        </div>
        <div class="mg-row mg-btnrow">
          <button class="mg-shopbtn" id="mg-shopbtn">🛒 Shop</button>
          <button class="mg-stop" id="mg-stop">■ Stop</button>
        </div>
        <button class="mg-toggle" id="mg-toggle">🚶 Leave car (E)</button>
        <div class="mg-hint" id="mg-hint">Click the map → drive there. Scroll to zoom.</div>
      </div>

      <!-- top-right menu + inventory buttons -->
      <div class="mg-topbar" id="mg-topbar" hidden>
        <button class="mg-iconbtn" id="mg-inv-btn" title="Inventory (I)">🎒</button>
        <button class="mg-iconbtn" id="mg-menu-btn" title="Menu">☰</button>
      </div>

      <!-- MAIN MENU -->
      <div class="mg-menu" id="mg-menu" hidden>
        <div class="mg-menu-head"><span>Menu</span><button id="mg-menu-close">✕</button></div>
        <button class="mg-menu-item" id="mg-menu-respawn">🎯 Respawn — pick a new location</button>
        <button class="mg-menu-item" id="mg-menu-inv">🎒 Inventory</button>
        <button class="mg-menu-item" id="mg-menu-shop">🛒 Garage / Shop</button>
        <button class="mg-menu-item mg-menu-danger" id="mg-menu-logout">🚪 Log out</button>
      </div>

      <!-- INVENTORY -->
      <div class="mg-inv" id="mg-inv" hidden>
        <div class="mg-inv-head"><span>Inventory</span><button id="mg-inv-close">✕</button></div>
        <div class="mg-inv-grid" id="mg-inv-grid"></div>
        <div class="mg-inv-detail" id="mg-inv-detail">Select an item to inspect it.</div>
      </div>

      <!-- RESPAWN PICKER bar -->
      <div class="mg-respawn-bar" id="mg-respawn-bar" hidden>
        <div class="mg-respawn-txt" id="mg-respawn-txt">Pan &amp; zoom the world, then click where you want to respawn.</div>
        <div class="mg-respawn-btns">
          <button class="mg-respawn-confirm" id="mg-respawn-confirm" disabled>Spawn here ▸</button>
          <button class="mg-respawn-cancel" id="mg-respawn-cancel">Cancel</button>
        </div>
      </div>

      <!-- SHOP -->
      <div class="mg-shop" id="mg-shop" hidden>
        <div class="mg-shop-head"><span>Garage</span><button id="mg-shop-close">✕</button></div>
        <div class="mg-shop-list" id="mg-shop-list"></div>
      </div>

      <!-- bottom dashboard (compact) -->
      <div class="mg-dash2" id="mg-dash2" hidden>
        <canvas id="mg-speedo" width="120" height="120"></canvas>
        <div class="mg-dash-nums">
          <div class="mg-kmh-wrap"><b id="mg-kmh">0</b><span>km/h</span></div>
          <div class="mg-rpm-wrap"><b id="mg-rpm">900</b><span>rpm</span></div>
          <div class="mg-gear-wrap">Gear <b id="mg-gear">N</b></div>
        </div>
      </div>

      <!-- mobile joystick + action button -->
      <div class="mg-joy" id="mg-joy" hidden><div class="mg-joy-thumb" id="mg-joy-thumb"></div></div>
      <button class="mg-action" id="mg-action" hidden>Enter (T)</button>

      <!-- centred local entity overlays + label -->
      <div class="mg-ent mg-car" id="mg-car" hidden><div class="mg-car-rot" id="mg-car-rot"></div></div>
      <div class="mg-ent mg-person" id="mg-person" hidden><div class="mg-person-rot" id="mg-person-rot">
        <div class="mg-p-body"></div><div class="mg-p-face"></div>
      </div></div>
      <div class="mg-axe" id="mg-axe" hidden>🪓</div>
      <div class="mg-mylabel" id="mg-mylabel" hidden></div>

      <!-- remote players + parked cars get injected here -->
      <div class="mg-remotes" id="mg-remotes"></div>

      <!-- doorway highlights (one per building, shown within 40 m) -->
      <div class="mg-doors" id="mg-doors"></div>

      <!-- interior view — covers the map while you're inside a building -->
      <canvas class="mg-interior" id="mg-interior" hidden></canvas>
    </div>

    <div class="callout info"><span class="ico">🛰️</span><p><strong>PC:</strong> click the map to drive there · <kbd>WASD</kbd>/<kbd>Shift</kbd> to walk &amp; run · <kbd>E</kbd> to enter/leave the car. <strong>Android:</strong> tap to drive · on-screen joystick to walk · the <strong>T</strong> button to enter/leave. Names float above every player; your parked car shows its model where you left it.</p></div>

    <div class="callout tip"><span class="ico">🚪</span><p><strong>Step inside.</strong> On foot, walk up to any building — a 🚪 doorway lights up when you're within 40&nbsp;m (one realistic entrance per building). Reach it and press <kbd>E</kbd> (or <strong>T</strong> on mobile) to enter a procedurally-built interior — rooms, furniture and all, generated from that building's real size. Each interior is deterministic, so a given building always looks the same. Walk back onto the glowing <strong>EXIT</strong> to step out where you came in.</p></div>
  `
},

/* ----------------------- QUANTUM LAB ----------------------- */
'/quantum': {
  section: 'quantum', title: 'The Lab',
  html: () => `
    <span class="eyebrow">QUANTUM LAB</span>
    <h1>The Quantum Lab</h1>
    <p class="lead">Where we write code the way no one was supposed to. Each experiment steals an idea from quantum mechanics and bends ordinary programming around it — not for a grade, but to see what becomes possible.</p>

    <div class="hero">
      <p style="margin:0;font-family:var(--mono);font-size:14px;color:var(--ink)"><span class="tok-com">// thesis</span><br/>Classical code asks <span class="tok-str">"what is the answer?"</span><br/>Quantum-style code asks <span class="tok-str">"what are <em>all</em> the answers, and which one survives observation?"</span></p>
    </div>

    <h2 id="ethos">The ethos</h2>
    <p>These aren't toy demos. They're runnable Python/JS, but the <em>way</em> they model computation is the experiment: variables that hold many values at once, data structures that "collapse" only when read, search that interferes with itself to find answers faster.</p>

    <div class="card-grid">
      <a class="card" href="#/q-superposition" data-link><div class="card-icon">🌓</div><h4>01 · Superposition Engine</h4><p>A value that is many values until you look.</p></a>
      <a class="card" href="#/q-entangle" data-link><div class="card-icon">🔗</div><h4>02 · Entangled Variables</h4><p>Change one, the other answers instantly.</p></a>
      <a class="card" href="#/q-walk" data-link><div class="card-icon">🚶</div><h4>03 · Quantum Walk Search</h4><p>Search that spreads quadratically faster.</p></a>
      <a class="card" href="#/q-anneal" data-link><div class="card-icon">🔥</div><h4>04 · Reality Annealer</h4><p>Cool a problem until only the solution remains.</p></a>
    </div>

    <div class="callout warn"><span class="ico">🧪</span><p>This is conceptual / educational code — a sandbox for thinking, not a physics simulator. The revolution is in the <em>approach</em>, and approaches are where breakthroughs hide.</p></div>
    ${pager({ href: '/bf-tips', title: 'Pro Tips' }, { href: '/q-superposition', title: 'Exp 01 · Superposition' })}
  `
},

'/q-superposition': {
  section: 'quantum', title: 'Exp 01 · Superposition Engine',
  html: () => `
    <span class="eyebrow">EXPERIMENT 01</span>
    <h1>The Superposition Engine</h1>
    <p class="lead">A variable that holds every possible value at once — with a probability for each — and only commits to one when you <em>measure</em> it.</p>

    <h2 id="idea">The radical idea</h2>
    <p>In normal code, <code class="inline-code">x = 5</code> and that's final. Here, <code class="inline-code">x</code> is a cloud of weighted possibilities. You can do math on the <em>whole cloud at once</em>, and only collapse to a single outcome at the very end. It's lazy evaluation taken to a philosophical extreme.</p>

    ${tabs('qsup', [
      { label: '🐍 Python', body: code('python', `<span class="tok-key">import</span> random, math
<span class="tok-key">from</span> collections <span class="tok-key">import</span> defaultdict

<span class="tok-key">class</span> <span class="tok-fn">Qubit</span>:
    <span class="tok-com">"""A value in superposition: {state: amplitude}."""</span>
    <span class="tok-key">def</span> <span class="tok-fn">__init__</span>(self, states):
        self.states = states  <span class="tok-com"># {value: amplitude}</span>

    <span class="tok-key">def</span> <span class="tok-fn">apply</span>(self, fn):
        <span class="tok-com"># transform EVERY possibility at once — no branching</span>
        out = defaultdict(<span class="tok-fn">complex</span>)
        <span class="tok-key">for</span> v, amp <span class="tok-key">in</span> self.states.items():
            out[fn(v)] += amp
        <span class="tok-key">return</span> Qubit(<span class="tok-fn">dict</span>(out))

    <span class="tok-key">def</span> <span class="tok-fn">measure</span>(self):
        <span class="tok-com"># collapse: probability = |amplitude|^2</span>
        probs = {v: <span class="tok-fn">abs</span>(a)**<span class="tok-num">2</span> <span class="tok-key">for</span> v, a <span class="tok-key">in</span> self.states.items()}
        total = <span class="tok-fn">sum</span>(probs.values())
        r, acc = random.random() * total, <span class="tok-num">0</span>
        <span class="tok-key">for</span> v, p <span class="tok-key">in</span> probs.items():
            acc += p
            <span class="tok-key">if</span> r <= acc: <span class="tok-key">return</span> v

<span class="tok-com"># a value that is 0 AND 1 at the same time</span>
h = <span class="tok-num">1</span>/math.sqrt(<span class="tok-num">2</span>)
bit = Qubit({<span class="tok-num">0</span>: h, <span class="tok-num">1</span>: h})

<span class="tok-com"># operate on both realities simultaneously</span>
doubled = bit.apply(<span class="tok-key">lambda</span> x: x * <span class="tok-num">10</span>)
<span class="tok-fn">print</span>(doubled.measure())  <span class="tok-com"># -> 0 or 10, ~50/50</span>`) },
      { label: '🟨 JavaScript', body: code('javascript', `<span class="tok-key">class</span> <span class="tok-fn">Qubit</span> {
  <span class="tok-fn">constructor</span>(states) { <span class="tok-key">this</span>.states = states; } <span class="tok-com">// Map<value, amplitude></span>

  <span class="tok-fn">apply</span>(fn) {
    <span class="tok-key">const</span> out = <span class="tok-key">new</span> <span class="tok-fn">Map</span>();
    <span class="tok-key">for</span> (<span class="tok-key">const</span> [v, amp] <span class="tok-key">of</span> <span class="tok-key">this</span>.states) {
      <span class="tok-key">const</span> k = fn(v);
      out.set(k, (out.get(k) || <span class="tok-num">0</span>) + amp); <span class="tok-com">// interfere</span>
    }
    <span class="tok-key">return</span> <span class="tok-key">new</span> <span class="tok-fn">Qubit</span>(out);
  }

  <span class="tok-fn">measure</span>() {
    <span class="tok-key">let</span> total = <span class="tok-num">0</span>;
    <span class="tok-key">for</span> (<span class="tok-key">const</span> a <span class="tok-key">of</span> <span class="tok-key">this</span>.states.values()) total += a*a;
    <span class="tok-key">let</span> r = Math.random()*total, acc = <span class="tok-num">0</span>;
    <span class="tok-key">for</span> (<span class="tok-key">const</span> [v, a] <span class="tok-key">of</span> <span class="tok-key">this</span>.states) {
      acc += a*a; <span class="tok-key">if</span> (r <= acc) <span class="tok-key">return</span> v;
    }
  }
}

<span class="tok-key">const</span> h = <span class="tok-num">1</span>/Math.sqrt(<span class="tok-num">2</span>);
<span class="tok-key">const</span> bit = <span class="tok-key">new</span> <span class="tok-fn">Qubit</span>(<span class="tok-key">new</span> Map([[<span class="tok-num">0</span>, h], [<span class="tok-num">1</span>, h]]));
console.log(bit.apply(x => x*<span class="tok-num">10</span>).measure()); <span class="tok-com">// 0 or 10</span>`) },
    ])}

    <div class="callout info"><span class="ico">🧠</span><p><strong>Why it's revolutionary:</strong> you compute over an entire space of inputs with a single <code class="inline-code">apply</code> call. Branching logic disappears — the data carries its own parallel universes.</p></div>

    <h2 id="next">Where this goes</h2>
    <p>Stack many qubits and you get a <strong>register</strong> that represents 2ⁿ states in n slots. That exponential compression is the seed of every quantum algorithm — and the next experiment uses it.</p>
    ${pager({ href: '/quantum', title: 'The Lab' }, { href: '/q-entangle', title: 'Exp 02 · Entangled Variables' })}
  `
},

'/q-entangle': {
  section: 'quantum', title: 'Exp 02 · Entangled Variables',
  html: () => `
    <span class="eyebrow">EXPERIMENT 02</span>
    <h1>Entangled Variables</h1>
    <p class="lead">Two variables, linked so deeply that measuring one instantly decides the other — no matter how far apart they sit in your program.</p>

    <h2 id="idea">The radical idea</h2>
    <p>Forget references and pointers. An entangled pair shares a single hidden truth: the moment you observe variable <code class="inline-code">a</code>, variable <code class="inline-code">b</code> collapses into a correlated value <em>at the same instant</em>. Einstein hated this ("spooky action at a distance"). We're going to code it.</p>

    ${code('python', `<span class="tok-key">import</span> random

<span class="tok-key">class</span> <span class="tok-fn">EntangledPair</span>:
    <span class="tok-com">"""Two qubits sharing one fate. Measuring one fixes the other."""</span>
    <span class="tok-key">def</span> <span class="tok-fn">__init__</span>(self):
        self._collapsed = <span class="tok-key">None</span>
        <span class="tok-com"># Bell state: |00> + |11>  -> always equal, never known until read</span>
        self._correlation = <span class="tok-str">"equal"</span>

    <span class="tok-key">def</span> <span class="tok-fn">measure</span>(self, which):
        <span class="tok-key">if</span> self._collapsed <span class="tok-key">is</span> <span class="tok-key">None</span>:
            self._collapsed = random.choice([<span class="tok-num">0</span>, <span class="tok-num">1</span>])  <span class="tok-com"># the universe decides, once</span>
        a = self._collapsed
        b = a <span class="tok-key">if</span> self._correlation == <span class="tok-str">"equal"</span> <span class="tok-key">else</span> <span class="tok-num">1</span> - a
        <span class="tok-key">return</span> a <span class="tok-key">if</span> which == <span class="tok-str">"A"</span> <span class="tok-key">else</span> b

pair = EntangledPair()
<span class="tok-fn">print</span>(<span class="tok-str">"A ->"</span>, pair.measure(<span class="tok-str">"A"</span>))  <span class="tok-com"># e.g. 1</span>
<span class="tok-fn">print</span>(<span class="tok-str">"B ->"</span>, pair.measure(<span class="tok-str">"B"</span>))  <span class="tok-com"># GUARANTEED to match A — instantly</span>`)}

    <h2 id="use">A use no one expects: tamper-evident state</h2>
    <p>Because reading <em>collapses</em> the pair, entanglement makes a perfect tripwire. If two parts of a system share an entangled token, the first read locks the value — any later read that disagrees proves someone observed it in between. That's the core of quantum key distribution, rebuilt in a few lines.</p>

    ${code('python', `<span class="tok-key">def</span> <span class="tok-fn">secure_channel</span>(n=<span class="tok-num">8</span>):
    <span class="tok-com"># Alice and Bob share entangled bits; an eavesdropper collapses them early</span>
    pairs = [EntangledPair() <span class="tok-key">for</span> _ <span class="tok-key">in</span> <span class="tok-fn">range</span>(n)]
    alice = [p.measure(<span class="tok-str">"A"</span>) <span class="tok-key">for</span> p <span class="tok-key">in</span> pairs]
    bob   = [p.measure(<span class="tok-str">"B"</span>) <span class="tok-key">for</span> p <span class="tok-key">in</span> pairs]
    <span class="tok-com"># identical lists == no eavesdropper touched the line</span>
    <span class="tok-key">return</span> alice <span class="tok-key">if</span> alice == bob <span class="tok-key">else</span> <span class="tok-key">None</span>  <span class="tok-com"># None = compromised</span>`)}

    <div class="callout tip"><span class="ico">🔐</span><p><strong>Revolutionary angle:</strong> security that comes from the <em>physics of observation</em>, not from a hard math problem. You can't copy what you can't look at without changing it.</p></div>
    ${pager({ href: '/q-superposition', title: 'Exp 01 · Superposition' }, { href: '/q-walk', title: 'Exp 03 · Quantum Walk' })}
  `
},

'/q-walk': {
  section: 'quantum', title: 'Exp 03 · Quantum Walk Search',
  html: () => `
    <span class="eyebrow">EXPERIMENT 03</span>
    <h1>Quantum Walk Search</h1>
    <p class="lead">A random walk explores one path at a time. A <em>quantum</em> walk explores all paths at once and lets them interfere — so the right answer reinforces itself and wrong answers cancel out.</p>

    <h2 id="idea">The radical idea</h2>
    <p>Classical search through N items takes ~N steps. By walking in superposition and amplifying the marked state — Grover's trick — we reach the answer in ~√N steps. For a million items that's a thousand steps instead of a million. Here's the amplitude-amplification core:</p>

    ${code('python', `<span class="tok-key">import</span> numpy <span class="tok-key">as</span> np

<span class="tok-key">def</span> <span class="tok-fn">grover_search</span>(n, target):
    <span class="tok-com">"""Find 'target' among 2^n items in ~sqrt(N) steps via interference."""</span>
    N = <span class="tok-num">2</span>**n
    <span class="tok-com"># start in equal superposition — every item equally likely</span>
    state = np.ones(N) / np.sqrt(N)

    steps = <span class="tok-fn">int</span>(np.pi/<span class="tok-num">4</span> * np.sqrt(N))  <span class="tok-com"># the magic sqrt(N) count</span>
    <span class="tok-key">for</span> _ <span class="tok-key">in</span> <span class="tok-fn">range</span>(steps):
        <span class="tok-com"># 1) ORACLE: flip the sign of the answer's amplitude</span>
        state[target] *= -<span class="tok-num">1</span>
        <span class="tok-com"># 2) DIFFUSION: reflect every amplitude about the mean</span>
        mean = state.mean()
        state = <span class="tok-num">2</span>*mean - state
        <span class="tok-com"># wrong answers destructively interfere; target grows each loop</span>

    probs = state**<span class="tok-num">2</span>
    <span class="tok-key">return</span> <span class="tok-fn">int</span>(np.argmax(probs)), probs.max()

idx, p = grover_search(n=<span class="tok-num">10</span>, target=<span class="tok-num">777</span>)  <span class="tok-com"># 1024 items</span>
<span class="tok-fn">print</span>(idx, <span class="tok-fn">round</span>(p, <span class="tok-num">3</span>))  <span class="tok-com"># 777 with >0.99 probability, in ~25 steps</span>`)}

    <div class="stat-row">
      <div class="stat"><b>1,024</b><span>items to search</span></div>
      <div class="stat"><b>~25</b><span>quantum steps</span></div>
      <div class="stat"><b>~512</b><span>classical avg steps</span></div>
      <div class="stat"><b>√N</b><span>the speedup law</span></div>
    </div>

    <h2 id="why">Why this matters</h2>
    <p>The loop never "checks" items one by one. The <strong>oracle</strong> marks the answer and the <strong>diffusion</strong> step uses interference to drain probability from everything else into it. It's search by sculpting a wave, not by iterating a list.</p>

    <div class="callout info"><span class="ico">📈</span><p><strong>Revolutionary angle:</strong> any brute-force search — passwords, databases, puzzle states — gets a quadratic cut. Reframing "look at each" as "amplify the right one" is a genuinely different way to think about computation.</p></div>
    ${pager({ href: '/q-entangle', title: 'Exp 02 · Entangled Variables' }, { href: '/q-anneal', title: 'Exp 04 · Reality Annealer' })}
  `
},

'/q-anneal': {
  section: 'quantum', title: 'Exp 04 · Reality Annealer',
  html: () => `
    <span class="eyebrow">EXPERIMENT 04</span>
    <h1>The Reality Annealer</h1>
    <p class="lead">Treat a hard problem like molten metal: heat it so it can explore wild configurations, then cool it slowly until it freezes into the lowest-energy state — the answer.</p>

    <h2 id="idea">The radical idea</h2>
    <p>Quantum annealers solve optimization by letting a system <em>tunnel</em> through barriers a classical search would be stuck behind. We simulate that intuition: encode any problem as an "energy" to minimize, then anneal. The same skeleton solves routing, scheduling, layout, and packing.</p>

    ${code('python', `<span class="tok-key">import</span> random, math

<span class="tok-key">def</span> <span class="tok-fn">anneal</span>(energy, neighbor, state, T=<span class="tok-num">10.0</span>, cool=<span class="tok-num">0.997</span>, steps=<span class="tok-num">20000</span>):
    <span class="tok-com">"""Generic optimizer. Pass in ANY problem as energy()+neighbor()."""</span>
    best, best_e = state, energy(state)
    cur, cur_e = state, best_e
    <span class="tok-key">for</span> _ <span class="tok-key">in</span> <span class="tok-fn">range</span>(steps):
        cand = neighbor(cur)
        e = energy(cand)
        dE = e - cur_e
        <span class="tok-com"># accept worse moves while "hot" — this is the tunneling</span>
        <span class="tok-key">if</span> dE < <span class="tok-num">0</span> <span class="tok-key">or</span> random.random() < math.exp(-dE / T):
            cur, cur_e = cand, e
            <span class="tok-key">if</span> e < best_e: best, best_e = cand, e
        T *= cool  <span class="tok-com"># slowly freeze toward the optimum</span>
    <span class="tok-key">return</span> best, best_e

<span class="tok-com"># Example: solve a tiny Traveling Salesman by annealing the route</span>
cities = [(random.random(), random.random()) <span class="tok-key">for</span> _ <span class="tok-key">in</span> <span class="tok-fn">range</span>(<span class="tok-num">12</span>)]
<span class="tok-key">def</span> <span class="tok-fn">dist</span>(a, b): <span class="tok-key">return</span> math.hypot(a[<span class="tok-num">0</span>]-b[<span class="tok-num">0</span>], a[<span class="tok-num">1</span>]-b[<span class="tok-num">1</span>])
<span class="tok-key">def</span> <span class="tok-fn">tour_len</span>(r): <span class="tok-key">return</span> <span class="tok-fn">sum</span>(dist(cities[r[i]], cities[r[i-<span class="tok-num">1</span>]]) <span class="tok-key">for</span> i <span class="tok-key">in</span> <span class="tok-fn">range</span>(<span class="tok-fn">len</span>(r)))
<span class="tok-key">def</span> <span class="tok-fn">swap</span>(r):
    r = r[:]; i, j = random.sample(<span class="tok-fn">range</span>(<span class="tok-fn">len</span>(r)), <span class="tok-num">2</span>); r[i], r[j] = r[j], r[i]; <span class="tok-key">return</span> r

route, length = anneal(tour_len, swap, <span class="tok-fn">list</span>(<span class="tok-fn">range</span>(<span class="tok-num">12</span>)))
<span class="tok-fn">print</span>(<span class="tok-str">"shortest route found:"</span>, route, <span class="tok-fn">round</span>(length, <span class="tok-num">3</span>))`)}

    <h2 id="general">One engine, every hard problem</h2>
    <p>The beauty: <code class="inline-code">anneal()</code> knows nothing about cities. Give it a different <code class="inline-code">energy()</code> and <code class="inline-code">neighbor()</code> and it schedules exams, packs warehouses, or balances a neural net — all with the same dozen lines.</p>

    <table class="tbl">
      <tr><th>Problem</th><th>energy() = minimize…</th><th>neighbor() = tweak…</th></tr>
      <tr><td>Scheduling</td><td>conflicts</td><td>swap two time slots</td></tr>
      <tr><td>Circuit layout</td><td>total wire length</td><td>move one component</td></tr>
      <tr><td>Bin packing</td><td>wasted space</td><td>relocate one item</td></tr>
      <tr><td>Sudoku</td><td>broken constraints</td><td>change one cell</td></tr>
    </table>

    <div class="callout tip"><span class="ico">🔥</span><p><strong>Revolutionary angle:</strong> stop writing a new algorithm per problem. Describe the problem's <em>energy landscape</em> and let physics-inspired cooling find the valley. That generality is the whole point.</p></div>

    <hr class="sep" />
    <p style="text-align:center;color:var(--ink-faint)">That's the lab — four experiments, four ways to make code do what it "shouldn't". <a class="inline" href="#/overview" data-link>Back to the start →</a></p>
    ${pager({ href: '/q-walk', title: 'Exp 03 · Quantum Walk' }, { href: '/overview', title: 'Overview' })}
  `
},

};

/* search index built from the pages */
const SEARCH_INDEX = Object.entries(PAGES).map(([href, p]) => ({
  href, section: p.section, title: p.title,
  text: p.html().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)
}));
