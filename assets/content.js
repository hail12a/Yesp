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
    <p class="lead">Two worlds, one docs hub. Drop into <strong>Battlefeuer S2</strong> — a fast, tactical Roblox shooter — or step into the <strong>Quantum Lab</strong>, where we write code the way no one was supposed to.</p>

    <div class="hero">
      <p style="margin:0 0 6px;font-family:var(--mono);font-size:13px;color:var(--accent-ink)">// pick a universe</p>
      <p style="margin:0;font-size:17px;color:var(--ink)">This site borrows the layout you love from the Claude Code docs — the tabs, the sidebar, the clean panels — and points it at the things <em>we</em> care about.</p>
    </div>

    <div class="card-grid">
      <a class="card" href="#/battlefeuer" data-link>
        <div class="card-icon">🎮</div>
        <h4>Battlefeuer S2</h4>
        <p>Loadouts, maps, modes and pro tips for the FFS B39.11 build.</p>
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
      { label: '🎮 Battlefeuer', body: `
        <p>The <strong>Battlefeuer S2</strong> tab is a living field manual for the Roblox game <em>Battlefeuer S2 [FFS] B39.11</em>. It covers everything from your first match to frame-perfect movement tech.</p>
        <ul><li>Beginner-friendly <strong>Get Started</strong> walkthrough</li><li>Full <strong>loadout & weapon</strong> breakdowns</li><li><strong>Maps & modes</strong> with callouts</li><li>A stack of <strong>pro tips</strong> in expandable cards</li></ul>
        <p><a class="inline" href="#/battlefeuer" data-link>Open the game docs →</a></p>` },
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

/* ----------------------- BATTLEFEUER ----------------------- */
'/battlefeuer': {
  section: 'battlefeuer', title: 'Game Overview',
  html: () => `
    <span class="eyebrow">BATTLEFEUER S2 · FFS B39.11</span>
    <h1>Battlefeuer S2</h1>
    <p class="lead">A fast, tactical first-person firefight on Roblox. Tight gunplay, readable maps, and a time-to-kill that rewards aim and positioning over luck.</p>

    <div class="hero">
      <p style="margin:0 0 10px;font-size:16px;color:var(--ink)">"Battlefeuer" — German for <em>battle fire</em>. Season 2, Frontline Firefight System, build B39.11.</p>
      <a class="play-btn" href="https://www.roblox.com/games/112971188400049/Battlefeuer-S2-FFS-B39-11" target="_blank" rel="noopener">Play on Roblox ▸</a>
    </div>

    <div class="stat-row">
      <div class="stat"><b>FPS</b><span>First-person shooter</span></div>
      <div class="stat"><b>S2</b><span>Current season</span></div>
      <div class="stat"><b>B39.11</b><span>Build version</span></div>
      <div class="stat"><b>FFS</b><span>Frontline Firefight</span></div>
    </div>

    <h2 id="what">What is it?</h2>
    <p>Battlefeuer S2 is a round-based shooter where two squads fight over objectives across compact maps. Matches are quick, gear is earned, and the skill ceiling lives in your movement and recoil control.</p>

    <h2 id="pillars">Design pillars</h2>
    <div class="card-grid">
      <div class="card"><div class="card-icon">🎯</div><h4>Aim first</h4><p>Low TTK means crisp aim beats bullet-hosing every time.</p></div>
      <div class="card"><div class="card-icon">🏃</div><h4>Movement tech</h4><p>Slide-cancels and peeker's advantage decide duels.</p></div>
      <div class="card"><div class="card-icon">🧩</div><h4>Readable maps</h4><p>Clear sightlines, fair flanks, no random death.</p></div>
    </div>

    <div class="callout warn"><span class="ico">⚠️</span><p>Build B39.11 tunes recoil and hit-reg. Older muscle memory from S1 may feel slightly off — re-zero in a private server first.</p></div>
    ${pager({ href: '/overview', title: 'Overview' }, { href: '/bf-getstarted', title: 'Get Started' })}
  `
},

'/bf-getstarted': {
  section: 'battlefeuer', title: 'Get Started',
  html: () => `
    <span class="eyebrow">BATTLEFEUER · GUIDE</span>
    <h1>Get Started</h1>
    <p class="lead">From cold launch to your first elimination. Pick your platform and follow along.</p>

    <h2 id="launch">Launch the game</h2>
    ${tabs('bfstart', [
      { label: '🖥️ PC', body: `
        <ol><li>Open the <a class="inline" href="https://www.roblox.com/games/112971188400049/Battlefeuer-S2-FFS-B39-11" target="_blank" rel="noopener">game page</a> and hit the green <strong>Play</strong> button.</li>
        <li>Let the Roblox client boot, then wait in the lobby for matchmaking.</li>
        <li>Bind your keys: <code class="inline-code">WASD</code> move, <code class="inline-code">Shift</code> sprint, <code class="inline-code">C</code> crouch, <code class="inline-code">Space</code> jump.</li></ol>` },
      { label: '📱 Mobile', body: `
        <ol><li>Open the Roblox app and search <strong>Battlefeuer S2</strong>.</li>
        <li>Enable the <strong>gyro aim</strong> option in settings for finer control.</li>
        <li>Resize the on-screen fire button so it sits under your thumb.</li></ol>
        <div class="callout tip"><span class="ico">📲</span><p>Mobile players: turn on "aim assist snap" but keep "auto-fire" off — it wastes ammo and reveals your position.</p></div>` },
      { label: '🎮 Controller', body: `
        <ol><li>Pair your controller before launching Roblox.</li>
        <li>Set <strong>aim sensitivity</strong> to ~35% and <strong>ADS sensitivity</strong> lower (~25%).</li>
        <li>Swap jump to a bumper so you can keep your thumb on the stick while jump-peeking.</li></ol>` },
    ])}

    <h2 id="firstmatch">Your first match</h2>
    <ol>
      <li><strong>Stick with your squad.</strong> Lone wolves feed the enemy.</li>
      <li><strong>Hold angles, don't chase.</strong> Let opponents walk into your crosshair.</li>
      <li><strong>Reload behind cover</strong> — never in the open.</li>
      <li><strong>Use the minimap.</strong> Gunfire pings reveal where the fight is.</li>
    </ol>

    <div class="callout info"><span class="ico">💡</span><p>Spend 10 minutes in a private server learning each gun's recoil before you queue ranked.</p></div>
    ${pager({ href: '/battlefeuer', title: 'Game Overview' }, { href: '/bf-loadout', title: 'Loadouts & Weapons' })}
  `
},

'/bf-loadout': {
  section: 'battlefeuer', title: 'Loadouts & Weapons',
  html: () => `
    <span class="eyebrow">BATTLEFEUER · COMBAT</span>
    <h1>Loadouts & Weapons</h1>
    <p class="lead">Pick a weapon class that matches how you like to fight, then tune the attachments to your range.</p>

    <h2 id="classes">Weapon classes</h2>
    ${tabs('bfload', [
      { label: '🔫 Assault Rifles', body: `
        <p>The all-rounder. Reliable at every range, forgiving recoil, great for holding objectives.</p>
        <table class="tbl"><tr><th>Stat</th><th>Rating</th></tr>
        <tr><td>Damage</td><td>★★★★☆</td></tr><tr><td>Range</td><td>★★★★☆</td></tr>
        <tr><td>Mobility</td><td>★★★☆☆</td></tr><tr><td>Recoil control</td><td>★★★★☆</td></tr></table>
        <p><strong>Best for:</strong> new players, anchors, anyone who wants one gun for everything.</p>` },
      { label: '💨 SMGs', body: `
        <p>Close-quarters monsters. Insane fire rate and mobility, but they fall off hard past mid-range.</p>
        <table class="tbl"><tr><th>Stat</th><th>Rating</th></tr>
        <tr><td>Damage</td><td>★★★☆☆</td></tr><tr><td>Range</td><td>★★☆☆☆</td></tr>
        <tr><td>Mobility</td><td>★★★★★</td></tr><tr><td>Fire rate</td><td>★★★★★</td></tr></table>
        <p><strong>Best for:</strong> aggressive flankers and entry fraggers.</p>` },
      { label: '🎯 Snipers', body: `
        <p>One shot, one kill — if you can land it. High risk, high reward, and brutal on long sightlines.</p>
        <table class="tbl"><tr><th>Stat</th><th>Rating</th></tr>
        <tr><td>Damage</td><td>★★★★★</td></tr><tr><td>Range</td><td>★★★★★</td></tr>
        <tr><td>Mobility</td><td>★★☆☆☆</td></tr><tr><td>Forgiveness</td><td>★☆☆☆☆</td></tr></table>
        <div class="callout warn"><span class="ico">⚠️</span><p>Quick-scoping was nerfed in B39.11 — there's now a brief scope-in delay. Pre-aim instead.</p></div>` },
    ])}

    <h2 id="attachments">Attachment priorities</h2>
    <ul>
      <li><strong>Sight</strong> — pick the reticle you can track fastest, not the flashiest.</li>
      <li><strong>Grip</strong> — vertical grip tames the first-shot kick on ARs.</li>
      <li><strong>Mag</strong> — extended mags for objective holds; light mags for run-and-gun.</li>
      <li><strong>Muzzle</strong> — suppressor hides you from the minimap at a small range cost.</li>
    </ul>

    <h2 id="meta">A balanced starter loadout</h2>
    ${code('loadout', `<span class="tok-com">// B39.11 "do-everything" kit</span>
Primary  : <span class="tok-str">Assault Rifle</span>  + red-dot, vertical grip, extended mag
Secondary: <span class="tok-str">Machine Pistol</span> (panic close-range)
Tactical : <span class="tok-str">Flashbang</span>      x2
Lethal   : <span class="tok-str">Frag</span>           x1
Perk     : <span class="tok-str">Fast Hands</span>     <span class="tok-com">// faster reload + swap</span>`)}

    ${pager({ href: '/bf-getstarted', title: 'Get Started' }, { href: '/bf-maps', title: 'Maps & Modes' })}
  `
},

'/bf-maps': {
  section: 'battlefeuer', title: 'Maps & Modes',
  html: () => `
    <span class="eyebrow">BATTLEFEUER · MAPS</span>
    <h1>Maps & Modes</h1>
    <p class="lead">Know the lanes, own the rotations. Each mode rewards a different rhythm.</p>

    <h2 id="modes">Game modes</h2>
    <div class="card-grid">
      <div class="card"><div class="card-icon">🚩</div><h4>Frontline</h4><p>Push a moving objective across the map. Constant pressure, no camping.</p></div>
      <div class="card"><div class="card-icon">💣</div><h4>Demolition</h4><p>Plant or defuse. One life per round — communication wins.</p></div>
      <div class="card"><div class="card-icon">☠️</div><h4>Team Deathmatch</h4><p>Pure fragging. Best warmup before ranked.</p></div>
      <div class="card"><div class="card-icon">👑</div><h4>King of the Hill</h4><p>Hold the zone. Crossfire setups are everything.</p></div>
    </div>

    <h2 id="reading">Reading a map</h2>
    ${accordion([
      { ico: '🧭', title: 'Lanes & sightlines', body: '<p>Every map has three rough lanes: <strong>left flank, mid, right flank</strong>. Mid is the fastest but the most exposed. Learn which lane each mode funnels you into and pre-aim the common angles.</p>' },
      { ico: '🔄', title: 'Rotations', body: '<p>A rotation is moving from one objective/area to another. Good players rotate <em>early and quiet</em> — using suppressed weapons and avoiding mid — to hit the enemy from an unexpected side.</p>' },
      { ico: '📦', title: 'Cover types', body: '<p><strong>Hard cover</strong> blocks bullets (walls, crates). <strong>Soft cover</strong> only blocks line of sight (smoke, bushes). Never treat soft cover as safety — it just buys a second.</p>' },
      { ico: '🔊', title: 'Sound cues', body: '<p>Footsteps, reloads, and ability sounds are directional. Wear headphones. A reload sound is your cue to push.</p>' },
    ])}

    <div class="callout tip"><span class="ico">🎧</span><p>Run a private match and walk every lane once with sound on. You'll learn the map faster than from 20 live games.</p></div>
    ${pager({ href: '/bf-loadout', title: 'Loadouts & Weapons' }, { href: '/bf-tips', title: 'Pro Tips' })}
  `
},

'/bf-tips': {
  section: 'battlefeuer', title: 'Pro Tips',
  html: () => `
    <span class="eyebrow">BATTLEFEUER · MASTERY</span>
    <h1>Pro Tips</h1>
    <p class="lead">The habits that separate a good player from a great one. Expand each card.</p>

    ${accordion([
      { ico: '🎯', title: 'Pre-aim every corner', body: '<p>Hold your crosshair at head height where an enemy will appear, <em>before</em> you peek. When they pop out you only need to click, not flick. This single habit wins more duels than raw aim.</p>' },
      { ico: '🏃', title: 'Master the slide-cancel', body: '<p>Sprint → crouch (slide) → jump cancels the slide into a fast, unpredictable peek. It throws off enemy tracking and lets you re-aim mid-slide. Practice until it\'s muscle memory.</p>' },
      { ico: '👀', title: 'Use peeker\'s advantage', body: '<p>The player peeking sees the holder a few frames before the holder reacts. <strong>Jiggle-peek</strong> wide angles: tap out, bait the shot, then commit when you know where they are.</p>' },
      { ico: '🔇', title: 'Play the audio game', body: '<p>Stop sprinting near contested areas — walk to stay silent. Listen for enemy reloads and footsteps, then punish. Silence is information; give the enemy none.</p>' },
      { ico: '🧠', title: 'Trade, don\'t chase', body: '<p>If a teammate dies, you should already be aimed at the spot that killed them — ready to trade. Chasing a low-HP enemy into the open is how you feed.</p>' },
      { ico: '🔧', title: 'Tune your sensitivity', body: '<p>Lower sens = steadier aim, higher sens = faster flicks. Find the lowest sens where you can still do a 180. Then never change it — consistency beats theory.</p>' },
      { ico: '🧘', title: 'Reset after deaths', body: '<p>Tilt loses games. After a bad death, take one breath, play the next round slow and safe, and let your aim come back. Calm players close out rounds.</p>' },
    ])}

    <div class="callout info"><span class="ico">⭐</span><p>Pick <strong>one</strong> tip per session and focus only on it. Stacking habits one at a time sticks far better than trying all seven at once.</p></div>
    ${pager({ href: '/bf-maps', title: 'Maps & Modes' }, { href: '/quantum', title: 'Quantum Lab' })}
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
