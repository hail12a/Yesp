
#!/usr/bin/env python3
import os, math, time
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

# --------------------
# basic setup
# --------------------
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")
torch.set_num_threads(4)
torch.manual_seed(1337)
DEVICE = "cpu"

N_EMBED    = 256
N_HEADS    = 4
N_LAYERS   = 4
FWP_RANK   = 4
BLOCK_SIZE = 128
BATCH_SIZE = 16
LR         = 3e-4
MAX_ITERS  = 50000
DROPOUT    = 0.1
TOP_K      = 40

HOME          = Path.home()
DATA_FILE     = HOME / "data_semantic.txt"
IDENTITY_FILE = HOME / "hybrid_identity.pt"

if not DATA_FILE.exists():
    text = """\
John has a red car.
Mary has a blue bike.
The cat is on the table.
The dog is in the garden.
The sun is bright.
The sky is blue.
The car is fast.
The bike is slow.
The table is wooden.
The garden is green.
"""
    DATA_FILE.write_text(text, encoding="utf-8")
text = DATA_FILE.read_text(encoding="utf-8", errors="ignore")

chars = sorted(set(text))
VOCAB = len(chars)
stoi = {c:i for i,c in enumerate(chars)}
itos = {i:c for i,c in enumerate(chars)}
encode = lambda s: [stoi[c] for c in s]
decode = lambda l: "".join(itos[i] for i in l)

data = torch.tensor(encode(text), dtype=torch.long)
n = int(0.9*len(data))
train_data, val_data = data[:n], data[n:]

def get_batch(which):
    d = train_data if which=="train" else val_data
    ix = torch.randint(len(d)-BLOCK_SIZE-1, (BATCH_SIZE,))
    x = torch.stack([d[i:i+BLOCK_SIZE] for i in ix])
    y = torch.stack([d[i+1:i+1+BLOCK_SIZE] for i in ix])
    return x.to(DEVICE), y.to(DEVICE)

# --------------------
# Stabilized RMSNorm
# --------------------
class RMSNorm(nn.Module):
    def __init__(self, d, eps=1e-6):
        super().__init__()
        self.w = nn.Parameter(torch.ones(d))
        self.eps = eps
    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.w

# --------------------
# Fixed Gated Fast Weight Linear
# --------------------
class FastWeightLinear(nn.Module):
    def __init__(self, dim, rank=FWP_RANK*2):
        super().__init__()
        self.W0 = nn.Linear(dim, dim, bias=False)
        self.gen_a = nn.Linear(dim, dim*rank, bias=False)
        self.gen_b = nn.Linear(dim, dim*rank, bias=False)
        self.gate  = nn.Linear(dim, rank)
        self.rank = rank
        self.dim  = dim
        self.scale = 1.0 / math.sqrt(dim) # Scale down by channels to prevent exploding values
    def forward(self, x):
        B,T,D = x.shape
        base = self.W0(x)
        a = self.gen_a(x).view(B,T,self.rank,D)
        b = self.gen_b(x).view(B,T,self.rank,D)
        coeff = torch.einsum("btd,btrd->btr", x, b)
        gate  = torch.sigmoid(self.gate(x))
        coeff = coeff * gate
        fast  = torch.einsum("btr,btrd->btd", coeff, a)
        return base + self.scale * fast

# --------------------
# Stabilized Sparse Hebbian Memory
# --------------------
class HebbianMemory(nn.Module):
    def __init__(self, dim, rank=FWP_RANK*2, lam=0.95, sparsity=0.1):
        super().__init__()
        self.gen_a = nn.Linear(dim, dim*rank, bias=False)
        self.gen_b = nn.Linear(dim, dim*rank, bias=False)
        self.rank = rank
        self.dim  = dim
        self.lam  = lam
        self.sparsity = sparsity
        self.trace = None
        self.norm = RMSNorm(dim) # Added norm to control trace amplification
    def reset(self):
        self.trace = None
    def forward(self, x):
        B,T,D = x.shape
        a = self.gen_a(x).view(B,T,self.rank,D)
        b = self.gen_b(x).view(B,T,self.rank,D)
        hebb = torch.einsum("btrd,btre->bde", a, b) / (T * self.rank)

        k = max(1, int(self.sparsity * D * D)) # Properly mask spatial projection elements
        flat = hebb.view(B, -1)
        vals, idx = torch.topk(flat, k, dim=-1)
        mask = torch.zeros_like(flat)
        mask.scatter_(1, idx, 1.0)
        hebb_sparse = hebb * mask.view(B,D,D)

        if self.trace is None or self.trace.shape[0] != B:
            M = hebb_sparse
        else:
            M = self.lam * self.trace.to(x.device) + hebb_sparse

        self.trace = M.detach()
        # Scale intermediate tensor step to stabilize gradients
        out = torch.einsum("btd,bde->bte", self.norm(x), M) * (1.0 / math.sqrt(D))
        return out

# --------------------
# Attention (Head Gated)
# --------------------
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
            q,k,v,is_causal=True,
            dropout_p=DROPOUT if self.training else 0.0
        )
        gate = torch.sigmoid(self.head_gate).view(1,N_HEADS,1,1) # Bound gating between 0 and 1
        out = out * gate
        return self.o(out.transpose(1,2).contiguous().view(B,T,C))

# --------------------
# Stabilized Contrastive World Model
# --------------------
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
        return torch.clamp(loss, max=2.0) # Guard against gradient exploding spikes

# --------------------
# Richer Feel Space Qualia
# --------------------
class QualiaMap(nn.Module):
    def __init__(self, dim, qualia_dim=128):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(dim, qualia_dim), nn.GELU(), nn.Linear(qualia_dim, qualia_dim))
    def forward(self, hidden):
        return torch.tanh(self.net(hidden))

# --------------------
# Fixed Normalized Identity Controller
# --------------------
class Controller(nn.Module):
    def __init__(self, dim, vocab, n_goals=4):
        super().__init__()
        if IDENTITY_FILE.exists():
            try:
                self_state_init = torch.load(IDENTITY_FILE, map_location=DEVICE)
            except Exception:
                self_state_init = torch.zeros(1, dim)
        else:
            self_state_init = torch.zeros(1,dim)
        self.self_state = nn.Parameter(self_state_init)
        self.goal_bank  = nn.Parameter(torch.randn(n_goals, dim)*0.1)
        self.mlp        = nn.Sequential(nn.Linear(dim*2, dim), nn.GELU(), nn.Linear(dim, dim))
        self.logit_bias = nn.Linear(dim, vocab, bias=False)
        self.norm       = RMSNorm(dim) # Added normalization layer
    def forward(self, hidden, goal_vec=None):
        B,T,D = hidden.shape
        # Secure identity scaling to eliminate exponential drift explosion
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
            self.self_state.data = 0.97*self.self_state.data + 0.03*hidden.mean(dim=(0,1), keepdim=True)
        return logits_bias
    def save_identity(self):
        torch.save(self.self_state.detach().cpu(), IDENTITY_FILE)

# --------------------
# Deep Narrative Head
# --------------------
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
        s = F.normalize(self_state, dim=-1).expand(B,T,D)
        h = self.net(torch.cat([self.norm(hidden), s], dim=-1))
        return self.head(h)

# --------------------
# Full Stable Hybrid Brain
# --------------------
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
            nn.init.normal_(m.weight, 0.0, 0.02)
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
        
        # Scale biases to ensure baseline vocabulary controls final syntax
        logits = logits_base + 0.1 * bias_logits + 0.05 * narrative_logits

        loss = None
        if targets is not None:
            ce = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
            loss = ce + 0.05 * grounding_loss
        return logits, loss, {"qualia": qualia, "grounding_loss": grounding_loss}

    @torch.no_grad()
    def generate(self, ctx, n, temp=0.8, top_k=TOP_K, goal_vec=None):
        idx = ctx
        self.reset_memory()
        for _ in range(n):
            logits, _, _ = self.forward(idx[:, -BLOCK_SIZE:], goal_vec=goal_vec)
            logits = logits[:, -1, :] / temp
            v,_ = torch.topk(logits, min(top_k, logits.size(-1)))
            logits[logits < v[:,[-1]]] = -float("inf")
            next_tok = torch.multinomial(F.softmax(logits, -1), 1)
            idx = torch.cat([idx, next_tok], dim=1)
        return idx
    def save_identity(self):
        self.controller.save_identity()

# --------------------
# Engine Initialization
# --------------------
model = HybridBrain(VOCAB).to(DEVICE)
optim = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9,0.95), weight_decay=0.1)

def eval_loss():
    model.eval()
    out = {}
    with torch.no_grad():
        for w in ("train","val"):
            s = 0.0
            for _ in range(10):
                xb,yb = get_batch(w)
                _,loss,_ = model(xb,yb)
                s += loss.item()
            out[w] = s/10
    model.train()
    return out

print("HybridBrain-6F++ STABLE ENGINE | Hardened production architecture initialized.")
t0 = time.time()
try:
    for it in range(MAX_ITERS):
        xb,yb = get_batch("train")
        logits, loss, aux = model(xb,yb)
        optim.zero_grad(set_to_none=True)
        loss.backward()
        
        # Hard constraint: Clip gradients at 0.5 to keep optimization smooth
        torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)
        optim.step()
        
        if it % 50 == 0:
            dt = (time.time()-t0)/max(1,it+1)
            print(f"step {it:5d} | loss {loss.item():.4f} | {dt*1000:.0f}ms/step")
        if it % 500 == 0 and it > 0:
            l = eval_loss()
            ctx = torch.zeros((1,1),dtype=torch.long,device=DEVICE)
            s = decode(model.generate(ctx,120)[0].tolist())
            print(f"\n[eval {it}] train {l['train']:.4f} | val {l['val']:.4f}")
            print(f"sample: {s}\n")
    model.save_identity()
    print("Training complete. Identity successfully anchored to disk.")
except KeyboardInterrupt:
    model.save_identity()
    print("\nExecution suspended manually. Identity saved cleanly to disk.")
