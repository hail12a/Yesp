#!/usr/bin/env python3
import os
import math
import time
import urllib.request
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

# --------------------
# Upscaled Data Center Configuration
# --------------------
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

N_EMBED    = 512  # Upscaled from 384
N_HEADS    = 8    # Upscaled from 4
N_LAYERS   = 8    # Upscaled from 6
FWP_RANK   = 8    # Expanded representation rank
BLOCK_SIZE = 256  # Doubled from 128 for extended long-range memory
BATCH_SIZE = 32   # Raised for T4 (faster + more stable gradients); lower to 16 if OOM
LR         = 3e-4  # Raised peak LR + cosine schedule below = faster convergence
MAX_ITERS  = 5000  # Set target to watch it evolve past character grids
WARMUP     = 200   # LR warmup steps
DROPOUT    = 0.15  # Heightened regularization to aggressively fight overfitting
TOP_K      = 30

INPUT_DIR = Path("/kaggle/input")
WORKING_DIR = Path("/kaggle/working")

# Auto-download/locate dataset
data_files = list(INPUT_DIR.glob("**/data_semantic.txt"))
if data_files:
    DATA_FILE = data_files[0]
else:
    DATA_FILE = WORKING_DIR / "data_semantic.txt"
    if not DATA_FILE.exists():
        print("Dataset not found locally. Downloading a stable text dataset...")
        url = "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"
        try:
            urllib.request.urlretrieve(url, DATA_FILE)
            print(f"Download complete! Saved to {DATA_FILE}")
        except Exception as e:
            print(f"Download failed ({e}). Creating basic dummy fallback text.")
            dummy_text = "John has a red car.\nMary has a blue bike.\nThe cat is on the table.\n" * 500
            DATA_FILE.write_text(dummy_text, encoding="utf-8")

IDENTITY_FILE = WORKING_DIR / "hybrid_identity.pt"
CHECKPOINT_FILE = WORKING_DIR / "hgem_full.pth"

text = DATA_FILE.read_text(encoding="utf-8", errors="ignore")
chars = sorted(set(text))
VOCAB = len(chars)
stoi = {c:i for i,c in enumerate(chars)}
itos = {i:c for i,c in enumerate(chars)}
encode = lambda s: [stoi[c] for c in s]
decode = lambda l: "".join(itos[i] for i in l)

data = torch.tensor(encode(text), dtype=torch.long)
n = int(0.9 * len(data))
train_data, val_data = data[:n], data[n:]

def get_batch(which):
    d = train_data if which == "train" else val_data
    max_idx = len(d) - BLOCK_SIZE - 1
    if max_idx <= 0:
        x = d[:-1].unsqueeze(0).expand(BATCH_SIZE, -1)[:, :BLOCK_SIZE]
        y = d[1:].unsqueeze(0).expand(BATCH_SIZE, -1)[:, :BLOCK_SIZE]
        return x.to(DEVICE), y.to(DEVICE)
    ix = torch.randint(0, max_idx, (BATCH_SIZE,))
    x = torch.stack([d[i:i+BLOCK_SIZE] for i in ix])
    y = torch.stack([d[i+1:i+1+BLOCK_SIZE] for i in ix])
    return x.to(DEVICE), y.to(DEVICE)

# --------------------
# Stabilized Network Modules
# --------------------
class RMSNorm(nn.Module):
    def __init__(self, d, eps=1e-5):
        super().__init__()
        self.w = nn.Parameter(torch.ones(d))
        self.eps = eps
    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.w

class FastWeightLinear(nn.Module):
    def __init__(self, dim, rank=FWP_RANK*2):
        super().__init__()
        self.W0 = nn.Linear(dim, dim, bias=False)
        self.gen_a = nn.Linear(dim, dim*rank, bias=False)
        self.gen_b = nn.Linear(dim, dim*rank, bias=False)
        self.gate  = nn.Linear(dim, rank)
        self.rank = rank
        self.dim  = dim
        self.scale = 1.0 / math.sqrt(dim)
    def forward(self, x):
        B,T,D = x.shape
        base = self.W0(x)
        a = self.gen_a(x).view(B,T,self.rank,D) * 0.05
        b = self.gen_b(x).view(B,T,self.rank,D) * 0.05
        
        coeff = torch.einsum("btd,btrd->btr", x, b)
        coeff = torch.clamp(coeff, min=-8.0, max=8.0)
        
        gate  = torch.sigmoid(self.gate(x))
        coeff = coeff * gate
        fast  = torch.einsum("btr,btrd->btd", coeff, a)
        return base + self.scale * fast

class HebbianMemory(nn.Module):
    def __init__(self, dim, rank=FWP_RANK*2, lam=0.85, sparsity=0.08):
        super().__init__()
        self.gen_a = nn.Linear(dim, dim*rank, bias=False)
        self.gen_b = nn.Linear(dim, dim*rank, bias=False)
        self.rank = rank
        self.dim  = dim
        self.lam  = lam
        self.sparsity = sparsity
        self.trace = None
        self.norm = RMSNorm(dim)
    def reset(self):
        self.trace = None
    def forward(self, x):
        B,T,D = x.shape
        a = self.gen_a(x).view(B,T,self.rank,D) * 0.05
        b = self.gen_b(x).view(B,T,self.rank,D) * 0.05
        hebb = torch.einsum("btrd,btre->bde", a, b) / (T * self.rank)

        k = max(1, int(self.sparsity * D * D))
        flat = hebb.view(B, -1)
        vals, idx = torch.topk(flat, k, dim=-1)
        mask = torch.zeros_like(flat)
        mask.scatter_(1, idx, 1.0)
        hebb_sparse = hebb * mask.view(B,D,D)

        if self.trace is None or self.trace.shape[0] != B:
            M = hebb_sparse
        else:
            M = self.lam * self.trace.to(x.device) + hebb_sparse

        M = torch.clamp(M, min=-1.5, max=1.5)
        self.trace = M.detach()
        
        out = torch.einsum("btd,bde->bte", self.norm(x), M) * (1.0 / math.sqrt(D))
        return out

class Attention(nn.Module):
    def __init__(self):
        super().__init__()
        self.hd = N_EMBED//N_HEADS
        self.qkv = nn.Linear(N_EMBED, 3*N_EMBED, bias=False)
        self.o   = nn.Linear(N_EMBED, N_EMBED, bias=False)
        self.head_gate = nn.Parameter(torch.ones(N_HEADS))
    def forward(self, x):
        B,T,C = x.shape
        q,k,v = self.qkv(x).split(N_EMBED, dim=2)
        q = q.view(B,T,N_HEADS,self.hd).transpose(1,2)
        k = k.view(B,T,N_HEADS,self.hd).transpose(1,2)
        v = v.view(B,T,N_HEADS,self.hd).transpose(1,2)
        
        out = F.scaled_dot_product_attention(
            q, k, v, is_causal=True,
            dropout_p=DROPOUT if self.training else 0.0
        )
        gate = torch.sigmoid(self.head_gate).view(1,N_HEADS,1,1)
        out = out * gate
        return self.o(out.transpose(1,2).contiguous().view(B,T,C))

class WorldModel(nn.Module):
    def __init__(self, vocab, dim):
        super().__init__()
        self.emb = nn.Embedding(vocab, dim)
        self.obj_mlp  = nn.Sequential(nn.Linear(dim, dim), nn.GELU(), nn.Linear(dim, dim))
        self.prop_mlp = nn.Sequential(nn.Linear(dim, dim), nn.GELU(), nn.Linear(dim, dim))
    def forward(self, idx):
        x = self.emb(idx)
        obj  = self.obj_mlp(x)
        prop = self.prop_mlp(x)
        return obj, prop
    def grounding_loss(self, obj, prop):
        sim_pos = F.cosine_similarity(obj, prop, dim=-1)
        if prop.size(0) > 1:
            prop_shuffled = prop[torch.randperm(prop.size(0))]
        else:
            prop_shuffled = prop
        sim_neg = F.cosine_similarity(obj, prop_shuffled, dim=-1)
        loss = (1.0 - sim_pos).mean() + F.relu(sim_neg - 0.2).mean()
        return torch.clamp(loss, max=2.0)

class QualiaMap(nn.Module):
    def __init__(self, dim, qualia_dim=128):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(dim, qualia_dim), nn.GELU(), nn.Linear(qualia_dim, qualia_dim))
    def forward(self, hidden):
        return torch.tanh(self.net(hidden))

class Controller(nn.Module):
    def __init__(self, dim, vocab, n_goals=4):
        super().__init__()
        self.dim = dim
        self_state_init = torch.zeros(1, dim)
        
        # Safe structural loading checkpoint check
        if IDENTITY_FILE.exists():
            try:
                loaded_state = torch.load(IDENTITY_FILE, map_location="cpu")
                if loaded_state.shape[-1] == dim:
                    self_state_init = loaded_state
                else:
                    print(f"Stale dimension trace loaded ({loaded_state.shape[-1]} != {dim}). Discarding legacy checkpoint.")
            except Exception:
                pass
                
        self.self_state = nn.Parameter(self_state_init)
        self.goal_bank  = nn.Parameter(torch.randn(n_goals, dim)*0.01)
        self.mlp        = nn.Sequential(nn.Linear(dim*2, dim), nn.GELU(), nn.Linear(dim, dim))
        self.logit_bias = nn.Linear(dim, vocab, bias=False)
        self.norm       = RMSNorm(dim)
    def forward(self, hidden, goal_vec=None):
        B,T,D = hidden.shape
        with torch.no_grad():
            self.self_state.data = F.normalize(self.self_state.data, dim=-1)
            
        if goal_vec is None:
            scores = torch.matmul(self.self_state, self.goal_bank.T)
            idx = scores.argmax(dim=-1)
            goal_vec = self.goal_bank[idx].unsqueeze(0)
            
        goal = goal_vec.reshape(1, 1, D).expand(B, T, D)
        mixed = torch.cat([self.norm(hidden), goal], dim=-1)
        h = self.mlp(mixed)
        logits_bias = self.logit_bias(h)
        
        with torch.no_grad():
            self.self_state.data = 0.97*self.self_state.data + 0.03*hidden.mean(dim=(0,1), keepdim=True).squeeze(0)
        return logits_bias
    def save_identity(self):
        torch.save(self.self_state.detach().cpu(), IDENTITY_FILE)

class NarrativeHead(nn.Module):
    def __init__(self, dim, vocab):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(dim*2, dim), nn.GELU(),
            nn.Linear(dim, dim), nn.GELU()
        )
        self.head = nn.Linear(dim, vocab, bias=False)
        self.norm = RMSNorm(dim)
    def forward(self, hidden, self_state):
        B,T,D = hidden.shape
        s = F.normalize(self_state, dim=-1).expand(B, T, D)
        h = self.net(torch.cat([self.norm(hidden), s], dim=-1))
        return self.head(h)

class HybridBrain(nn.Module):
    def __init__(self, vocab):
        super().__init__()
        self.vocab = vocab
        self.emb   = nn.Embedding(vocab, N_EMBED)
        self.pos   = nn.Embedding(BLOCK_SIZE, N_EMBED)
        self.blocks = nn.ModuleList([self._make_block() for _ in range(N_LAYERS)])
        self.norm  = RMSNorm(N_EMBED)
        self.head  = nn.Linear(N_EMBED, vocab, bias=False)

        self.world      = WorldModel(vocab, N_EMBED)
        self.qualia_map = QualiaMap(N_EMBED)
        self.controller = Controller(N_EMBED, vocab)
        self.narrative  = NarrativeHead(N_EMBED, vocab)

        self.apply(self._init)
    def _init(self, m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, 0.0, 0.008)
    def _make_block(self):
        return nn.ModuleDict({
            "norm1": RMSNorm(N_EMBED), "norm2": RMSNorm(N_EMBED),
            "att": Attention(), "fw": FastWeightLinear(N_EMBED), "hebb": HebbianMemory(N_EMBED),
            "act": nn.GELU(), "proj": nn.Linear(N_EMBED, N_EMBED, bias=False),
            "drop": nn.Dropout(DROPOUT),
        })
    def reset_memory(self):
        for b in self.blocks: b["hebb"].reset()
    def forward(self, idx, targets=None, goal_vec=None):
        B,T = idx.shape
        x = self.emb(idx) + self.pos(torch.arange(T, device=idx.device))

        for b in self.blocks:
            h1 = b["norm1"](x)
            x = x + b["drop"](b["att"](h1))
            h2 = b["norm2"](x)
            h = b["act"](b["fw"](h2) + b["hebb"](h2))
            x = x + b["drop"](b["proj"](h))

        x = self.norm(x)
        logits_base = self.head(x)

        obj, prop = self.world(idx)
        grounding_loss = self.world.grounding_loss(obj, prop)
        qualia = self.qualia_map(x)

        bias_logits = self.controller(x, goal_vec=goal_vec)
        narrative_logits = self.narrative(x, self.controller.self_state)
        
        logits = logits_base + 0.1 * bias_logits + 0.05 * narrative_logits

        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.reshape(-1, logits.size(-1)), targets.reshape(-1)) + 0.05 * grounding_loss
        return logits, loss, {"qualia": qualia, "grounding_loss": grounding_loss}

    @torch.no_grad()
    def generate(self, ctx, n, temp=0.85, top_k=TOP_K, goal_vec=None):
        idx = ctx
        self.reset_memory()
        
        for _ in range(n):
            idx_cond = idx[:, -BLOCK_SIZE:]
            logits, _, _ = self.forward(idx_cond, goal_vec=goal_vec)
            logits = logits[:, -1, :] / temp
            
            # Smart Repetition Brake: Dampen localized sequence loops
            if idx.size(1) >= 3:
                recent_tokens = idx[0, -8:].unique()
                logits[0, recent_tokens] -= 0.5
            
            v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
            logits[logits < v[:, [-1]]] = -float("inf")
            
            probs = F.softmax(logits, dim=-1)
            next_tok = torch.multinomial(probs, 1)
            idx = torch.cat([idx, next_tok], dim=1)
            
        return idx
    def save_identity(self):
        self.controller.save_identity()

# --------------------
# Cloud Execution Training Loop
# --------------------
model = HybridBrain(VOCAB).to(DEVICE)

# torch.compile: free ~1.3-1.5x speedup on GPU. If it errors on the costume
# components' dynamic shapes, comment this line out — everything else still helps.
try:
    if DEVICE == "cuda":
        model = torch.compile(model)
        print("torch.compile: ON")
except Exception as e:
    print(f"torch.compile off ({e})")

optim = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9,0.95), weight_decay=0.15)
scaler = torch.amp.GradScaler("cuda", enabled=(DEVICE == "cuda"))

# LR warmup + cosine decay — the biggest "learns faster" win
def get_lr(it):
    if it < WARMUP:
        return LR * (it + 1) / WARMUP
    prog = (it - WARMUP) / max(1, MAX_ITERS - WARMUP)
    return LR * 0.1 + 0.5 * (LR * 0.9) * (1 + math.cos(math.pi * prog))

def eval_loss():
    model.eval()
    out = {}
    with torch.no_grad():
        for w in ("train","val"):
            s = 0.0
            for _ in range(10):
                xb,yb = get_batch(w)
                with torch.amp.autocast(device_type="cuda" if "cuda" in DEVICE else "cpu", dtype=torch.float16, enabled=(DEVICE == "cuda")):
                    _,loss,_ = model(xb,yb)
                s += loss.item() if not math.isnan(loss.item()) else 2.5
            out[w] = s/10
    model.train()
    return out

print(f"HybridBrain-6F++ | DEEP RETICULAR SCALED ARCHITECTURE. Active: {DEVICE.upper()}")
t0 = time.time()

try:
    for it in range(MAX_ITERS + 1):
        # apply LR schedule
        for g in optim.param_groups:
            g["lr"] = get_lr(it)

        xb,yb = get_batch("train")
        
        with torch.amp.autocast(device_type="cuda" if "cuda" in DEVICE else "cpu", dtype=torch.float16, enabled=(DEVICE == "cuda")):
            logits, loss, aux = model(xb, yb)
            
        if torch.isnan(loss):
            print(f"NaN detected at step {it}. Halting execution loop.")
            break
            
        optim.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        
        scaler.unscale_(optim)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)  # was 0.3 (too tight, choked learning)
        
        scaler.step(optim)
        scaler.update()
        
        if it % 50 == 0:
            dt = (time.time()-t0)/max(1,it+1)
            print(f"step {it:5d} | loss {loss.item():.4f} | lr {get_lr(it):.2e} | {dt*1000:.0f}ms/step")
            
        if it % 500 == 0 and it > 0:
            l = eval_loss()
            # Priming generation context with basic seed to guide attention out of blank space voids
            context_text = "KING:\nWhat is the "
            context_tokens = [stoi[c] for c in context_text if c in stoi]
            ctx = torch.tensor([context_tokens], dtype=torch.long, device=DEVICE)
            
            s = decode(model.generate(ctx, 140)[0].tolist())
            print(f"\n[eval {it}] train {l['train']:.4f} | val {l['val']:.4f}")
            print(f"sample:\n{s}\n")
            
    model.save_identity()
    torch.save({"model": model.state_dict(), "stoi": stoi, "itos": itos}, CHECKPOINT_FILE)
    print("Training successfully finalized. High capacity checkpoint committed to storage.")
except KeyboardInterrupt:
    model.save_identity()
    torch.save({"model": model.state_dict(), "stoi": stoi, "itos": itos}, CHECKPOINT_FILE)
    print("\nTraining manually paused. Checkpoint saved.")
