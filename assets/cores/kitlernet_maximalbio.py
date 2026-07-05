"""
KitlerNet-MaximalBio — biologically extreme spiking cortical network.

Implements six interacting mechanisms inside each cortical layer:
  1. LIF neurons + custom surrogate-gradient autograd (Heaviside fwd, fast-sigmoid bwd)
  2. Unsupervised STDP trace engine (pre/post exponential traces, LTP - LTD)
  3. Homeostatic synaptic scaling (per-neuron firing-rate average -> threshold adjust)
  4. Lateral inhibition / winner-take-all (spike at t injects negative current at t+1)
  5. Dopamine-gated plasticity (global reward scalar scales STDP updates)
  6. Multi-step axonal propagation delays (per-route 1-3 step spike buffer)

Char-level Tiny Shakespeare, CPU thread-clamped, diagnostic eval loop tracking
homeostatic threshold stability alongside prediction loss.
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

# ── config ──
N_EMBED    = 192
N_HIDDEN   = 192
N_LAYERS   = 2
BLOCK_SIZE = 96
BATCH_SIZE = 12
MAX_ITERS  = 5000
LR         = 3e-4
EVAL_EVERY = 250

# biological constants
V_THRESHOLD0 = 1.0      # baseline firing threshold
V_DECAY      = 0.9      # membrane leak
SURR_SCALE   = 10.0     # surrogate sharpness
STDP_LR      = 5e-4
STDP_TAU     = 0.9      # pre/post trace decay
TARGET_RATE  = 0.1      # homeostatic target spike frequency
HOMEO_LR     = 1e-3     # threshold adaptation rate
INHIB_STRENGTH = 0.5    # lateral inhibition magnitude
MAX_DELAY    = 3        # axonal delay range (1..MAX_DELAY)

HOME = Path.home()
DATA_FILE = HOME / "data.txt"
CKPT = HOME / "kitlernet_maximalbio.pth"

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


# ── (1) surrogate-gradient spike ──
class SurrogateSpike(torch.autograd.Function):
    @staticmethod
    def forward(ctx, v):
        ctx.save_for_backward(v)
        return (v > 0).float()                      # sharp Heaviside forward
    @staticmethod
    def backward(ctx, g):
        (v,) = ctx.saved_tensors
        return g * (1.0 / (SURR_SCALE * v.abs() + 1.0) ** 2)   # fast-sigmoid surrogate
spike_fn = SurrogateSpike.apply


class CorticalLayer(nn.Module):
    def __init__(self, d_in, d_out):
        super().__init__()
        self.fc = nn.Linear(d_in, d_out, bias=False)          # task-trained synapses
        self.d_in, self.d_out = d_in, d_out
        # (2) STDP trace matrix (local, non-backprop)
        self.register_buffer("stdp", torch.zeros(d_out, d_in), persistent=False)
        # (3) homeostatic per-neuron threshold + running rate
        self.register_buffer("vth", torch.full((d_out,), V_THRESHOLD0), persistent=False)
        self.register_buffer("rate", torch.zeros(d_out), persistent=False)
        # (4) lateral inhibition coupling (fixed local competition)
        self.register_buffer("inhib", (torch.ones(d_out, d_out) - torch.eye(d_out)) * INHIB_STRENGTH, persistent=False)
        # (6) per-neuron axonal delay assignment (1..MAX_DELAY)
        self.register_buffer("delays", torch.randint(1, MAX_DELAY + 1, (d_out,)), persistent=False)

    def forward(self, x, dopamine=1.0):
        B, T, _ = x.shape
        v = torch.zeros(B, self.d_out, device=x.device)
        pre_tr = torch.zeros(B, self.d_in, device=x.device)
        post_tr = torch.zeros(B, self.d_out, device=x.device)
        inhib_current = torch.zeros(B, self.d_out, device=x.device)
        # (6) axonal delay buffer: future spikes to be delivered
        delay_buf = torch.zeros(MAX_DELAY + 1, B, self.d_out, device=x.device)
        spikes_out = []
        W_plastic = self.stdp * STDP_LR
        for t in range(T):
            xt = x[:, t, :]
            inp = self.fc(xt) + F.linear(xt, W_plastic)
            # deliver spikes that were delayed to arrive now
            arriving = delay_buf[0].clone()
            delay_buf = torch.roll(delay_buf, shifts=-1, dims=0)
            delay_buf[-1].zero_()
            v = V_DECAY * v + inp - inhib_current + arriving
            # (1) surrogate spike vs per-neuron homeostatic threshold
            s = spike_fn(v - self.vth)
            v = v * (1.0 - s.detach())                          # reset
            spikes_out.append(s)
            # (4) lateral inhibition: this step's spikes inhibit neighbors next step
            inhib_current = F.linear(s.detach(), self.inhib)
            # (6) schedule delayed axonal delivery per neuron
            with torch.no_grad():
                for d in range(1, MAX_DELAY + 1):
                    mask = (self.delays == d).float()
                    delay_buf[d] += s.detach() * mask
            # (2)+(5) STDP with dopamine gating (no grad)
            with torch.no_grad():
                pre_tr = STDP_TAU * pre_tr + xt
                post_tr = STDP_TAU * post_tr + s
                ltp = torch.einsum("bo,bi->oi", s, pre_tr)
                ltd = torch.einsum("bo,bi->oi", post_tr, xt)
                self.stdp += dopamine * STDP_LR * (ltp - ltd) / B
                self.stdp.clamp_(-1.0, 1.0)
                # (3) homeostasis: update running rate, nudge thresholds
                self.rate = 0.99 * self.rate + 0.01 * s.mean(0)
                self.vth += HOMEO_LR * (self.rate - TARGET_RATE)
                self.vth.clamp_(0.2, 5.0)
        return torch.stack(spikes_out, dim=1)

    def threshold_stability(self):
        return self.vth.std().item(), self.rate.mean().item()


class KitlerMaximalBio(nn.Module):
    def __init__(self, vocab):
        super().__init__()
        self.emb = nn.Embedding(vocab, N_EMBED)
        self.pos = nn.Embedding(BLOCK_SIZE, N_EMBED)
        dims = [N_EMBED] + [N_HIDDEN]*N_LAYERS
        self.layers = nn.ModuleList([CorticalLayer(dims[i], dims[i+1]) for i in range(N_LAYERS)])
        self.readout = nn.Linear(N_HIDDEN, vocab)
    def forward(self, idx, targets=None, dopamine=1.0):
        B,T = idx.shape
        x = self.emb(idx) + self.pos(torch.arange(T, device=idx.device))
        for layer in self.layers:
            x = layer(x, dopamine=dopamine)
        logits = self.readout(x)
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
        return logits, loss
    @torch.no_grad()
    def generate(self, idx, n, temp=0.8, top_k=40):
        for _ in range(n):
            logits,_ = self(idx[:, -BLOCK_SIZE:])
            logits = logits[:,-1,:]/temp
            v,_ = torch.topk(logits, min(top_k, logits.size(-1)))
            logits[logits < v[:,[-1]]] = -float("inf")
            idx = torch.cat([idx, torch.multinomial(F.softmax(logits,-1),1)],1)
        return idx


model = KitlerMaximalBio(VOCAB).to(DEVICE)
params = sum(p.numel() for p in model.parameters())/1e6
print(f"KitlerNet-MaximalBio | {params:.1f}M | LIF+STDP+homeo+WTA+dopamine+delays | vocab {VOCAB}")

optim = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9,0.95), weight_decay=0.1)

prev_loss = [10.0]   # for (5) dopamine reward on loss drop
@torch.no_grad()
def eval_loss():
    model.eval(); out={}
    for w in ("train","val"):
        out[w]=sum(model(*get_batch(w))[1].item() for _ in range(5))/5
    model.train(); return out

print("training — Ctrl+C to stop")
t0=time.time()
try:
    for it in range(MAX_ITERS):
        xb,yb=get_batch("train")
        # (5) dopamine: reward (boost plasticity) when loss drops sharply
        dopamine = 1.0
        _,loss=model(xb,yb,dopamine=dopamine)
        drop = prev_loss[0] - loss.item()
        if drop > 0.05:
            dopamine = 2.0                      # reinforce on big improvement
        prev_loss[0] = loss.item()
        optim.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(),1.0)
        optim.step()
        if it%10==0:
            dt=(time.time()-t0)/max(1,it+1)
            print(f"step {it:5d} | loss {loss.item():.4f} | dopa {dopamine:.1f} | {dt*1000:.0f}ms/step")
        if it%EVAL_EVERY==0 and it>0:
            l=eval_loss()
            # diagnostic: homeostatic threshold stability per layer
            diag = " | ".join(f"L{i}:vth_std={ly.threshold_stability()[0]:.3f},rate={ly.threshold_stability()[1]:.3f}"
                              for i,ly in enumerate(model.layers))
            ctx=torch.zeros((1,1),dtype=torch.long)
            s=decode(model.generate(ctx,100)[0].tolist())
            print(f"\n[eval {it}] train {l['train']:.4f} | val {l['val']:.4f}")
            print(f"  homeostasis: {diag}")
            print(f"  sample: {s}\n")
            torch.save({"model":model.state_dict(),"iter":it},CKPT)
except KeyboardInterrupt:
    torch.save({"model":model.state_dict(),"iter":it},CKPT)
    print(f"\nsaved @ {CKPT}")
