"""
KitlerNet-FWP — Fast Weight Programmer / hypernetwork architecture.

The hidden state at each step generates a low-rank (outer-product) delta-weight
that modulates the primary projection during the forward pass. This is the
standard memory-tractable FWP formulation (Schmidhuber 1992; Schlag et al. 2021),
chosen so it runs on a 4-core CPU instead of allocating a full d*d matrix/token.

Fully differentiable end to end. Runnable + trainable on CPU.
"""

import os
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")

import math
import time
import urllib.request
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

torch.set_num_threads(4)
torch.manual_seed(1337)
DEVICE = "cpu"

# ── config ──
N_EMBED    = 256
N_LAYERS   = 4
N_HEADS    = 4
FWP_RANK   = 4          # rank of the dynamic delta-weight (low-rank => CPU-feasible)
BLOCK_SIZE = 128
BATCH_SIZE = 16
MAX_ITERS  = 5000
LR         = 3e-4
DROPOUT    = 0.1
EVAL_EVERY = 250

HOME      = Path.home()
DATA_FILE = HOME / "data.txt"
CKPT      = HOME / "kitlernet_fwp.pth"

if not DATA_FILE.exists():
    urllib.request.urlretrieve(
        "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt",
        DATA_FILE,
    )
text = DATA_FILE.read_text(encoding="utf-8", errors="ignore")

# char-level tokenizer (keeps this script self-contained)
chars = sorted(set(text))
VOCAB = len(chars)
stoi = {c: i for i, c in enumerate(chars)}
itos = {i: c for i, c in enumerate(chars)}
encode = lambda s: [stoi[c] for c in s]
decode = lambda l: "".join(itos[i] for i in l)

data = torch.tensor(encode(text), dtype=torch.long)
n = int(0.9 * len(data))
train_data, val_data = data[:n], data[n:]

def get_batch(which):
    d = train_data if which == "train" else val_data
    ix = torch.randint(len(d) - BLOCK_SIZE - 1, (BATCH_SIZE,))
    x = torch.stack([d[i:i + BLOCK_SIZE] for i in ix])
    y = torch.stack([d[i + 1:i + 1 + BLOCK_SIZE] for i in ix])
    return x, y


class RMSNorm(nn.Module):
    def __init__(self, dim, eps=1e-6):
        super().__init__()
        self.w = nn.Parameter(torch.ones(dim))
        self.eps = eps
    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.w


class FastWeightLinear(nn.Module):
    """
    Primary linear layer W0 plus a per-token dynamic delta generated from the
    input itself. The delta is low-rank: delta = (U h) outer (V h), so the
    effective weight for token t is  W0 + a_t b_t^T.

    y_t = x_t @ (W0 + a_t b_t^T)^T
        = x_t @ W0^T  +  (x_t . b_t) * a_t

    The second term is the fast-weight contribution; it never materializes a
    full d*d matrix, so it's CPU-tractable. Fully differentiable.
    """
    def __init__(self, dim, rank=FWP_RANK):
        super().__init__()
        self.W0 = nn.Linear(dim, dim, bias=False)
        # generators: hidden state -> the two low-rank vectors
        self.gen_a = nn.Linear(dim, dim * rank, bias=False)
        self.gen_b = nn.Linear(dim, dim * rank, bias=False)
        self.rank = rank
        self.dim = dim
        self.scale = 1.0 / math.sqrt(rank)

    def forward(self, x):
        B, T, D = x.shape
        base = self.W0(x)                                   # (B,T,D)
        a = self.gen_a(x).view(B, T, self.rank, D)          # (B,T,r,D)
        b = self.gen_b(x).view(B, T, self.rank, D)          # (B,T,r,D)
        # per-token low-rank modulation: sum_r (x . b_r) * a_r
        coeff = torch.einsum("btd,btrd->btr", x, b)         # (B,T,r)
        fast = torch.einsum("btr,btrd->btd", coeff, a)      # (B,T,D)
        return base + self.scale * fast


class Attention(nn.Module):
    def __init__(self):
        super().__init__()
        self.hd = N_EMBED // N_HEADS
        self.qkv = nn.Linear(N_EMBED, 3 * N_EMBED, bias=False)
        self.o = nn.Linear(N_EMBED, N_EMBED, bias=False)
    def forward(self, x):
        B, T, C = x.shape
        q, k, v = self.qkv(x).split(N_EMBED, dim=2)
        q = q.view(B, T, N_HEADS, self.hd).transpose(1, 2)
        k = k.view(B, T, N_HEADS, self.hd).transpose(1, 2)
        v = v.view(B, T, N_HEADS, self.hd).transpose(1, 2)
        out = F.scaled_dot_product_attention(q, k, v, is_causal=True,
                                              dropout_p=DROPOUT if self.training else 0.0)
        return self.o(out.transpose(1, 2).contiguous().view(B, T, C))


class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.n1, self.n2 = RMSNorm(N_EMBED), RMSNorm(N_EMBED)
        self.attn = Attention()
        # the FFN's first projection is a fast-weight (dynamically modulated) layer
        self.fw = FastWeightLinear(N_EMBED)
        self.act = nn.GELU()
        self.proj = nn.Linear(N_EMBED, N_EMBED, bias=False)
        self.drop = nn.Dropout(DROPOUT)
    def forward(self, x):
        x = x + self.drop(self.attn(self.n1(x)))
        h = self.n2(x)
        h = self.proj(self.act(self.fw(h)))
        x = x + self.drop(h)
        return x


class KitlerFWP(nn.Module):
    def __init__(self, vocab):
        super().__init__()
        self.emb = nn.Embedding(vocab, N_EMBED)
        self.pos = nn.Embedding(BLOCK_SIZE, N_EMBED)
        self.blocks = nn.ModuleList([Block() for _ in range(N_LAYERS)])
        self.norm = RMSNorm(N_EMBED)
        self.head = nn.Linear(N_EMBED, vocab, bias=False)
        self.emb.weight = self.head.weight
        self.apply(self._init)
    def _init(self, m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, 0.0, 0.02)
    def forward(self, idx, targets=None):
        B, T = idx.shape
        x = self.emb(idx) + self.pos(torch.arange(T, device=idx.device))
        for b in self.blocks:
            x = b(x)
        logits = self.head(self.norm(x))
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
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


model = KitlerFWP(VOCAB).to(DEVICE)
params = sum(p.numel() for p in model.parameters()) / 1e6
print(f"KitlerNet-FWP | {params:.1f}M params | rank-{FWP_RANK} fast weights | vocab {VOCAB}")

optim = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9, 0.95), weight_decay=0.1)

@torch.no_grad()
def eval_loss():
    model.eval()
    out = {}
    for w in ("train", "val"):
        out[w] = sum(model(*get_batch(w))[1].item() for _ in range(10)) / 10
    model.train()
    return out

print("training — Ctrl+C to stop")
t0 = time.time()
try:
    for it in range(MAX_ITERS):
        xb, yb = get_batch("train")
        _, loss = model(xb, yb)
        optim.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optim.step()
        if it % 10 == 0:
            dt = (time.time() - t0) / max(1, it + 1)
            print(f"step {it:5d} | loss {loss.item():.4f} | {dt*1000:.0f}ms/step")
        if it % EVAL_EVERY == 0 and it > 0:
            l = eval_loss()
            ctx = torch.zeros((1, 1), dtype=torch.long)
            s = decode(model.generate(ctx, 120)[0].tolist())
            print(f"\n[eval {it}] train {l['train']:.4f} | val {l['val']:.4f}")
            print(f"sample: {s}\n")
            torch.save({"model": model.state_dict(), "iter": it}, CKPT)
except KeyboardInterrupt:
    torch.save({"model": model.state_dict(), "iter": it}, CKPT)
    print(f"\nsaved @ {CKPT}")
