"""
KitlerNet-CHH — Continuous Hebbian Hybrid Network.

1. Persistent Hebbian traces: each fast-weight layer carries M across token-steps,
   updated M = lambda*M + (a outer b), kept differentiable within a step.
2. Local predictive-coding auxiliary loss: each block measures how well its input
   predicts the next block's input; summed and added to the global loss.
3. Live streaming adaptation: generation updates the Hebbian traces per token.
z-loss + label smoothing + 0.3 weight decay, char-level, CPU.
"""

import os
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")

import math, time, urllib.request
from pathlib import Path
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.set_num_threads(4)
torch.manual_seed(1337)
DEVICE = "cpu"

N_EMBED    = 256
N_LAYERS   = 4
N_HEADS    = 4
FWP_RANK   = 4
HEBB_LAMBDA = 0.9
LOCAL_COEFF = 0.1
BLOCK_SIZE = 128
BATCH_SIZE = 12
MAX_ITERS  = 5000
LR         = 3e-4
DROPOUT    = 0.1
WEIGHT_DECAY    = 0.3
LABEL_SMOOTHING = 0.1
Z_LOSS_COEFF    = 1e-4
EVAL_EVERY = 250

HOME = Path.home()
DATA_FILE = HOME / "data.txt"
CKPT = HOME / "kitlernet_chh.pth"

if not DATA_FILE.exists():
    urllib.request.urlretrieve(
        "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt",
        DATA_FILE)
text = DATA_FILE.read_text(encoding="utf-8", errors="ignore")

chars = sorted(set(text)); VOCAB = len(chars)
stoi = {c:i for i,c in enumerate(chars)}; itos = {i:c for i,c in enumerate(chars)}
encode = lambda s: [stoi[c] for c in s]
decode = lambda l: "".join(itos[i] for i in l)
data = torch.tensor(encode(text), dtype=torch.long)
n = int(0.9*len(data)); train_data, val_data = data[:n], data[n:]

def get_batch(which):
    d = train_data if which=="train" else val_data
    ix = torch.randint(len(d)-BLOCK_SIZE-1, (BATCH_SIZE,))
    x = torch.stack([d[i:i+BLOCK_SIZE] for i in ix])
    y = torch.stack([d[i+1:i+1+BLOCK_SIZE] for i in ix])
    return x, y


class RMSNorm(nn.Module):
    def __init__(self, d, eps=1e-6):
        super().__init__(); self.w = nn.Parameter(torch.ones(d)); self.eps = eps
    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True)+self.eps) * self.w


class HebbianFastWeight(nn.Module):
    """
    Effective weight = W0 + scale*M, where M is a persistent low-rank Hebbian trace
    accumulated across token steps:  M <- lambda*M + mean_t(a_t outer b_t).
    M is stored per-batch and carried between steps (detached across steps to keep
    the graph finite; differentiable within the current step's update).
    """
    def __init__(self, dim, rank=FWP_RANK):
        super().__init__()
        self.W0 = nn.Linear(dim, dim, bias=False)
        self.gen_a = nn.Linear(dim, dim*rank, bias=False)
        self.gen_b = nn.Linear(dim, dim*rank, bias=False)
        self.rank, self.dim = rank, dim
        self.scale = 1.0/math.sqrt(rank)
        self.M = None   # persistent trace (B, dim, dim), lazily created

    def reset_trace(self):
        self.M = None

    def forward(self, x, mod):
        B,T,D = x.shape
        base = self.W0(x)
        a = self.gen_a(mod).view(B,T,self.rank,D)
        b = self.gen_b(mod).view(B,T,self.rank,D)
        # Hebbian outer-product contribution this step (avg over time & rank)
        hebb = torch.einsum("btrd,btre->bde", a, b) / (T*self.rank)   # (B,D,D)
        if self.M is None or self.M.shape[0] != B:
            M = hebb
        else:
            M = HEBB_LAMBDA * self.M.to(x.device) + hebb
        self.M = M.detach()                      # carry forward, cut graph across steps
        fast = torch.einsum("btd,bde->bte", x, M)  # apply current trace
        return base + self.scale*fast


class PlasticBlock(nn.Module):
    def __init__(self):
        super().__init__()
        self.hd = N_EMBED//N_HEADS
        self.n1, self.n2 = RMSNorm(N_EMBED), RMSNorm(N_EMBED)
        self.q = HebbianFastWeight(N_EMBED)
        self.k = HebbianFastWeight(N_EMBED)
        self.v = HebbianFastWeight(N_EMBED)
        self.o = HebbianFastWeight(N_EMBED)
        self.f1 = HebbianFastWeight(N_EMBED)
        self.f2 = HebbianFastWeight(N_EMBED)
        self.act = nn.GELU()
        self.drop = nn.Dropout(DROPOUT)
        self.fuse = nn.Linear(N_EMBED*2, N_EMBED, bias=False)
        # local predictive-coding head: predict next block's input from this input
        self.local_pred = nn.Linear(N_EMBED, N_EMBED, bias=False)

    def reset_traces(self):
        for m in (self.q,self.k,self.v,self.o,self.f1,self.f2):
            m.reset_trace()

    def forward(self, x, fb_prev, fb_next):
        mod = self.fuse(torch.cat([fb_prev, fb_next], dim=-1))
        h = self.n1(x); B,T,C = h.shape
        q = self.q(h,mod).view(B,T,N_HEADS,self.hd).transpose(1,2)
        k = self.k(h,mod).view(B,T,N_HEADS,self.hd).transpose(1,2)
        v = self.v(h,mod).view(B,T,N_HEADS,self.hd).transpose(1,2)
        att = F.scaled_dot_product_attention(q,k,v,is_causal=True,
                                             dropout_p=DROPOUT if self.training else 0.0)
        att = att.transpose(1,2).contiguous().view(B,T,C)
        x = x + self.drop(self.o(att,mod))
        h2 = self.n2(x)
        ff = self.f2(self.act(self.f1(h2,mod)),mod)
        x = x + self.drop(ff)
        # local predictive-coding signal: how well input predicts the block output
        local_pred = self.local_pred(h)                 # from pre-block state
        local_err = F.mse_loss(local_pred, x.detach())  # local target = block output
        return x, local_err


class KitlerCHH(nn.Module):
    def __init__(self, vocab):
        super().__init__()
        self.emb = nn.Embedding(vocab, N_EMBED)
        self.pos = nn.Embedding(BLOCK_SIZE, N_EMBED)
        self.blocks = nn.ModuleList([PlasticBlock() for _ in range(N_LAYERS)])
        self.norm = RMSNorm(N_EMBED)
        self.head = nn.Linear(N_EMBED, vocab, bias=False)
        self.emb.weight = self.head.weight
        self.apply(self._init)
    def _init(self, m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, 0.0, 0.02)

    def reset_traces(self):
        for b in self.blocks: b.reset_traces()

    def forward(self, idx, targets=None, prev_states=None):
        B,T = idx.shape
        x = self.emb(idx) + self.pos(torch.arange(T, device=idx.device))
        if prev_states is None:
            prev_states = [torch.zeros(B,T,N_EMBED, device=idx.device) for _ in range(N_LAYERS)]
        outs=[]; local_total=0.0; layer_in=x
        for i,blk in enumerate(self.blocks):
            fb_prev = outs[i-1] if i>0 else torch.zeros_like(x)
            fb_next = prev_states[i+1] if i+1<N_LAYERS else torch.zeros_like(x)
            layer_in, local_err = blk(layer_in, fb_prev, fb_next)
            local_total = local_total + local_err
            outs.append(layer_in)
        logits = self.head(self.norm(layer_in))
        loss=None
        if targets is not None:
            lf=logits.view(-1,logits.size(-1)); tf=targets.view(-1)
            ce=F.cross_entropy(lf,tf,label_smoothing=LABEL_SMOOTHING)
            z=Z_LOSS_COEFF*torch.mean(torch.logsumexp(logits,dim=-1)**2)
            loss = ce + z + LOCAL_COEFF*local_total
        return logits, loss, [o.detach() for o in outs]

    @torch.no_grad()
    def generate(self, idx, n, temp=0.8, top_k=40):
        # live streaming: traces update every token as context is ingested
        for _ in range(n):
            logits,_,_ = self(idx[:, -BLOCK_SIZE:])
            logits = logits[:,-1,:]/temp
            v,_ = torch.topk(logits, min(top_k, logits.size(-1)))
            logits[logits < v[:,[-1]]] = -float("inf")
            idx = torch.cat([idx, torch.multinomial(F.softmax(logits,-1),1)],1)
        return idx


model = KitlerCHH(VOCAB).to(DEVICE)
params = sum(p.numel() for p in model.parameters())/1e6
print(f"KitlerNet-CHH | {params:.1f}M params | Hebbian traces + local PC loss | vocab {VOCAB}")

decay,no_decay=[],[]
for name,p in model.named_parameters():
    (no_decay if ("norm" in name or p.ndim<2) else decay).append(p)
optim = torch.optim.AdamW(
    [{"params":decay,"weight_decay":WEIGHT_DECAY},
     {"params":no_decay,"weight_decay":0.0}],
    lr=LR, betas=(0.9,0.95), eps=1e-8)

@torch.no_grad()
def eval_loss():
    model.eval(); model.reset_traces(); out={}
    for w in ("train","val"):
        out[w]=sum(model(*get_batch(w))[1].item() for _ in range(10))/10
    model.train(); model.reset_traces(); return out

print("training — Ctrl+C to stop")
t0=time.time(); prev=None
try:
    for it in range(MAX_ITERS):
        xb,yb=get_batch("train")
        model.reset_traces()               # fresh trace per independent batch
        _,loss,prev=model(xb,yb,prev)
        optim.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(),1.0)
        optim.step()
        if it%10==0:
            dt=(time.time()-t0)/max(1,it+1)
            print(f"step {it:5d} | loss {loss.item():.4f} | {dt*1000:.0f}ms/step")
        if it%EVAL_EVERY==0 and it>0:
            l=eval_loss()
            ctx=torch.zeros((1,1),dtype=torch.long)
            model.reset_traces()
            s=decode(model.generate(ctx,120)[0].tolist())
            model.reset_traces()
            print(f"\n[eval {it}] train {l['train']:.4f} | val {l['val']:.4f}")
            print(f"sample: {s}\n")
            torch.save({"model":model.state_dict(),"iter":it},CKPT)
except KeyboardInterrupt:
    torch.save({"model":model.state_dict(),"iter":it},CKPT)
    print(f"\nsaved @ {CKPT}")
