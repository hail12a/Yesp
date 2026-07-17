"""
KitlerNet v2x — CPU-optimized for i3 14100F (4 physical cores, AVX2, no AVX-512)

Every optimization here is one that actually helps on THIS chip. Where a common
"speed trick" only helps on server CPUs (AVX-512 / AMX), it's noted and skipped.

Honest speed expectation vs plain v2: ~1.5-2x, mostly from torch.compile (AVX2
auto-vectorization) + thread pinning + a smaller per-step footprint.

Run it with the launch script (kitler_run.sh) so the env vars are set, OR just:
    source ~/gpt-env/bin/activate
    python3 ~/kitlernet_v2x.py
"""

import os

# ── Thread / allocator tuning MUST be set before importing torch ──
# i3 14100F = 4 physical cores + 4 hyperthreads. For compute-bound matmul,
# pinning to the 4 REAL cores beats spreading across 8 logical threads
# (hyperthreads fight over the same FP units). This is a genuine win here.
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")
os.environ.setdefault("OMP_PROC_BIND", "CLOSE")
os.environ.setdefault("OMP_SCHEDULE", "STATIC")
os.environ.setdefault("KMP_BLOCKTIME", "1")

import math
import time
import json
import re
import collections
import urllib.request
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

torch.set_num_threads(4)          # 4 physical cores
torch.set_num_interop_threads(2)
torch.manual_seed(1337)

# oneDNN is bundled with PyTorch and gives the best FP32 matmul kernels on AVX2.
# It's on by default; this just makes sure nothing disabled it.
try:
    torch.backends.mkldnn.enabled = True
except Exception:
    pass

DEVICE = "cpu"

# ════════════════════════════════════════════════════════════════════
# CONFIG
# ════════════════════════════════════════════════════════════════════
# Sized so a training step stays snappy on 4 cores and RAM stays ~1-1.5GB.
# Bigger than v2 (deeper + wider) but not so big each step crawls.
N_EMBED    = 384
N_LAYERS   = 8
N_HEADS    = 6
N_KV_HEADS = 2          # GQA: 3 query heads share each KV head
VOCAB_SIZE = 4096       # BPE target

BLOCK_SIZE = 256
BATCH_SIZE = 16
GRAD_ACCUM = 2          # effective batch 32 — kept low so steps are fast
MAX_ITERS  = 99999
LR         = 3e-4
MIN_LR     = 3e-5
WARMUP     = 200
GRAD_CLIP  = 1.0

EVAL_EVERY = 250
SAVE_EVERY = 500

HOME       = Path.home()
CKPT       = HOME / "kitlernet_v2x.pth"
DATA_FILE  = HOME / "data.txt"
TOK_FILE   = HOME / "kitlernet_v2x_tokenizer.json"

print("=" * 52)
print("  KitlerNet v2x — tuned for i3 14100F (AVX2, 4 cores)")
print("=" * 52)
print(f"  threads: {torch.get_num_threads()} | mkldnn: {torch.backends.mkldnn.enabled}")

# ════════════════════════════════════════════════════════════════════
# DATA
# ════════════════════════════════════════════════════════════════════
if not DATA_FILE.exists():
    print("  downloading dataset...")
    urllib.request.urlretrieve(
        "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt",
        DATA_FILE,
    )

raw_text = DATA_FILE.read_text(encoding="utf-8", errors="ignore")
print(f"  data: {len(raw_text):,} chars")


# ════════════════════════════════════════════════════════════════════
# BPE TOKENIZER — trained once, cached to disk
# Fewer tokens per sentence = more meaning per step = faster learning.
# This is the single biggest "learns more per hour" win over v1/v2-char.
# ════════════════════════════════════════════════════════════════════
class BPETokenizer:
    def __init__(self, vocab_size=VOCAB_SIZE):
        self.vocab_size = vocab_size
        self.merges = {}
        self.vocab = {}
        self.inv_vocab = {}

    def _pairs(self, counts):
        p = collections.Counter()
        for word, freq in counts.items():
            s = word.split()
            for i in range(len(s) - 1):
                p[(s[i], s[i + 1])] += freq
        return p

    def _merge(self, pair, counts):
        out = {}
        bigram = " ".join(pair)
        rep = "".join(pair)
        for word, freq in counts.items():
            out[word.replace(bigram, rep)] = freq
        return out

    def train(self, text):
        print("  training BPE tokenizer (one-time)...")
        words = re.findall(r"\S+|\s", text[:500_000])
        counts = collections.Counter()
        for w in words:
            counts[" ".join(list(w)) + " </w>"] += 1
        base = set()
        for w in counts:
            base.update(w.split())
        self.vocab = {c: i for i, c in enumerate(sorted(base))}
        nxt = len(self.vocab)
        n_merges = self.vocab_size - nxt
        for i in range(n_merges):
            pairs = self._pairs(counts)
            if not pairs:
                break
            best = pairs.most_common(1)[0][0]
            counts = self._merge(best, counts)
            self.merges[best] = "".join(best)
            self.vocab["".join(best)] = nxt
            nxt += 1
            if i % 500 == 0:
                print(f"    merge {i}/{n_merges} | vocab {nxt}")
        for tok in ["<pad>", "<unk>", "<user>", "<assistant>", "<s>", "</s>"]:
            if tok not in self.vocab:
                self.vocab[tok] = nxt
                nxt += 1
        self.inv_vocab = {v: k for k, v in self.vocab.items()}
        print(f"  tokenizer ready | vocab {nxt}")

    def _bpe_word(self, word):
        w = " ".join(list(word)) + " </w>"
        order = list(self.merges.keys())
        while True:
            parts = w.split()
            cand = [(i, parts[i], parts[i + 1]) for i in range(len(parts) - 1)]
            cand = [(i, a, b) for i, a, b in cand if (a, b) in self.merges]
            if not cand:
                break
            i, a, b = min(cand, key=lambda x: order.index((x[1], x[2])))
            parts[i:i + 2] = [self.merges[(a, b)]]
            w = " ".join(parts)
        return w.split()

    def encode(self, text):
        unk = self.vocab.get("<unk>", 1)
        out = []
        for word in re.findall(r"\S+|\s", text):
            for piece in self._bpe_word(word):
                out.append(self.vocab.get(piece, unk))
        return out

    def decode(self, ids):
        toks = [self.inv_vocab.get(int(i), "<unk>") for i in ids]
        return "".join(t.replace("</w>", " ") for t in toks)

    def save(self, path):
        path.write_text(json.dumps({
            "merges": {f"{a}|||{b}": v for (a, b), v in self.merges.items()},
            "vocab": self.vocab,
        }))

    def load(self, path):
        d = json.loads(path.read_text())
        self.merges = {tuple(k.split("|||")): v for k, v in d["merges"].items()}
        self.vocab = d["vocab"]
        self.inv_vocab = {int(v): k for k, v in self.vocab.items()}


tok = BPETokenizer()
if TOK_FILE.exists():
    tok.load(TOK_FILE)
    print(f"  loaded tokenizer | vocab {len(tok.vocab)}")
else:
    tok.train(raw_text)
    tok.save(TOK_FILE)

VOCAB = len(tok.vocab)

# ── Encode + cache token stream to disk so re-runs skip re-encoding ──
TOKENS_FILE = HOME / "kitlernet_v2x_tokens.pt"
if TOKENS_FILE.exists():
    data = torch.load(TOKENS_FILE)
    print(f"  loaded cached tokens: {len(data):,}")
else:
    print("  encoding corpus...")
    data = torch.tensor(tok.encode(raw_text), dtype=torch.long)
    torch.save(data, TOKENS_FILE)
    print(f"  tokens: {len(data):,} | {len(raw_text)/len(data):.1f} chars/token")

split = int(0.9 * len(data))
train_data, val_data = data[:split], data[split:]


def get_batch(which):
    d = train_data if which == "train" else val_data
    ix = torch.randint(len(d) - BLOCK_SIZE - 1, (BATCH_SIZE,))
    x = torch.stack([d[i:i + BLOCK_SIZE] for i in ix])
    y = torch.stack([d[i + 1:i + 1 + BLOCK_SIZE] for i in ix])
    return x, y


# ════════════════════════════════════════════════════════════════════
# MODEL — RMSNorm + RoPE + GQA + SwiGLU, all bias-free (2025 stack)
# ════════════════════════════════════════════════════════════════════
class RMSNorm(nn.Module):
    def __init__(self, dim, eps=1e-6):
        super().__init__()
        self.w = nn.Parameter(torch.ones(dim))
        self.eps = eps

    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.w


def build_rope(head_dim, seq_len, base=10000.0):
    inv = 1.0 / (base ** (torch.arange(0, head_dim, 2).float() / head_dim))
    t = torch.arange(seq_len).float()
    f = torch.outer(t, inv)
    emb = torch.cat([f, f], dim=-1)
    return emb.cos(), emb.sin()


def rotate_half(x):
    h = x.shape[-1] // 2
    return torch.cat([-x[..., h:], x[..., :h]], dim=-1)


def apply_rope(q, k, cos, sin):
    T = q.shape[2]
    c = cos[:T][None, None]
    s = sin[:T][None, None]
    return q * c + rotate_half(q) * s, k * c + rotate_half(k) * s


class GQA(nn.Module):
    def __init__(self):
        super().__init__()
        self.hd = N_EMBED // N_HEADS
        self.g = N_HEADS // N_KV_HEADS
        self.q = nn.Linear(N_EMBED, N_HEADS * self.hd, bias=False)
        self.k = nn.Linear(N_EMBED, N_KV_HEADS * self.hd, bias=False)
        self.v = nn.Linear(N_EMBED, N_KV_HEADS * self.hd, bias=False)
        self.o = nn.Linear(N_EMBED, N_EMBED, bias=False)
        cos, sin = build_rope(self.hd, BLOCK_SIZE)
        self.register_buffer("cos", cos, persistent=False)
        self.register_buffer("sin", sin, persistent=False)

    def forward(self, x):
        B, T, C = x.shape
        q = self.q(x).view(B, T, N_HEADS, self.hd).transpose(1, 2)
        k = self.k(x).view(B, T, N_KV_HEADS, self.hd).transpose(1, 2)
        v = self.v(x).view(B, T, N_KV_HEADS, self.hd).transpose(1, 2)
        q, k = apply_rope(q, k, self.cos, self.sin)
        k = k.repeat_interleave(self.g, dim=1)
        v = v.repeat_interleave(self.g, dim=1)
        # PyTorch's fused SDPA picks the best CPU kernel and does causal masking
        # without materializing a T x T score matrix — the fastest attention
        # available to us on this chip.
        out = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.o(out)


class SwiGLU(nn.Module):
    def __init__(self):
        super().__init__()
        h = int(N_EMBED * 8 / 3)
        h = (h + 63) // 64 * 64      # round to 64 so matmuls stay AVX2-friendly
        self.w1 = nn.Linear(N_EMBED, h, bias=False)
        self.w2 = nn.Linear(N_EMBED, h, bias=False)
        self.w3 = nn.Linear(h, N_EMBED, bias=False)

    def forward(self, x):
        return self.w3(F.silu(self.w1(x)) * self.w2(x))


class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.n1, self.n2 = RMSNorm(N_EMBED), RMSNorm(N_EMBED)
        self.att, self.ff = GQA(), SwiGLU()

    def forward(self, x):
        x = x + self.att(self.n1(x))
        x = x + self.ff(self.n2(x))
        return x


class KitlerNetV2X(nn.Module):
    def __init__(self, vocab):
        super().__init__()
        self.emb = nn.Embedding(vocab, N_EMBED)
        self.blocks = nn.ModuleList([Block() for _ in range(N_LAYERS)])
        self.norm = RMSNorm(N_EMBED)
        self.head = nn.Linear(N_EMBED, vocab, bias=False)
        self.emb.weight = self.head.weight  # weight tying
        self.apply(self._init)
        # scaled init on residual projections (GPT-2 trick, stabilizes deep nets)
        for n, p in self.named_parameters():
            if n.endswith("o.weight") or n.endswith("w3.weight"):
                nn.init.normal_(p, 0.0, 0.02 / math.sqrt(2 * N_LAYERS))

    def _init(self, m):
        if isinstance(m, nn.Linear):
            nn.init.normal_(m.weight, 0.0, 0.02)
        elif isinstance(m, nn.Embedding):
            nn.init.normal_(m.weight, 0.0, 0.02)

    def forward(self, idx, targets=None):
        x = self.emb(idx)
        for b in self.blocks:
            x = b(x)
        x = self.norm(x)
        logits = self.head(x)
        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)), targets.view(-1)
            )
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, n, temp=0.8, top_k=40):
        for _ in range(n):
            logits, _ = self(idx[:, -BLOCK_SIZE:])
            logits = logits[:, -1, :] / temp
            v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
            logits[logits < v[:, [-1]]] = -float("inf")
            idx = torch.cat([idx, torch.multinomial(F.softmax(logits, -1), 1)], 1)
        return idx


model = KitlerNetV2X(VOCAB).to(DEVICE)
n_params = sum(p.numel() for p in model.parameters()) / 1e6
print(f"  params: {n_params:.1f}M | vocab {VOCAB} | {N_LAYERS}L/{N_EMBED}d")

# ── torch.compile: the real speed lever on this chip ──
# Inductor generates AVX2-vectorized C++ kernels and fuses pointwise ops.
# First step is slow (compiling); every step after is faster. If compile
# ever errors on your setup, we silently fall back to eager so training
# still runs.
compiled = model
try:
    compiled = torch.compile(model, backend="inductor", mode="max-autotune")
    print("  torch.compile: ON (AVX2 inductor, max-autotune)")
except Exception as e:
    print(f"  torch.compile: OFF ({type(e).__name__}) — running eager")

# ── AdamW; fused=True isn't available/beneficial on CPU, so plain is correct ──
optim = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9, 0.95),
                          weight_decay=0.1, eps=1e-8)


def lr_at(step):
    if step < WARMUP:
        return LR * (step + 1) / WARMUP
    prog = (step - WARMUP) / max(1, MAX_ITERS - WARMUP)
    return MIN_LR + 0.5 * (LR - MIN_LR) * (1 + math.cos(math.pi * prog))


start = 0
best = float("inf")
if CKPT.exists():
    ck = torch.load(CKPT, map_location="cpu")
    model.load_state_dict(ck["model"])
    optim.load_state_dict(ck["optim"])
    start = ck["iter"]
    best = ck.get("best", float("inf"))
    print(f"  resumed @ step {start} (best val {best:.4f})")


@torch.no_grad()
def eval_loss():
    model.eval()
    out = {}
    for w in ("train", "val"):
        out[w] = sum(compiled(*get_batch(w))[1].item() for _ in range(10)) / 10
    model.train()
    return out


@torch.no_grad()
def sample():
    model.eval()
    ctx = torch.zeros((1, 1), dtype=torch.long)
    s = tok.decode(model.generate(ctx, 200)[0].tolist())
    model.train()
    return s


print("=" * 52)
print("  training — Ctrl+C to stop & save")
print("=" * 52)

optim.zero_grad(set_to_none=True)
t0 = time.time()
try:
    for it in range(start, MAX_ITERS):
        for g in optim.param_groups:
            g["lr"] = lr_at(it)
        acc = 0.0
        for _ in range(GRAD_ACCUM):
            xb, yb = get_batch("train")
            _, loss = compiled(xb, yb)
            (loss / GRAD_ACCUM).backward()
            acc += loss.item() / GRAD_ACCUM
        torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
        optim.step()
        optim.zero_grad(set_to_none=True)

        if it % 10 == 0:
            dt = (time.time() - t0) / max(1, it - start + 1)
            print(f"step {it:5d} | loss {acc:.4f} | lr {lr_at(it):.2e} | {dt*1000:.0f}ms/step")

        if it % EVAL_EVERY == 0 and it > start:
            l = eval_loss()
            print(f"\n  [eval {it}] train {l['train']:.4f} | val {l['val']:.4f}")
            print(f"  sample: {sample()[:180]}\n")
            if l["val"] < best:
                best = l["val"]
                torch.save({"model": model.state_dict(), "optim": optim.state_dict(),
                            "iter": it, "best": best}, CKPT)
                print(f"  ✓ saved best (val {best:.4f})")

        if it % SAVE_EVERY == 0 and it > start:
            torch.save({"model": model.state_dict(), "optim": optim.state_dict(),
                        "iter": it, "best": best}, CKPT)

except KeyboardInterrupt:
    torch.save({"model": model.state_dict(), "optim": optim.state_dict(),
                "iter": it, "best": best}, CKPT)
    print(f"\n  saved @ step {it} → {CKPT}")
    print("  sample:\n" + sample())
