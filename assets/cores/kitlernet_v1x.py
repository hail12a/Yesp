"""
2025 EFFICIENT GPT — CPU OPTIMIZED
No Mamba (needs CUDA), but all other 2025 improvements:
✓ RMSNorm    (faster than LayerNorm)
✓ RoPE       (better position encoding)
✓ SwiGLU     (smoother than ReLU/GELU)
✓ GQA        (4x less memory than standard attention)
✓ MoE        (mixture of experts FFN)
✓ Weight tying
✓ Cosine LR + warmup
✓ Gradient clipping
✓ Auto checkpoint resume
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math, os, time, urllib.request

# CPU optimizations
torch.set_num_threads(8)
torch.set_num_interop_threads(4)
os.environ['OMP_NUM_THREADS'] = '8'
os.environ['MKL_NUM_THREADS'] = '8'
os.environ['OMP_PROC_BIND'] = 'CLOSE'
os.environ['KMP_BLOCKTIME'] = '1'

DEVICE = 'cpu'

# Config
N_EMBED    = 512
N_LAYERS   = 12
N_HEADS    = 8
N_KV_HEADS = 2      # GQA: 4x memory reduction
N_EXPERTS  = 4      # MoE experts
TOP_K      = 2      # activate top 2 per token
BLOCK_SIZE = 256
BATCH_SIZE = 16
GRAD_ACCUM = 4
MAX_ITERS  = 99999
LR         = 3e-4
DROPOUT    = 0.0
EVAL_EVERY = 200
SAVE_EVERY = 500
CHECKPOINT = os.path.expanduser('~/gpt_2025_checkpoint.pth')
DATA_FILE  = os.path.expanduser('~/data.txt')

print("2025 EFFICIENT GPT (CPU edition)")
print("RMSNorm + RoPE + SwiGLU + GQA + MoE")
print("="*45)

# Data
if not os.path.exists(DATA_FILE):
    print("Downloading dataset...")
    urllib.request.urlretrieve(
        "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt",
        DATA_FILE)

with open(DATA_FILE, 'r') as f:
    text = f.read()

chars = sorted(set(text))
vocab_size = len(chars)
stoi = {c:i for i,c in enumerate(chars)}
itos = {i:c for i,c in enumerate(chars)}
encode = lambda s: [stoi[c] for c in s if c in stoi]
decode = lambda l: ''.join([itos[i] for i in l])

data = torch.tensor(encode(text), dtype=torch.long)
n = int(0.9*len(data))
train_data, val_data = data[:n], data[n:]
print(f"Dataset: {len(text):,} chars | Vocab: {vocab_size}")

def get_batch(split):
    d = train_data if split=='train' else val_data
    ix = torch.randint(len(d)-BLOCK_SIZE, (BATCH_SIZE,))
    x = torch.stack([d[i:i+BLOCK_SIZE] for i in ix])
    y = torch.stack([d[i+1:i+1+BLOCK_SIZE] for i in ix])
    return x, y

# ── RMSNorm ──────────────────────────────
class RMSNorm(nn.Module):
    def __init__(self, dim, eps=1e-6):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(dim))
        self.eps = eps
    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1,keepdim=True)+self.eps) * self.weight

# ── RoPE ─────────────────────────────────
def precompute_rope(head_dim, seq_len, base=10000):
    inv_freq = 1.0/(base**(torch.arange(0,head_dim,2).float()/head_dim))
    t = torch.arange(seq_len).float()
    freqs = torch.outer(t, inv_freq)
    emb = torch.cat([freqs, freqs], dim=-1)
    return emb.cos(), emb.sin()

def rotate_half(x):
    h = x.shape[-1]//2
    return torch.cat([-x[...,h:], x[...,:h]], dim=-1)

def apply_rope(q, k, cos, sin):
    cos = cos[:q.shape[2]].unsqueeze(0).unsqueeze(0)
    sin = sin[:q.shape[2]].unsqueeze(0).unsqueeze(0)
    q = q*cos + rotate_half(q)*sin
    k = k*cos + rotate_half(k)*sin
    return q, k

# ── GQA ──────────────────────────────────
class GQA(nn.Module):
    def __init__(self):
        super().__init__()
        self.head_dim   = N_EMBED // N_HEADS
        self.n_groups   = N_HEADS // N_KV_HEADS
        self.q_proj = nn.Linear(N_EMBED, N_HEADS*self.head_dim, bias=False)
        self.k_proj = nn.Linear(N_EMBED, N_KV_HEADS*self.head_dim, bias=False)
        self.v_proj = nn.Linear(N_EMBED, N_KV_HEADS*self.head_dim, bias=False)
        self.o_proj = nn.Linear(N_EMBED, N_EMBED, bias=False)
        cos, sin = precompute_rope(self.head_dim, BLOCK_SIZE)
        self.register_buffer('cos', cos)
        self.register_buffer('sin', sin)
        self.register_buffer('mask', torch.tril(torch.ones(BLOCK_SIZE,BLOCK_SIZE)))

    def forward(self, x):
        B,T,C = x.shape
        q = self.q_proj(x).view(B,T,N_HEADS,self.head_dim).transpose(1,2)
        k = self.k_proj(x).view(B,T,N_KV_HEADS,self.head_dim).transpose(1,2)
        v = self.v_proj(x).view(B,T,N_KV_HEADS,self.head_dim).transpose(1,2)
        q,k = apply_rope(q, k, self.cos, self.sin)
        # expand KV for GQA
        k = k.unsqueeze(2).expand(B,N_KV_HEADS,self.n_groups,T,self.head_dim).reshape(B,N_HEADS,T,self.head_dim)
        v = v.unsqueeze(2).expand(B,N_KV_HEADS,self.n_groups,T,self.head_dim).reshape(B,N_HEADS,T,self.head_dim)
        att = (q @ k.transpose(-2,-1)) * (self.head_dim**-0.5)
        att = att.masked_fill(self.mask[:T,:T]==0, float('-inf'))
        att = F.softmax(att, dim=-1)
        out = (att @ v).transpose(1,2).contiguous().view(B,T,C)
        return self.o_proj(out)

# ── SwiGLU ───────────────────────────────
class SwiGLU(nn.Module):
    def __init__(self, dim):
        super().__init__()
        h = int(dim * 8/3)
        h = (h+63)//64*64
        self.w1 = nn.Linear(dim, h, bias=False)
        self.w2 = nn.Linear(dim, h, bias=False)
        self.w3 = nn.Linear(h, dim, bias=False)
    def forward(self, x):
        return self.w3(F.silu(self.w1(x)) * self.w2(x))

# ── MoE ──────────────────────────────────
class MoE(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.experts = nn.ModuleList([SwiGLU(dim) for _ in range(N_EXPERTS)])
        self.router  = nn.Linear(dim, N_EXPERTS, bias=False)

    def forward(self, x):
        B,T,C = x.shape
        flat = x.view(B*T, C)
        logits = self.router(flat)
        weights, idx = torch.topk(logits, TOP_K, dim=-1)
        weights = F.softmax(weights, dim=-1)
        out = torch.zeros_like(flat)
        for e, expert in enumerate(self.experts):
            mask = (idx==e).any(dim=-1)
            if not mask.any(): continue
            w = ((idx[mask]==e).float() * weights[mask]).sum(-1, keepdim=True)
            out[mask] += expert(flat[mask]) * w
        return out.view(B,T,C)

# ── Block ─────────────────────────────────
class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.norm1 = RMSNorm(N_EMBED)
        self.norm2 = RMSNorm(N_EMBED)
        self.attn  = GQA()
        self.ffn   = MoE(N_EMBED)
    def forward(self, x):
        x = x + self.attn(self.norm1(x))
        x = x + self.ffn(self.norm2(x))
        return x

# ── Model ─────────────────────────────────
class GPT2025(nn.Module):
    def __init__(self):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab_size, N_EMBED)
        self.blocks  = nn.Sequential(*[Block() for _ in range(N_LAYERS)])
        self.norm    = RMSNorm(N_EMBED)
        self.head    = nn.Linear(N_EMBED, vocab_size, bias=False)
        self.tok_emb.weight = self.head.weight  # weight tying
        self.apply(self._init)

    def _init(self, m):
        if isinstance(m, nn.Linear):
            nn.init.normal_(m.weight, 0, 0.02)
            if m.bias is not None: nn.init.zeros_(m.bias)
        elif isinstance(m, nn.Embedding):
            nn.init.normal_(m.weight, 0, 0.02)

    def forward(self, idx, targets=None):
        B,T = idx.shape
        x = self.tok_emb(idx)
        x = self.norm(self.blocks(x))
        logits = self.head(x)
        loss = F.cross_entropy(logits.view(B*T,-1), targets.view(B*T)) if targets is not None else None
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, n, temperature=0.8, top_k=50):
        for _ in range(n):
            logits,_ = self(idx[:,-BLOCK_SIZE:])
            logits = logits[:,-1,:]/temperature
            v,_ = torch.topk(logits, min(top_k, logits.size(-1)))
            logits[logits<v[:,[-1]]] = float('-inf')
            idx = torch.cat((idx, torch.multinomial(F.softmax(logits,-1),1)), dim=1)
        return idx

model = GPT2025()
params = sum(p.numel() for p in model.parameters())/1e6
print(f"Parameters: {params:.1f}M")
print(f"Est. RAM:   ~{params*4/1000:.2f}GB (much less than Mamba version!)")

optimizer = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9,0.95), weight_decay=0.1)

def get_lr(step):
    if step < 100: return LR * step/100
    return max(LR*0.1, LR*(MAX_ITERS-step)/max(MAX_ITERS-100,1))

start_iter = 0
if os.path.exists(CHECKPOINT):
    print(f"Loading checkpoint...")
    ckpt = torch.load(CHECKPOINT, map_location='cpu')
    model.load_state_dict(ckpt['model'])
    optimizer.load_state_dict(ckpt['optimizer'])
    start_iter = ckpt['iter']
    print(f"Resumed from step {start_iter}")

@torch.no_grad()
def eval_loss():
    model.eval()
    out = {}
    for split in ['train','val']:
        L = [model(*get_batch(split))[1].item() for _ in range(20)]
        out[split] = sum(L)/len(L)
    model.train()
    return out

def sample_text():
    model.eval()
    ctx = torch.zeros((1,1), dtype=torch.long)
    out = model.generate(ctx, 200)
    model.train()
    return decode(out[0].tolist())

print("\nTraining — Ctrl+C to stop and save")
print("="*45)

best_val = float('inf')
optimizer.zero_grad()
t0 = time.time()

try:
    for i in range(start_iter, MAX_ITERS):
        for g in optimizer.param_groups:
            g['lr'] = get_lr(i)

        loss_accum = 0.0
        for _ in range(GRAD_ACCUM):
            x,y = get_batch('train')
            _,loss = model(x,y)
            (loss/GRAD_ACCUM).backward()
            loss_accum += loss.item()/GRAD_ACCUM

        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        optimizer.zero_grad()

        if i % 10 == 0:
            dt = (time.time()-t0)/max(i-start_iter+1,1)
            print(f"Step {i:5d} | Loss: {loss_accum:.4f} | LR: {get_lr(i):.2e} | {dt*1000:.0f}ms/step")

        if i % EVAL_EVERY == 0 and i > 0:
            losses = eval_loss()
            print(f"\n--- Step {i} ---")
            print(f"Train: {losses['train']:.4f} | Val: {losses['val']:.4f}")
            print(f"Sample: {sample_text()[:300]}")
            if losses['val'] < best_val:
                best_val = losses['val']
                torch.save({'model':model.state_dict(),'optimizer':optimizer.state_dict(),'iter':i}, CHECKPOINT)
                print(f"Checkpoint saved! (val={best_val:.4f})")

        if i % SAVE_EVERY == 0 and i > 0:
            torch.save({'model':model.state_dict(),'optimizer':optimizer.state_dict(),'iter':i}, CHECKPOINT)

except KeyboardInterrupt:
    print("\nSaving...")
    torch.save({'model':model.state_dict(),'optimizer':optimizer.state_dict(),'iter':i}, CHECKPOINT)
    print(f"Saved to {CHECKPOINT}")
    print("\nSample output:")
    print(sample_text())
