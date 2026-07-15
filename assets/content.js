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
   AI CORES — data model (list pages + per-core detail pages)
   Power is a % of GPT-2 (100% = GPT-2 level) and may exceed 100.
   ========================================================= */
const powerMeter = (power) => {
  const over = power > 100;
  const fill = Math.max(0, Math.min(power, 100));
  const overPct = over ? Math.round(power - 100) : 0;
  return `
    <div class="aicore-power">
      <div class="aicore-power-label">Power <b>${power}%</b><span>of GPT-2 level${over ? ' · <b class="over">overclocked ▲</b>' : ''}</span></div>
      <div class="aicore-meter${over ? ' over' : ''}"><i style="width:${fill}%"></i>${over ? `<span class="aicore-meter-over">+${overPct}% over GPT-2</span>` : ''}</div>
      <div class="aicore-power-legend">100% = GPT-2 (124M) level. Cores that beat it can be set above 100.</div>
    </div>`;
};

const AI_CORES = [
  /* ---------------- MAIN CORES ---------------- */
  {
    id: 'hgem2', cat: 'variant', route: '/ai/hgem2', emoji: '🌌',
    variantLabel: 'GPU', variantEmoji: '⚡', variantNote: 'CUDA / T4 · V2.2',
    name: 'KitlerNet V2.2 — HGEM2', tagline: 'Data-Center HybridBrain', badge: 'GPU', badgeClass: 'new',
    power: 90, file: 'assets/cores/kitlernet_v2_2_hgem2.py', fileName: 'kitlernet_v2_2_hgem2.py',
    blurb: 'HybridBrain scaled to data-center size and trained on GPU with mixed precision, torch.compile and a cosine schedule. The same seven-subsystem brain, much bigger and much harder.',
    specs: [
      { k: 'Type', v: 'Hybrid cognitive engine (scaled)' }, { k: 'Params', v: '≈ 150M' },
      { k: 'Backbone', v: '8 × 512-dim · 8 heads' }, { k: 'Context', v: '256 tokens' },
      { k: 'Device', v: 'CUDA (T4) · CPU fallback' }, { k: 'Precision', v: 'AMP fp16 + GradScaler' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Core design — HybridBrain, scaled to the data center</h2>
      <p>HGEM2 keeps the exact seven-subsystem <a class="inline" href="#/ai/hgem" data-link>HybridBrain-6F++</a> stack — head-gated attention, gated fast weights, sparse Hebbian memory, a contrastive world model, a qualia map, a persistent identity controller and a narrative head — but roughly doubles every dimension and moves training onto the GPU.</p>
      <div class="aicore-mech">
        <div class="aicore-m"><b>▲ Upscaled backbone</b><p>512-dim / 8 layers / 8 heads / rank-8 fast weights and a 256-token context — a big step up from the CPU model's 256-dim / 4-layer core.</p></div>
        <div class="aicore-m"><b>⚡ GPU training path</b><p><code class="inline-code">torch.compile</code> + AMP fp16 autocast + <code class="inline-code">GradScaler</code> for ~1.3–1.5× throughput on a T4, with a clean CPU fallback.</p></div>
        <div class="aicore-m"><b>📉 Cosine schedule</b><p>200-step LR warmup then cosine decay to 10% — the biggest "learns faster" win over the flat-LR CPU version.</p></div>
        <div class="aicore-m"><b>🛡️ Deeper hardening</b><p>Generators down-scaled ×0.05, coefficients clamped ±8, Hebbian traces clamped ±1.5, tiny 0.008 init, weight decay 0.15, and NaN guards that halt cleanly.</p></div>
        <div class="aicore-m"><b>🔁 Repetition brake</b><p>Generation dampens the logits of the last 8 tokens by 0.5 to break localized character loops.</p></div>
        <div class="aicore-m"><b>💾 Full checkpointing</b><p>Saves model + tokenizer to <code class="inline-code">hgem_full.pth</code> and anchors the identity vector to disk between runs.</p></div>
      </div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made — same brain, bigger &amp; safer</h2>
      <ol class="wb-steps">
        <li><strong>Backbone:</strong> embed + positional, then 8 blocks of <em>norm → head-gated attention → norm → (gated fast-weight + sparse Hebbian) → projection</em>.</li>
        <li><strong>Cognitive heads:</strong> the world model, identity controller and narrative head read the final hidden state; logits blend as <code class="inline-code">base + 0.1·bias + 0.05·narrative</code>.</li>
        <li><strong>Mixed precision:</strong> forward/backward run under fp16 autocast; a <code class="inline-code">GradScaler</code> scales the loss, unscales before grad-clip 1.0, then steps.</li>
        <li><strong>Schedule:</strong> per-step LR = warmup ramp then cosine decay, driving faster, smoother convergence.</li>
        <li><strong>Safety:</strong> NaN detection breaks the loop, clamped generators/traces keep the extra memory systems bounded, and identity + checkpoint are saved on finish or Ctrl+C.</li>
      </ol>`,
    codeLang: 'python — mixed-precision training step',
    code: `<span class="tok-kw">with</span> torch.amp.autocast(<span class="tok-str">"cuda"</span>, dtype=torch.float16, enabled=cuda):
    logits, loss, aux = model(xb, yb)
<span class="tok-kw">if</span> torch.isnan(loss): <span class="tok-kw">break</span>              <span class="tok-com"># NaN guard</span>
scaler.scale(loss).backward()
scaler.unscale_(optim)
torch.nn.utils.clip_grad_norm_(model.parameters(), <span class="tok-num">1.0</span>)
scaler.step(optim); scaler.update()`,
  },
  {
    id: 'hgem2tpu', cat: 'variant', route: '/ai/hgem2-tpu', emoji: '🔷',
    variantLabel: 'TPU', variantEmoji: '🔷', variantNote: 'TPU exclusive · XLA', variantNew: true,
    name: 'KitlerNet V2.2 — HGEM2 (TPU)', tagline: 'TPU-Exclusive HybridBrain', badge: 'TPU ONLY', badgeClass: 'new',
    power: 92, file: 'assets/cores/kitlernet_v2_2_hgem2_tpu.py', fileName: 'kitlernet_v2_2_hgem2_tpu.py',
    blurb: 'The smartest build — the same 512-dim HybridBrain rebuilt for XLA/TPU, trained longer on real dialogue with ramped auxiliary objectives. TPU exclusive.',
    specs: [
      { k: 'Type', v: 'Hybrid cognitive engine (TPU)' }, { k: 'Params', v: '≈ 150M' },
      { k: 'Backbone', v: '8 × 512-dim · 8 heads' }, { k: 'Device', v: 'TPU / XLA · bf16' },
      { k: 'Training', v: '10k iters · aux ramp' }, { k: 'Data', v: 'TinyShakespeare + DailyDialog' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Core design — HybridBrain, rebuilt for the TPU</h2>
      <p>Same seven-subsystem <a class="inline" href="#/ai/hgem" data-link>HybridBrain</a> brain as the GPU build, but every dynamic operation was made <strong>XLA-safe</strong> so it compiles into a single static TPU graph — then trained longer, on real conversations, with the extra objectives eased in gradually.</p>
      <div class="aicore-mech">
        <div class="aicore-m"><b>🔷 XLA-static graph</b><p>No in-forward buffer registration and fixed, pre-allocated state shapes so the whole model traces cleanly on TPU.</p></div>
        <div class="aicore-m"><b>📊 Quantile sparsity</b><p>The Hebbian memory's dynamic top-k mask is replaced by a static quantile threshold — same sparsity, TPU-friendly.</p></div>
        <div class="aicore-m"><b>🎚️ Ramped aux losses</b><p>Controller, narrative and grounding objectives ramp 0→1 over 1500 steps so the model learns clean language first.</p></div>
        <div class="aicore-m"><b>💬 Real dialogue data</b><p>Trains on TinyShakespeare + two DailyDialog shards, so it sees actual User/Bot conversations, not just character grids.</p></div>
        <div class="aicore-m"><b>⚙️ bf16 + sync barriers</b><p>bf16 downcast and one <code class="inline-code">torch_xla.sync()</code> barrier per optimizer step for stable, fast TPU throughput.</p></div>
        <div class="aicore-m"><b>🔁 Stronger repetition brake</b><p>Generation penalizes the last 32 tokens by 1.5 to keep long dialogue samples from looping.</p></div>
      </div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made — same brain, TPU-native</h2>
      <ol class="wb-steps">
        <li><strong>Device:</strong> initializes a <code class="inline-code">torch_xla</code> TPU device, with a clean CUDA/CPU fallback if XLA isn't present.</li>
        <li><strong>Static memory:</strong> the Hebbian trace is a pre-registered buffer updated by plain assignment — no dynamic re-registration that would break the graph.</li>
        <li><strong>Aux schedule:</strong> <code class="inline-code">_aux_scale = min(1, it/1500)</code> multiplies the controller/narrative/grounding weights so they fade in.</li>
        <li><strong>Optimizer step:</strong> <code class="inline-code">xm.optimizer_step(optim, barrier=True)</code> on TPU, plain <code class="inline-code">optim.step()</code> elsewhere; cosine LR with warmup to a floor.</li>
        <li><strong>Checkpointing:</strong> saves model + vocab + identity via <code class="inline-code">xm.save</code>, and prints live text samples so coherence is read, not just the loss.</li>
      </ol>`,
    codeLang: 'python — XLA-safe TPU step',
    code: `_aux_scale = <span class="tok-fn">min</span>(<span class="tok-num">1.0</span>, it / AUX_WARMUP)   <span class="tok-com"># ramp aux objectives in</span>
logits, loss, aux = model(xb, yb)
loss.backward()
torch.nn.utils.clip_grad_norm_(model.parameters(), <span class="tok-num">1.0</span>)
<span class="tok-kw">if</span> IS_XLA: xm.optimizer_step(optim, barrier=<span class="tok-kw">True</span>)  <span class="tok-com"># single TPU barrier</span>
<span class="tok-kw">else</span>:      optim.step()`,
  },
  {
    id: 'hgem', cat: 'variant', route: '/ai/hgem', emoji: '🧠',
    variantLabel: 'CPU', variantEmoji: '💻', variantNote: 'CPU · original HybridBrain-6F++',
    name: 'HybridBrain-6F++', tagline: 'Hybrid Cognitive Engine', badge: 'CPU', badgeClass: 'flagship',
    power: 82, file: 'assets/cores/hybridbrain_6fpp.py', fileName: 'hybridbrain_6fpp.py',
    blurb: 'The original CPU cognitive engine that fuses a transformer with fast weights, sparse Hebbian memory, a grounded world model, a persistent identity and a narrative head.',
    specs: [
      { k: 'Type', v: 'Hybrid cognitive engine' }, { k: 'Params', v: '≈ 12M' },
      { k: 'Backbone', v: '4 × 256-dim' }, { k: 'Per-block memory', v: 'Gated FW + sparse Hebbian' },
      { k: 'Attention', v: '4-head, head-gated' }, { k: 'Extras', v: 'World model · qualia · identity · narrative' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Core design — seven subsystems, one stabilized brain</h2>
      <p>HybridBrain runs a normal pre-norm transformer backbone, then layers a stack of cognitive modules on top and blends their signals into the final logits — all heavily hardened against the instability these extra loops usually cause.</p>
      <div class="aicore-mech">
        <div class="aicore-m"><b>1 · Gated fast weights</b><p>Each block's FFN is a low-rank <code class="inline-code">W0 + a·bᵀ</code> whose contribution is sigmoid-gated per rank and scaled by 1/√d to stop it exploding.</p></div>
        <div class="aicore-m"><b>2 · Sparse Hebbian memory</b><p>A persistent trace <code class="inline-code">M ← λM + a⊗b</code> per block, top-k sparsified and RMSNorm-controlled, carried across steps.</p></div>
        <div class="aicore-m"><b>3 · Head-gated attention</b><p>Standard causal SDPA, but every head has a bounded sigmoid gate so the model can learn to silence heads.</p></div>
        <div class="aicore-m"><b>4 · Contrastive world model</b><p>Object and property MLPs with a cosine grounding loss that pulls matching object↔property pairs together and pushes mismatches apart.</p></div>
        <div class="aicore-m"><b>5 · Qualia map</b><p>A tanh "feel space" projection of the hidden state into a 128-d bounded qualia vector.</p></div>
        <div class="aicore-m"><b>6 · Identity controller</b><p>A normalized, persistent <code class="inline-code">self_state</code> + goal bank that biases the logits and is saved to disk between runs.</p></div>
        <div class="aicore-m"><b>7 · Narrative head</b><p>A deep head conditioned on the hidden state and the identity vector, mixed in at low weight.</p></div>
      </div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made — blend, then bias, then harden</h2>
      <ol class="wb-steps">
        <li><strong>Backbone:</strong> embed + positional, then 4 blocks of <em>norm → head-gated attention → norm → (gated fast-weight + sparse Hebbian) → projection</em>.</li>
        <li><strong>Cognitive heads:</strong> the final hidden state feeds the world model (grounding loss), the identity controller (bias logits) and the narrative head.</li>
        <li><strong>Blend:</strong> <code class="inline-code">logits = base + 0.1·bias + 0.05·narrative</code> — the base vocabulary stays in control while the extra systems nudge syntax.</li>
        <li><strong>Persistent identity:</strong> <code class="inline-code">self_state</code> is normalized each step, EMA-updated from the hidden mean, and anchored to <code class="inline-code">~/hybrid_identity.pt</code> so the model keeps its "self" across runs.</li>
        <li><strong>Hardening:</strong> RMSNorm everywhere, clamped grounding loss, 1/√d scaling on fast paths, and grad-clip 0.5 keep the whole system stable.</li>
      </ol>`,
    codeLang: 'python — the hybrid block',
    code: `<span class="tok-kw">for</span> b <span class="tok-kw">in</span> self.blocks:
    h1 = b[<span class="tok-str">"norm1"</span>](x)
    x  = x + b[<span class="tok-str">"drop"</span>](b[<span class="tok-str">"att"</span>](h1))          <span class="tok-com"># head-gated attention</span>
    h2 = b[<span class="tok-str">"norm2"</span>](x)
    h  = b[<span class="tok-str">"act"</span>](b[<span class="tok-str">"fw"</span>](h2) + b[<span class="tok-str">"hebb"</span>](h2))  <span class="tok-com"># fast weight + Hebbian</span>
    x  = x + b[<span class="tok-str">"drop"</span>](b[<span class="tok-str">"proj"</span>](h))
<span class="tok-com"># logits = base + 0.1*identity_bias + 0.05*narrative</span>`,
  },
  {
    id: 'v1x', cat: 'main', route: '/ai/v1x', emoji: '🚀',
    name: 'KitlerNet v1x', tagline: 'Original MoE', badge: 'ORIGINAL', badgeClass: 'original',
    power: 42, file: 'assets/cores/kitlernet_v1x.py', fileName: 'kitlernet_v1x.py',
    blurb: 'The first core — a big 2025-stack GPT with a 4-expert Mixture-of-Experts feed-forward.',
    specs: [
      { k: 'Type', v: 'Transformer + MoE' }, { k: 'Parameters', v: '≈ 110M (top-2 active)' },
      { k: 'Layers', v: '12 × 512-dim' }, { k: 'Experts', v: '4 · route top-2' },
      { k: 'Attention', v: 'GQA · 8 Q / 2 KV heads' }, { k: 'Tokenizer', v: 'Char-level' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Core design — go big, add experts</h2>
      <p>v1x runs the full modern stack (RMSNorm + RoPE + GQA + SwiGLU) but swaps the plain feed-forward for a <strong>Mixture of Experts</strong>: four SwiGLU experts with a learned router that fires only the top-2 per token, so capacity scales without every weight running every step.</p>
      <div class="aicore-flow"><span>chars</span><em>→</em><span>embed</span><em>→</em><span class="hl">12× Block</span><em>→</em><span>RMSNorm</span><em>→</em><span>tied&nbsp;head</span></div>
      <div class="aicore-flow sub"><span>Block =</span><span>RMSNorm</span><em>→</em><span class="hl">GQA + RoPE</span><em>→</em><span>+res</span><em>→</em><span>RMSNorm</span><em>→</em><span class="hl">MoE (4×SwiGLU)</span><em>→</em><span>+res</span></div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made</h2>
      <ol class="wb-steps">
        <li><strong>Mixture of Experts:</strong> a router scores 4 SwiGLU experts per token, softmaxes the top-2, and blends only those — big model, sparse compute.</li>
        <li><strong>GQA</strong> with 8 query heads sharing 2 KV heads (4× less attention memory), RoPE rotary positions, causal-masked attention.</li>
        <li><strong>Weight tying</strong> between token embedding and output head; RMSNorm throughout.</li>
        <li><strong>Training:</strong> AdamW, warmup + linear decay LR, grad-accum ×4, grad-clip 1.0, best-val checkpoint + auto-resume.</li>
        <li><strong>CPU edition:</strong> 8 threads, oneDNN — no <code class="inline-code">torch.compile</code> and no BPE yet, which is exactly what v2x fixed.</li>
      </ol>`,
    codeLang: 'python — the MoE router',
    code: `<span class="tok-kw">def</span> <span class="tok-fn">forward</span>(self, x):
    logits = self.router(flat)
    weights, idx = torch.topk(logits, <span class="tok-num">2</span>, dim=-<span class="tok-num">1</span>)   <span class="tok-com"># top-2 experts</span>
    weights = F.softmax(weights, dim=-<span class="tok-num">1</span>)
    <span class="tok-kw">for</span> e, expert <span class="tok-kw">in</span> <span class="tok-fn">enumerate</span>(self.experts):
        mask = (idx == e).any(dim=-<span class="tok-num">1</span>)          <span class="tok-com"># route tokens</span>
        out[mask] += expert(flat[mask]) * w`,
  },
  {
    id: 'v2x', cat: 'main', route: '/ai/v2x', emoji: '⚙️',
    name: 'KitlerNet v2x', tagline: 'Transformer', badge: 'STABLE', badgeClass: 'stable',
    power: 55, file: 'assets/cores/kitlernet_v2x.py', fileName: 'kitlernet_v2x.py',
    blurb: 'A dense decoder-only transformer, tuned for an i3-14100F (AVX2, 4 cores).',
    specs: [
      { k: 'Type', v: 'Transformer (GPT-style)' }, { k: 'Parameters', v: '≈ 20M' },
      { k: 'Layers', v: '8 × 384-dim' }, { k: 'Attention', v: 'GQA · 6 Q / 2 KV heads' },
      { k: 'Context', v: '256 tokens' }, { k: 'Tokenizer', v: 'BPE · 4096 vocab' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Core design — the 2025 stack, bias-free</h2>
      <p>Every layer is the modern recipe: pre-norm residual blocks with rotary attention and a gated MLP. No biases, weights tied between the embedding and the output head.</p>
      <div class="aicore-flow"><span>tokens</span><em>→</em><span>BPE&nbsp;embed</span><em>→</em><span class="hl">8× Block</span><em>→</em><span>RMSNorm</span><em>→</em><span>tied&nbsp;head</span><em>→</em><span>logits</span></div>
      <div class="aicore-flow sub"><span>Block =</span><span>RMSNorm</span><em>→</em><span class="hl">GQA + RoPE</span><em>→</em><span>+res</span><em>→</em><span>RMSNorm</span><em>→</em><span class="hl">SwiGLU</span><em>→</em><span>+res</span></div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made</h2>
      <ol class="wb-steps">
        <li><strong>RMSNorm</strong> instead of LayerNorm — cheaper, no mean-subtraction, one learned scale per dim.</li>
        <li><strong>RoPE</strong> rotary position encoding baked into Q/K, so position is relative and length-flexible.</li>
        <li><strong>Grouped-Query Attention</strong> — 6 query heads share 2 KV heads, cutting the KV footprint ~3× while <code class="inline-code">scaled_dot_product_attention</code> handles causal masking.</li>
        <li><strong>SwiGLU</strong> feed-forward, hidden size rounded to a multiple of 64 so matmuls stay AVX2-friendly.</li>
        <li><strong>CPU speed levers:</strong> <code class="inline-code">torch.compile</code> Inductor (AVX2), thread pinning to 4 cores, oneDNN, cached BPE tokens.</li>
        <li><strong>Training:</strong> AdamW, cosine LR with warmup, grad-clip 1.0, effective batch 32, best-val checkpointing.</li>
      </ol>`,
    codeLang: 'python — the transformer block',
    code: `<span class="tok-kw">class</span> <span class="tok-fn">Block</span>(nn.Module):
    <span class="tok-kw">def</span> <span class="tok-fn">forward</span>(self, x):
        x = x + self.att(self.n1(x))   <span class="tok-com"># RMSNorm → GQA+RoPE</span>
        x = x + self.ff(self.n2(x))    <span class="tok-com"># RMSNorm → SwiGLU</span>
        <span class="tok-kw">return</span> x`,
  },
  {
    id: 'v3x', cat: 'main', route: '/ai/v3x', emoji: '🛡️',
    name: 'KitlerNet v3x', tagline: 'Hardened', badge: 'FLAGSHIP', badgeClass: 'flagship',
    power: 68, file: 'assets/cores/kitlernet_v3x.py', fileName: 'kitlernet_v3x.py',
    blurb: "v2x's architecture wrapped in full anti-overfit armor — PaLM z-loss, label smoothing, targeted decay.",
    specs: [
      { k: 'Type', v: 'Regularized Transformer' }, { k: 'Parameters', v: '≈ 20M' },
      { k: 'Weight decay', v: '0.25 (isolated)' }, { k: 'Label smoothing', v: '0.1' },
      { k: 'Z-loss coeff', v: '1e-4' }, { k: 'Dropout', v: '0.1 attn + residual' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Core design — same body, reinforced training</h2>
      <p>v3x keeps the RMSNorm + RoPE + GQA + SwiGLU skeleton and adds four independent regularizers that each attack a different overfitting failure mode.</p>
      <div class="aicore-flow"><span>logits</span><em>→</em><span class="hl">CE + label-smooth</span><em>+</em><span class="hl">z-loss·logsumexp²</span><em>→</em><span>loss</span></div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made — the four-layer armor</h2>
      <ol class="wb-steps">
        <li><strong>PaLM logit z-loss</strong> — penalizes <code class="inline-code">logsumexp(logits)²</code> so the network can't inflate raw logits.</li>
        <li><strong>Label smoothing 0.1</strong> — stops the model chasing 100% confidence; better calibration.</li>
        <li><strong>Targeted weight decay 0.25</strong> — norm layers and biases split into a zero-decay group so only real weight matrices decay.</li>
        <li><strong>Structural dropout 0.1</strong> — on attention scores <em>and</em> residual paths in every block.</li>
        <li><strong>Early stopping</strong> on validation loss — only the best-val configuration is saved.</li>
      </ol>`,
    codeLang: 'python — the reinforced loss',
    code: `<span class="tok-kw">def</span> <span class="tok-fn">compute_palm_loss</span>(logits, targets):
    ce = F.cross_entropy(logits_flat, targets_flat,
                         label_smoothing=<span class="tok-num">0.1</span>)   <span class="tok-com"># calibration</span>
    z  = <span class="tok-num">1e-4</span> * (torch.logsumexp(logits, -<span class="tok-num">1</span>) ** <span class="tok-num">2</span>).mean()  <span class="tok-com"># PaLM z-loss</span>
    <span class="tok-kw">return</span> ce + z`,
  },

  /* ---------------- EXPERIMENTAL CORES ---------------- */
  {
    id: 'spiking', cat: 'experimental', route: '/ai/spiking', emoji: '⚡',
    name: 'KitlerNet-MaximalBio', tagline: 'Spiking (SNN)', badge: 'SNN', badgeClass: 'experimental',
    power: 12, file: 'assets/cores/kitlernet_maximalbio.py', fileName: 'kitlernet_maximalbio.py',
    blurb: 'A biologically extreme spiking cortical network — six interacting brain mechanisms, no plain backprop MLP.',
    specs: [
      { k: 'Type', v: 'Spiking Neural Net' }, { k: 'Neurons', v: 'LIF · 2 × 192' },
      { k: 'Learning', v: 'STDP + backprop' }, { k: 'Context', v: '96 chars' },
      { k: 'Plasticity', v: 'Dopamine-gated' }, { k: 'Delays', v: '1–3 step axonal' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Features — six mechanisms per cortical layer</h2>
      <div class="aicore-mech">
        <div class="aicore-m"><b>1 · LIF neurons</b><p>Leaky integrate-and-fire membranes with a surrogate-gradient spike (Heaviside forward, fast-sigmoid backward).</p></div>
        <div class="aicore-m"><b>2 · STDP</b><p>Unsupervised pre/post spike-timing traces grow a local plastic weight matrix — LTP minus LTD.</p></div>
        <div class="aicore-m"><b>3 · Homeostasis</b><p>Each neuron tracks its firing rate and nudges its own threshold toward a target frequency.</p></div>
        <div class="aicore-m"><b>4 · Lateral inhibition</b><p>A spike injects negative current into neighbors next step — winner-take-all.</p></div>
        <div class="aicore-m"><b>5 · Dopamine gating</b><p>A global reward scalar scales every STDP update; a sharp loss drop doubles plasticity.</p></div>
        <div class="aicore-m"><b>6 · Axonal delays</b><p>Each neuron routes its spike 1–3 steps into the future through a delay buffer.</p></div>
      </div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made</h2>
      <ol class="wb-steps">
        <li>Chars embed + position, then flow through <strong>2 cortical layers</strong>, each a full simulation loop over 96 time-steps.</li>
        <li>Every step integrates input, fires against homeostatic thresholds, resets, then applies inhibition, delays, STDP and dopamine — all <em>outside</em> autograd.</li>
        <li>Only task synapses + readout train via <strong>AdamW</strong>; the six bio-mechanisms self-organize locally.</li>
        <li>Eval reports <strong>homeostatic threshold stability</strong> (vth std + mean rate per layer) alongside loss.</li>
      </ol>`,
    codeLang: 'python — surrogate-gradient spike',
    code: `<span class="tok-kw">class</span> <span class="tok-fn">SurrogateSpike</span>(torch.autograd.Function):
    <span class="tok-kw">def</span> <span class="tok-fn">forward</span>(ctx, v):
        <span class="tok-kw">return</span> (v > <span class="tok-num">0</span>).float()                 <span class="tok-com"># sharp Heaviside</span>
    <span class="tok-kw">def</span> <span class="tok-fn">backward</span>(ctx, g):
        <span class="tok-kw">return</span> g * (<span class="tok-num">1</span> / (<span class="tok-num">10</span>*v.abs() + <span class="tok-num">1</span>)**<span class="tok-num">2</span>)  <span class="tok-com"># fast-sigmoid</span>`,
  },
  {
    id: 'fwp', cat: 'experimental', route: '/ai/fwp', emoji: '🧩',
    name: 'KitlerNet-FWP', tagline: 'Fast Weight Programmer', badge: 'BASE', badgeClass: 'original',
    power: 30, file: 'assets/cores/kitlernet_fwp.py', fileName: 'kitlernet_fwp.py',
    blurb: "The hidden state writes its own low-rank delta-weights every token (Schmidhuber '92 / Schlag '21).",
    specs: [
      { k: 'Type', v: 'Fast-weight transformer' }, { k: 'Size', v: '4 × 256-dim' },
      { k: 'Fast weight', v: 'Rank-4 outer product' }, { k: 'Attention', v: '4-head SDPA' },
      { k: 'Context', v: '128 chars' }, { k: 'Params', v: '≈ 4M' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Features</h2>
      <ul>
        <li><strong>Per-token dynamic weights</strong> — the FFN's first projection is <code class="inline-code">W0 + a·bᵀ</code>, a and b generated from the token itself.</li>
        <li><strong>Memory-tractable</strong> — the delta never materializes a full d×d matrix; two einsums keep it CPU-feasible.</li>
        <li><strong>Fully differentiable</strong> end-to-end — no local rules, just backprop through the hypernetwork.</li>
      </ul>
      <div class="aicore-flow"><span>x</span><em>→</em><span class="hl">W0·x</span><em>+</em><span class="hl">(x·b)·a</span><em>→</em><span>y</span></div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made</h2>
      <p>Standard RMSNorm + SDPA attention block, then a fast-weight GELU FFN. The generators <code class="inline-code">gen_a</code> / <code class="inline-code">gen_b</code> map the hidden state to the two rank-4 vectors that modulate the projection.</p>`,
    codeLang: 'python — the fast-weight linear',
    code: `<span class="tok-kw">def</span> <span class="tok-fn">forward</span>(self, x):
    base  = self.W0(x)                              <span class="tok-com"># static weight</span>
    a = self.gen_a(x).view(B,T,rank,D)
    b = self.gen_b(x).view(B,T,rank,D)
    coeff = torch.einsum(<span class="tok-str">"btd,btrd->btr"</span>, x, b)   <span class="tok-com"># x · b</span>
    fast  = torch.einsum(<span class="tok-str">"btr,btrd->btd"</span>, coeff, a) <span class="tok-com"># (x·b)·a</span>
    <span class="tok-kw">return</span> base + self.scale*fast`,
  },
  {
    id: 'sclp', cat: 'experimental', route: '/ai/sclp', emoji: '🔀',
    name: 'KitlerNet-SCLP', tagline: 'Cross-Layer Plasticity', badge: 'ENTANGLED', badgeClass: 'flagship',
    power: 38, file: 'assets/cores/kitlernet_sclp.py', fileName: 'kitlernet_sclp.py',
    blurb: 'Every projection is a fast-weight layer, modulated by feedback from the layers above and below.',
    specs: [
      { k: 'Type', v: 'Cross-layer fast-weight' }, { k: 'Size', v: '4 × 256-dim' },
      { k: 'Fast weight', v: '6 per block' }, { k: 'Feedback', v: 'N−1 now + N+1 delayed' },
      { k: 'Reg.', v: 'z-loss · 0.3 decay' }, { k: 'Params', v: '≈ 15M' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Features</h2>
      <ul>
        <li><strong>Fast weights everywhere</strong> — all attention projections <em>and</em> both FFN matrices are dynamically modulated.</li>
        <li><strong>Cross-layer feedback</strong> — each layer's modulation is conditioned on layer N−1's current output and layer N+1's <em>previous-step</em> output.</li>
        <li><strong>Deadlock-free</strong> — the delayed N+1 wire keeps it a valid DAG within a step while feeling bidirectional.</li>
        <li><strong>Hardened</strong> — z-loss + label smoothing + isolated 0.3 weight decay.</li>
      </ul>
      <div class="aicore-flow"><span>fb: N−1 now</span><em>+</em><span>N+1 delayed</span><em>→</em><span class="hl">fuse → mod</span><em>→</em><span>drives every fast weight</span></div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made</h2>
      <p>Each block fuses the two feedback wires into one modulation signal that generates the low-rank deltas for all six fast-weight projections (Q, K, V, O, and both FFN matrices).</p>`,
    codeLang: 'python — cross-layer modulation',
    code: `mod = self.fuse(torch.cat([fb_prev_layer, fb_next_delayed], -<span class="tok-num">1</span>))
q = self.q(h, mod); k = self.k(h, mod); v = self.v(h, mod)  <span class="tok-com"># all fast-weight</span>
<span class="tok-com"># fb_prev = layer N-1 this step · fb_next = layer N+1 last step</span>`,
  },
  {
    id: 'chh', cat: 'experimental', route: '/ai/chh', emoji: '♾️',
    name: 'KitlerNet-CHH', tagline: 'Continual Hebbian', badge: 'CONTINUAL', badgeClass: 'flagship',
    power: 45, file: 'assets/cores/kitlernet_chh.py', fileName: 'kitlernet_chh.py',
    blurb: 'Persistent Hebbian memory traces carried across token-steps, plus a local predictive-coding loss.',
    specs: [
      { k: 'Type', v: 'Hebbian fast-weight' }, { k: 'Size', v: '4 × 256-dim' },
      { k: 'Memory', v: 'Persistent trace M' }, { k: 'Decay λ', v: '0.9' },
      { k: 'Aux loss', v: 'Local predictive coding' }, { k: 'Params', v: '≈ 15M' },
    ],
    designHTML: `
      <h2 id="design" class="aicore-h">Features</h2>
      <ul>
        <li><strong>Persistent Hebbian traces</strong> — each fast-weight layer carries a memory <code class="inline-code">M ← λ·M + a⊗b</code> across token-steps.</li>
        <li><strong>Local predictive coding</strong> — every block predicts the next block's input; the summed error is added to the global loss.</li>
        <li><strong>Live streaming adaptation</strong> — during generation the traces keep updating per token, so the model tunes to context as it reads.</li>
        <li><strong>Hardened</strong> — z-loss + label smoothing + isolated 0.3 weight decay.</li>
      </ul>
      <div class="aicore-flow"><span>a⊗b this step</span><em>→</em><span class="hl">M = λM + a⊗b</span><em>→</em><span>x·M = fast term</span><em>→</em><span>carry M forward</span></div>`,
    howHTML: `
      <h2 id="how" class="aicore-h">How it's made</h2>
      <p>Same cross-layer plastic block as SCLP, but each fast-weight layer accumulates a persistent low-rank memory across steps (detached between steps to keep the graph finite) and applies it to the current input.</p>`,
    codeLang: 'python — the persistent trace',
    code: `hebb = torch.einsum(<span class="tok-str">"btrd,btre->bde"</span>, a, b) / (T*rank)
M = HEBB_LAMBDA * self.M + hebb        <span class="tok-com"># accumulate across steps</span>
self.M = M.detach()                    <span class="tok-com"># carry forward, cut graph</span>
fast = torch.einsum(<span class="tok-str">"btd,bde->bte"</span>, x, M)  <span class="tok-com"># apply memory</span>`,
  },
];

const coreListRow = (c) => `
  <a class="ailist-row" href="#${c.route}" data-link>
    <div class="ailist-emoji">${c.emoji}</div>
    <div class="ailist-main">
      <div class="ailist-name">${c.name}<span class="ailist-tag">${c.tagline}</span></div>
      <div class="ailist-sub">${c.blurb}</div>
    </div>
    <div class="ailist-meta">
      <span class="aicore-badge ${c.badgeClass}">${c.badge}</span>
      <div class="ailist-metric"><div class="ailist-power${c.power > 100 ? ' over' : ''}"><i style="width:${Math.max(0, Math.min(c.power, 100))}%"></i></div><span class="ailist-pct">${c.power}%</span></div>
    </div>
    <span class="ailist-arrow">›</span>
  </a>`;

/* a core that ships in multiple builds — one list row that drops down to its variants */
const coreById = (id) => AI_CORES.find(c => c.id === id);

const HGEM_GROUP = {
  emoji: '🧠', name: 'HGEM · HybridBrain', tagline: 'Cognitive Engine',
  bubble: '3 BUILDS',
  blurb: 'A cognitive engine with fast weights, Hebbian memory, a grounded world model, a persistent identity and a narrative head — shipping in three builds. Click to choose CPU, GPU or TPU.',
  variantIds: ['hgem2tpu', 'hgem2', 'hgem'],
};

const renderGroupRow = (g) => {
  const vs = g.variantIds.map(coreById).filter(Boolean);
  const top = Math.max(...vs.map(v => v.power));
  return `
  <div class="ailist-groupwrap">
    <div class="ailist-row ailist-group" data-group-toggle role="button" tabindex="0" aria-expanded="false">
      <span class="ailist-bubble">◆ ${g.bubble}</span>
      <div class="ailist-emoji">${g.emoji}</div>
      <div class="ailist-main">
        <div class="ailist-name">${g.name}<span class="ailist-tag">${g.tagline}</span></div>
        <div class="ailist-sub">${g.blurb}</div>
      </div>
      <div class="ailist-meta">
        <div class="ailist-metric"><div class="ailist-power${top > 100 ? ' over' : ''}"><i style="width:${Math.max(0, Math.min(top, 100))}%"></i></div><span class="ailist-pct">${top}%</span></div>
        <span class="ailist-grouphint">choose a build ▾</span>
      </div>
    </div>
    <div class="ailist-variants" hidden>
      ${vs.map(v => `
        <a class="ailist-variant" href="#${v.route}" data-link>
          <span class="v-emoji">${v.variantEmoji || v.emoji}</span>
          <span class="v-main">
            <span class="v-name">${v.name}${v.variantNew ? '<span class="v-new">NEW</span>' : ''}</span>
            <span class="v-note">${v.variantNote || ''}</span>
          </span>
          <span class="v-badge aicore-badge ${v.badgeClass}">${v.variantLabel || v.badge}</span>
          <span class="v-metric"><span class="v-bar${v.power > 100 ? ' over' : ''}"><i style="width:${Math.max(0, Math.min(v.power, 100))}%"></i></span><b>${v.power}%</b><small>smart</small></span>
        </a>`).join('')}
    </div>
  </div>`;
};

const coreDetailHTML = (c) => {
  const backRoute = c.cat === 'experimental' ? '/ai-experimental' : '/ai';
  const backLabel = c.cat === 'experimental' ? 'Experimental AI' : 'AI';
  return `
    <a class="ai-back" href="#${backRoute}" data-link>← Back to ${backLabel}</a>
    <span class="eyebrow">AI CORE · ${c.tagline.toUpperCase()}</span>
    <div class="aicore-head">
      <div><h1 style="margin:0">${c.emoji} ${c.name}</h1><p class="aicore-sub">${c.blurb}</p></div>
      <span class="aicore-badge ${c.badgeClass}">${c.badge}</span>
    </div>
    ${powerMeter(c.power)}
    <div class="aicore-specs">${c.specs.map(s => `<div class="aicore-spec"><span>${s.k}</span><b>${s.v}</b></div>`).join('')}</div>
    ${c.designHTML}
    ${c.howHTML}
    ${code(c.codeLang, c.code)}
    <a class="aicore-dl" href="${c.file}" download>⬇ Download ${c.fileName}</a>`;
};

/* per-core detail routes, generated from AI_CORES */
const AI_DETAIL_PAGES = Object.fromEntries(AI_CORES.map(c => [c.route, {
  section: 'ai', title: c.name,
  html: () => coreDetailHTML(c),
}]));

/* =========================================================
   PAGES
   ========================================================= */
const PAGES = {

  ...AI_DETAIL_PAGES,

/* ----------------------- HOME (Discord-style DOI shell) ----------------------- */
'/overview': {
  section: 'overview', title: 'Home',
  html: () => (typeof window !== 'undefined' && window.DOI) ? window.DOI.renderHome() : ''
},

'/admin': {
  section: 'admin', title: 'Admin Console',
  html: () => `
    <span class="eyebrow">ADMIN CONSOLE</span>
    <h1>Admin Console</h1>
    <p class="lead">Restricted tooling. The bridge, script vault, world builder, and vehicle grid live here.</p>
    ${(typeof window !== 'undefined' && window.DOI) ? window.DOI.renderAdminHub() : ''}
  `
},

'/overview-howto': {
  section: 'overview', title: 'How this hub works',
  html: () => `
    <span class="eyebrow">GETTING STARTED</span>
    <h1>How the DOI terminal works</h1>
    <p class="lead">Everything you need to navigate the DOI network in under a minute.</p>

    <h2 id="nav">Navigation</h2>
    <p>The DOI home is a Discord-style shell: the <strong>server rail</strong> on the far left jumps between areas, the <strong>channel list</strong> shows chat channels and forum threads, the <strong>main area</strong> holds the conversation, and the <strong>right rail</strong> shows online operatives.</p>

    <h2 id="features">Features</h2>
    <div class="card-grid">
      <div class="card"><div class="card-icon">#</div><h4>Chat channels</h4><p>General, ops, blackline. Messages saved locally.</p></div>
      <div class="card"><div class="card-icon">▤</div><h4>Forums</h4><p>Anyone can start a thread. Each thread has its own chat.</p></div>
      <div class="card"><div class="card-icon">◆</div><h4>Profile</h4><p>Bottom-left widget. Callsign, bio, avatar.</p></div>
      <div class="card"><div class="card-icon">⚑</div><h4>Admin</h4><p>Bridge, scripts, world, drive — behind the shield.</p></div>
    </div>

    <div class="callout tip"><span class="ico">✅</span><p>Everything is client-side. Your profile, threads, and chat live in this browser's localStorage.</p></div>
    ${pager({ href: '/overview', title: 'Home' }, { href: '/ai', title: 'AI Cores' })}
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

    ${pager({ href: '/bf-maps', title: 'Decoder & Converter' }, { href: '/admin', title: 'Admin Console' })}
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

    ${pager({ href: '/map-drive', title: 'Map Drive' }, { href: '/ai', title: 'AI Cores' })}
  `
},

/* ----------------------- AI (main cores) ----------------------- */
'/ai': {
  section: 'ai', title: 'AI',
  html: () => `
    <span class="eyebrow">NEURAL CORES · KITLERNET FAMILY</span>
    <h1>AI</h1>
    <p class="lead">The main KitlerNet cores — hand-built, CPU-trained language models. Scroll the list and <strong>click any core to open its full details</strong>: core design, how it's made, power level, and a downloadable ready-to-run Python file.</p>

    <div class="callout info"><span class="ico">🧠</span><p>Power is measured against <b>GPT-2</b>: <b>100% = GPT-2 (124M) level</b>, and a core can be set above 100 if it beats it. Every core trains on Tiny Shakespeare, clamps to 4 CPU threads, and checkpoints so you can <kbd>Ctrl+C</kbd> and resume.</p></div>

    <div class="ailist">
      ${renderGroupRow(HGEM_GROUP)}
      ${AI_CORES.filter(c => c.cat === 'main').map(coreListRow).join('')}
    </div>

    <p style="margin-top:18px">Looking for the neuromorphic &amp; plastic prototypes? <a class="inline" href="#/ai-experimental" data-link>Open Experimental AI →</a></p>

    ${pager({ href: '/cpu-builder', title: 'CPU Builder' }, { href: '/ai-experimental', title: 'Experimental AI' })}
  `
},

/* ----------------------- EXPERIMENTAL AI ----------------------- */
'/ai-experimental': {
  section: 'ai', title: 'Experimental AI',
  html: () => `
    <span class="eyebrow">RESEARCH CORES · WEIGHTS THAT CHANGE WHILE RUNNING</span>
    <h1>Experimental AI</h1>
    <p class="lead">The lab side of the family: a spiking cortex, fast-weight programmers, cross-layer plasticity, and continual Hebbian learning. Each one takes a different idea to an extreme. <strong>Click a core to open its details.</strong></p>

    <div class="callout info"><span class="ico">🧪</span><p>These share one idea — <strong>weights that change while the network runs</strong> — but they're research prototypes, so their power sits well under the main cores on the GPT-2 scale.</p></div>

    <div class="ailist">
      ${AI_CORES.filter(c => c.cat === 'experimental').map(coreListRow).join('')}
    </div>

    <p style="margin-top:18px">Back to the production cores? <a class="inline" href="#/ai" data-link>Open AI →</a></p>

    ${pager({ href: '/ai', title: 'AI' }, { href: '/map-drive', title: 'Map Drive' })}
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


};

/* search index built from the pages */
const SEARCH_INDEX = Object.entries(PAGES).map(([href, p]) => ({
  href, section: p.section, title: p.title,
  text: p.html().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)
}));
