"""
KitlerNet v3x — Regularized & CPU-optimized for i3 14100F (4 physical cores, AVX2)

Integrated with:
1. PaLM logit z-loss auxiliary regularization
2. Explicitly separated AdamW parameter groups for targeted High Weight Decay
3. Standard Label Smoothing in cross-entropy loss calculation
"""

import os

# ── Thread / allocator tuning MUST be set before importing torch ──
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

try:
    torch.backends.mkldnn.enabled = True
except Exception:
    pass

DEVICE = "cpu"

# ════════════════════════════════════════════════════════════════════
# CONFIG
# ════════════════════════════════════════════════════════════════════
N_EMBED    = 384
N_LAYERS   = 8
N_HEADS    = 6
N_KV_HEADS = 2          # GQA footprint
VOCAB_SIZE = 4096       # BPE target

BLOCK_SIZE = 256
BATCH_SIZE = 16
GRAD_ACCUM = 2          
MAX_ITERS  = 99999
LR         = 3e-4
MIN_LR     = 3e-5
WARMUP     = 200
GRAD_CLIP  = 1.0

# ANTI-OVERFIT ARMOR SETTINGS
WEIGHT_DECAY    = 0.25   # Hardcore L2 penalty to stop weights from blowing up
LABEL_SMOOTHING = 0.1   # Prevents the model from chasing 100% confidence markers
Z_LOSS_COEFF    = 1e-4   # PaLM logit z-loss penalty factor

EVAL_EVERY = 250
SAVE_EVERY = 500

HOME       = Path.home()
CKPT       = HOME / "kitlernet_v2x.pth"
DATA_FILE  = HOME / "data.txt"
TOK_FILE   = HOME / "kitlernet_v2x_tokenizer.json"

print("=" * 52)
print("  KitlerNet v3x — PaLM Regularization on i3 14100F")
print("=" * 52)

# ════════════════════════════════════════════════════════════════════
# DATA & BPE TOKENIZER (Unchanged to maintain consistency)
# ════════════════════════════════════════════════════════════════════
if not DATA_FILE.exists():
    print("  downloading dataset...")
    urllib.request.urlretrieve(
        "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt",
        DATA_FILE,
    )

raw_text = DATA_FILE.read_text(encoding="utf-8", errors="ignore")

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
        print("  training BPE tokenizer...")
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
        for tok in ["<pad>", "<unk>", "<user>", "<assistant>", "<s>", "</s>"]:
            if tok not in self.vocab:
                self.vocab[tok] = nxt
                nxt += 1
        self.inv_vocab = {v: k for k, v in self.vocab.items()}

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
else:
    tok.train(raw_text)
    tok.save(TOK_FILE)

VOCAB = len(tok.vocab)

TOKENS_FILE = HOME / "kitlernet_v2x_tokens.pt"
if TOKENS_FILE.exists():
    data = torch.load(TOKENS_FILE)
else:
    data = torch.tensor(tok.encode(raw_text), dtype=torch.long)
    torch.save(data, TOKENS_FILE)

split = int(0.9 * len(data))
train_data, val_data = data[:split], data[split:]

def get_batch(which):
    d = train_data if which == "train" else val_data
    ix = torch.randint(len(d) - BLOCK_SIZE - 1, (BATCH_SIZE,))
    x = torch.stack([d[i:i + BLOCK_SIZE] for i in ix])
    y = torch.stack([d[i + 1:i + 1 + BLOCK_SIZE] for i in ix])
    return x, y

# ════════════════════════════════════════════════════════════════════
# CORE ARCHITECTURE (RMSNorm + GQA + SwiGLU + Structural Dropout)
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
        self.attn_dropout = nn.Dropout(0.1)

    def forward(self, x):
        B, T, C = x.shape
        q = self.q(x).view(B, T, N_HEADS, self.hd).transpose(1, 2)
        k = self.k(x).view(B, T, N_KV_HEADS, self.hd).transpose(1, 2)
        v = self.v(x).view(B, T, N_KV_HEADS, self.hd).transpose(1, 2)
        q, k = apply_rope(q, k, self.cos, self.sin)
        k = k.repeat_interleave(self.g, dim=1)
        v = v.repeat_interleave(self.g, dim=1)
        
        out = F.scaled_dot_product_attention(q, k, v, is_causal=True, dropout_p=0.1 if self.training else 0.0)
        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.o(out)

class SwiGLU(nn.Module):
    def __init__(self):
        super().__init__()
        h = int(N_EMBED * 8 / 3)
        h = (h + 63) // 64 * 64
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
        self.residual_dropout = nn.Dropout(0.1)

    def forward(self, x):
        x = x + self.residual_dropout(self.att(self.n1(x)))
        x = x + self.residual_dropout(self.ff(self.n2(x)))
        return x

class KitlerNetV3X(nn.Module):
    def __init__(self, vocab):
        super().__init__()
        self.emb = nn.Embedding(vocab, N_EMBED)
        self.blocks = nn.ModuleList([Block() for _ in range(N_LAYERS)])
        self.norm = RMSNorm(N_EMBED)
        self.head = nn.Linear(N_EMBED, vocab, bias=False)
        self.emb.weight = self.head.weight
        self.apply(self._init)
        for n, p in self.named_parameters():
            if n.endswith("o.weight") or n.endswith("w3.weight"):
                nn.init.normal_(p, 0.0, 0.02 / math.sqrt(2 * N_LAYERS))

    def _init(self, m):
        if isinstance(m, nn.Linear) or isinstance(m, nn.Embedding):
            nn.init.normal_(m.weight, 0.0, 0.02)

    def forward(self, idx):
        x = self.emb(idx)
        for b in self.blocks:
            x = b(x)
        x = self.norm(x)
        logits = self.head(x)
        return logits

    @torch.no_grad()
    def generate(self, idx, n, temp=0.8, top_k=40):
        for _ in range(n):
            logits = self(idx[:, -BLOCK_SIZE:])
            logits = logits[:, -1, :] / temp
            v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
            logits[logits < v[:, [-1]]] = -float("inf")
            idx = torch.cat([idx, torch.multinomial(F.softmax(logits, -1), 1)], 1)
        return idx

model = KitlerNetV3X(VOCAB).to(DEVICE)

# ════════════════════════════════════════════════════════════════════
# DYNAMIC PA LM Z-LOSS REGULARIZATION CRITERION
# ════════════════════════════════════════════════════════════════════
def compute_palm_loss(logits, targets):
    # Flatten tensors appropriately for standard cross entropy formats
    logits_flat = logits.view(-1, logits.size(-1))
    targets_flat = targets.view(-1)
    
    # 1. Base Loss calculations injected with Label Smoothing
    ce_loss = F.cross_entropy(logits_flat, targets_flat, label_smoothing=LABEL_SMOOTHING)
    
    # 2. PaLM Logit Z-loss constraint loop
    max_logits = torch.logsumexp(logits, dim=-1)
    z_loss = Z_LOSS_COEFF * torch.mean(max_logits ** 2)
    
    return ce_loss + z_loss

# ── torch.compile execution boundary ──
compiled = model
try:
    compiled = torch.compile(model, backend="inductor", mode="max-autotune")
    print("  torch.compile: ON (AVX2 Inductor max-autotune active)")
except Exception as e:
    print(f"  torch.compile: OFF ({type(e).__name__}) — running eager pipeline")

# ════════════════════════════════════════════════════════════════════
# OPTIMIZATION ROUTINE (Targeted Weight Decay Param Isolation)
# ════════════════════════════════════════════════════════════════════
decay_params = []
no_decay_params = []
for name, param in model.named_parameters():
    if param.requires_grad:
        # Filter norm layers and scalar biases completely out of weight decay parameters
        if "norm" in name or "bias" in name:
            no_decay_params.append(param)
        else:
            decay_params.append(param)

optim_groups = [
    {"params": decay_params, "weight_decay": WEIGHT_DECAY},
    {"params": no_decay_params, "weight_decay": 0.0}
]
optim = torch.optim.AdamW(optim_groups, lr=LR, betas=(0.9, 0.95), eps=1e-8)

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
        total_loss = 0.0
        for _ in range(10):
            xb, yb = get_batch(w)
            logits = compiled(xb)
            total_loss += compute_palm_loss(logits, yb).item()
        out[w] = total_loss / 10
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
print("  training — Ctrl+C to stop & save safely")
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
            logits = compiled(xb)
            loss = compute_palm_loss(logits, yb)
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
            
            # Real early stopping checkpoint criteria
            if l["val"] < best:
                best = l["val"]
                torch.save({"model": model.state_dict(), "optim": optim.state_dict(),
                            "iter": it, "best": best}, CKPT)
                print(f"  ✓ saved best configuration state (val {best:.4f})")

        if it % SAVE_EVERY == 0 and it > start:
            torch.save({"model": model.state_dict(), "optim": optim.state_dict(),
                        "iter": it, "best": best}, CKPT)

except KeyboardInterrupt:
    torch.save({"model": model.state_dict(), "optim": optim.state_dict(),
                "iter": it, "best": best}, CKPT)
    print(f"\n  saved model weights safely @ step {it} → {CKPT}")