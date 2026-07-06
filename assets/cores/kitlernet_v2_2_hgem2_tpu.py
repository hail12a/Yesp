#!/usr/bin/env python3
"""
Hybrid Generative-Episodic Model (HGEM) — character-level transformer with
fast-weight, Hebbian-memory, world-model, controller, and narrative heads.

Rewritten for XLA/TPU stability:
  * No `register_buffer` calls inside forward() (kept module graph static).
  * topk-based sparsity replaced with a static quantile threshold mask.
  * All persistent state pre-allocated with fixed, known shapes.
  * Single mark_step barrier per optimizer step; safe CPU/CUDA fallback.
"""

import os
import io
import math
import time
import warnings
import urllib.request
from pathlib import Path

import requests
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F

# --------------------
# 0. Environment / device
# --------------------
warnings.filterwarnings("ignore", category=UserWarning, module="torch_xla")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GRPC_VERBOSITY", "ERROR")
os.environ.setdefault("TPU_STDERR_LOG_LEVEL", "3")   # silence InitGoogle noise
os.environ.setdefault("XLA_USE_BF16", "1")
os.environ.setdefault("XLA_DOWNCAST_BF16", "1")

try:
    import torch_xla
    import torch_xla.core.xla_model as xm
    DEVICE = torch_xla.device()
    IS_XLA = True
    print(f"TPU core initialized on device: {DEVICE}", flush=True)
except ImportError:
    DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    IS_XLA = False
    print(f"torch_xla not found — using {DEVICE}.", flush=True)


def sync_step():
    """One XLA graph boundary; no-op off TPU."""
    if IS_XLA:
        # torch_xla.sync() is the current API; xm.mark_step() is deprecated.
        if hasattr(torch_xla, "sync"):
            torch_xla.sync()
        else:
            xm.mark_step()


def save_tensor(obj, path):
    (xm.save if IS_XLA else torch.save)(obj, path)


# --------------------
# Hyperparameters
# --------------------
N_EMBED    = 512
N_HEADS    = 8
N_LAYERS   = 8
FWP_RANK   = 8
BLOCK_SIZE = 256
BATCH_SIZE = 32
LR         = 3.0e-4          # peak LR (was 1e-4 — too conservative for this size)
MIN_LR     = 3.0e-5          # cosine floor (learns more in the tail)
MAX_ITERS  = 10000
WARMUP     = 300             # slightly longer warmup for the higher peak LR
DROPOUT    = 0.15
TOP_K      = 30
LOG_EVERY  = 50
CKPT_EVERY = 500             # checkpoint + validation on their own schedule

# Auxiliary-loss target weights. These are RAMPED IN over AUX_WARMUP steps so the
# model learns clean language first, then layers the extra objectives on top.
W_CONTROLLER = 0.10
W_NARRATIVE  = 0.05
W_GROUNDING  = 0.05
AUX_WARMUP   = 1500

# Mutable "current" aux weights — updated each step from the schedule.
_aux_scale = 0.0


def aux_weight(base: float) -> float:
    return base * _aux_scale

WORKING_DIR     = Path("/kaggle/working")
CHECKPOINT_FILE = WORKING_DIR / "hgem_full.pth"
IDENTITY_FILE   = WORKING_DIR / "hybrid_identity.pt"
DATA_FILE       = WORKING_DIR / "data_anchor.txt"
WORKING_DIR.mkdir(parents=True, exist_ok=True)


# --------------------
# 1. Vocabulary anchor
# --------------------
if not DATA_FILE.exists():
    print("Caching vocabulary baseline text...", flush=True)
    urllib.request.urlretrieve(
        "https://raw.githubusercontent.com/karpathy/char-rnn/"
        "master/data/tinyshakespeare/input.txt",
        DATA_FILE,
    )
base_text = DATA_FILE.read_text(encoding="utf-8", errors="ignore")


# --------------------
# 2. Data pipeline
# --------------------
print("\nFetching 'dailydialog' parquet shards...", flush=True)
parquet_api_url = (
    "https://huggingface.co/api/datasets/roskoN/dailydialog/parquet/full/train"
)
try:
    resp = requests.get(parquet_api_url, timeout=15)
    resp.raise_for_status()
    parquet_files = resp.json()
except Exception as e:
    raise RuntimeError(
        f"Failed to fetch dataset paths ({e}). Enable internet in settings."
    )

dialogue_list = []
for idx, file_url in enumerate(parquet_files):
    if idx >= 2:
        break
    print(f"Streaming shard [{idx + 1}]: {file_url.split('/')[-1]}", flush=True)
    df_shard = pd.read_parquet(io.BytesIO(requests.get(file_url, timeout=30).content))

    dialogue_col = next(
        (c for c in ("dialogue", "utterances", "turns", "conversation")
         if c in df_shard.columns),
        None,
    )
    if dialogue_col is None:
        raise ValueError("No conversational column found in shard.")

    for item in df_shard[dialogue_col]:
        if hasattr(item, "__len__") and not isinstance(item, str):
            block = [
                f"{'User' if i % 2 == 0 else 'Bot'}: {str(u).strip()}"
                for i, u in enumerate(item)
            ]
            dialogue_list.append("\n".join(block))
        else:
            dialogue_list.append(str(item))

full_dialogue_text = "\n\n=== NEW CONVERSATION ===\n\n".join(dialogue_list)
print(f"Loaded {len(full_dialogue_text)} dialogue characters.", flush=True)

combined_text = base_text + full_dialogue_text
chars = sorted(set(combined_text))
VOCAB = len(chars)
stoi  = {c: i for i, c in enumerate(chars)}
itos  = {i: c for i, c in enumerate(chars)}
encode = lambda s: [stoi[c] for c in s if c in stoi]
decode = lambda l: "".join(itos[i] for i in l)

n_total = len(full_dialogue_text)
n_kept  = sum(1 for c in full_dialogue_text if c in stoi)
print(
    f"Vocab size: {VOCAB} | OOV rate: "
    f"{(n_total - n_kept) / max(1, n_total) * 100:.2f}%",
    flush=True,
)

data = torch.tensor(encode(full_dialogue_text), dtype=torch.long)
n = int(0.9 * len(data))
train_data, val_data = data[:n], data[n:]


def get_batch(which: str):
    d = train_data if which == "train" else val_data
    ix = torch.randint(0, len(d) - BLOCK_SIZE, (BATCH_SIZE,)).tolist()
    x = torch.stack([d[i:i + BLOCK_SIZE]         for i in ix])
    y = torch.stack([d[i + 1:i + 1 + BLOCK_SIZE] for i in ix])
    return x.to(DEVICE), y.to(DEVICE)


# --------------------
# 3. Modules
# --------------------
class RMSNorm(nn.Module):
    def __init__(self, d: int, eps: float = 1e-5):
        super().__init__()
        self.w   = nn.Parameter(torch.ones(d))
        self.eps = eps

    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.w


class FastWeightLinear(nn.Module):
    def __init__(self, dim: int, rank: int = FWP_RANK * 2):
        super().__init__()
        self.W0    = nn.Linear(dim, dim, bias=False)
        self.gen_a = nn.Linear(dim, dim * rank, bias=False)
        self.gen_b = nn.Linear(dim, dim * rank, bias=False)
        self.gate  = nn.Linear(dim, rank)
        self.rank  = rank
        self.dim   = dim
        self.scale = 1.0 / math.sqrt(dim)

    def forward(self, x):
        B, T, D = x.shape
        base  = self.W0(x)
        a     = self.gen_a(x).view(B, T, self.rank, D) * 0.05
        b     = self.gen_b(x).view(B, T, self.rank, D) * 0.05
        coeff = torch.einsum("btd,btrd->btr", x, b)
        coeff = coeff * torch.sigmoid(self.gate(x))
        coeff = torch.clamp(coeff, -8.0, 8.0)
        fast  = torch.einsum("btr,btrd->btd", coeff, a)
        return base + self.scale * fast


class HebbianMemory(nn.Module):
    """XLA-safe: static shapes, no in-forward buffer registration."""

    def __init__(self, dim: int, rank: int = FWP_RANK * 2,
                 lam: float = 0.85, sparsity: float = 0.08):
        super().__init__()
        self.gen_a    = nn.Linear(dim, dim * rank, bias=False)
        self.gen_b    = nn.Linear(dim, dim * rank, bias=False)
        self.rank     = rank
        self.dim      = dim
        self.lam      = lam
        self.sparsity = sparsity
        self.norm     = RMSNorm(dim)
        self.register_buffer("_trace_valid", torch.zeros(1, dtype=torch.bool))
        self.register_buffer("_seq_trace", torch.zeros(1, dim, dim))

    def reset(self):
        self._trace_valid.fill_(False)

    def forward(self, x):
        B, T, D = x.shape
        a = self.gen_a(x).view(B, T, self.rank, D) * 0.05
        b = self.gen_b(x).view(B, T, self.rank, D) * 0.05

        hebb = torch.einsum("btrd,btre->bde", a, b) / (T * self.rank)

        # Static quantile-threshold sparsity (no dynamic topk/scatter).
        flat   = hebb.view(B, -1)
        thresh = torch.quantile(flat.abs(), 1.0 - self.sparsity, dim=-1, keepdim=True)
        mask   = (flat.abs() >= thresh).to(hebb.dtype)
        hebb_sparse = hebb * mask.view(B, D, D)

        if self.training:
            M = hebb_sparse
        else:
            if self._trace_valid.item() and self._seq_trace.shape == hebb_sparse.shape:
                M = self.lam * self._seq_trace + (1.0 - self.lam) * hebb_sparse
            else:
                M = hebb_sparse
            self._seq_trace = M.detach()          # plain attr assign, no re-register
            self._trace_valid.fill_(True)

        M   = torch.clamp(M, -1.5, 1.5)
        return torch.einsum("btd,bde->bte", self.norm(x), M) * (1.0 / math.sqrt(D))


class Attention(nn.Module):
    def __init__(self):
        super().__init__()
        self.hd        = N_EMBED // N_HEADS
        self.qkv       = nn.Linear(N_EMBED, 3 * N_EMBED, bias=False)
        self.o         = nn.Linear(N_EMBED, N_EMBED, bias=False)
        self.head_gate = nn.Parameter(torch.ones(N_HEADS))

    def forward(self, x):
        B, T, C = x.shape
        q, k, v = self.qkv(x).split(N_EMBED, dim=2)
        q = q.view(B, T, N_HEADS, self.hd).transpose(1, 2)
        k = k.view(B, T, N_HEADS, self.hd).transpose(1, 2)
        v = v.view(B, T, N_HEADS, self.hd).transpose(1, 2)

        att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(self.hd))
        mask = torch.triu(
            torch.ones(T, T, dtype=torch.bool, device=x.device), diagonal=1
        )
        att = att.masked_fill(mask.unsqueeze(0).unsqueeze(1), float("-inf"))
        att = F.softmax(att, dim=-1)
        if self.training:
            att = F.dropout(att, p=DROPOUT)

        out  = att @ v
        gate = torch.sigmoid(self.head_gate).view(1, N_HEADS, 1, 1)
        out  = out * gate
        return self.o(out.transpose(1, 2).contiguous().view(B, T, C))


class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.norm1 = RMSNorm(N_EMBED)
        self.norm2 = RMSNorm(N_EMBED)
        self.att   = Attention()
        self.fw    = FastWeightLinear(N_EMBED)
        self.hebb  = HebbianMemory(N_EMBED)
        self.act   = nn.GELU()
        self.proj  = nn.Linear(N_EMBED, N_EMBED, bias=False)
        self.drop  = nn.Dropout(DROPOUT)

    def forward(self, x):
        x = x + self.drop(self.att(self.norm1(x)))
        n = self.norm2(x)
        h = self.act(self.fw(n) + self.hebb(n))
        return x + self.drop(self.proj(h))

    def reset_memory(self):
        self.hebb.reset()


class WorldModel(nn.Module):
    def __init__(self, vocab: int, dim: int):
        super().__init__()
        self.emb      = nn.Embedding(vocab, dim)
        self.obj_mlp  = nn.Sequential(nn.Linear(dim, dim), nn.GELU(), nn.Linear(dim, dim))
        self.prop_mlp = nn.Sequential(nn.Linear(dim, dim), nn.GELU(), nn.Linear(dim, dim))

    def forward(self, idx):
        x = self.emb(idx)
        return self.obj_mlp(x), self.prop_mlp(x)

    def grounding_loss(self, obj, prop):
        sim_pos = F.cosine_similarity(obj, prop, dim=-1)
        prop_shuffled = torch.roll(prop, 1, dims=0) if prop.size(0) > 1 else prop
        sim_neg = F.cosine_similarity(obj, prop_shuffled, dim=-1)
        loss = (1.0 - sim_pos).mean() + F.relu(sim_neg - 0.2).mean()
        return torch.clamp(loss, max=2.0)


class QualiaMap(nn.Module):
    def __init__(self, dim: int, qualia_dim: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(dim, qualia_dim), nn.GELU(), nn.Linear(qualia_dim, qualia_dim)
        )

    def forward(self, hidden):
        return torch.tanh(self.net(hidden))

    @staticmethod
    def regularisation_loss(qualia):
        return qualia.pow(2).mean()


class Controller(nn.Module):
    def __init__(self, dim: int, vocab: int, n_goals: int = 4,
                 load_identity: bool = True):
        super().__init__()
        self.dim = dim
        self.register_buffer("self_state", torch.zeros(1, dim))

        if load_identity and IDENTITY_FILE.exists():
            try:
                loaded = torch.load(IDENTITY_FILE, map_location="cpu")
                if loaded.shape[-1] == dim:
                    self.self_state.copy_(loaded)
                    print("Controller: loaded identity state.", flush=True)
            except Exception as e:
                print(f"Controller: identity load failed ({e}); zero init.", flush=True)

        self.goal_bank  = nn.Parameter(torch.randn(n_goals, dim) * 0.01)
        self.mlp        = nn.Sequential(
            nn.Linear(dim * 2, dim), nn.GELU(), nn.Linear(dim, dim)
        )
        self.logit_bias = nn.Linear(dim, vocab, bias=False)
        self.norm       = RMSNorm(dim)

    def forward(self, hidden, goal_vec=None):
        B, T, D = hidden.shape
        if goal_vec is None:
            with torch.no_grad():
                scores   = torch.matmul(F.normalize(self.self_state, dim=-1), self.goal_bank.T)
                idx      = scores.argmax(dim=-1)
                goal_vec = self.goal_bank[idx].unsqueeze(0).detach()

        goal  = goal_vec.reshape(1, 1, D).expand(B, T, D)
        h     = self.mlp(torch.cat([self.norm(hidden), goal], dim=-1))

        if not self.training:
            with torch.no_grad():
                new_contrib = hidden.mean(dim=(0, 1), keepdim=True).squeeze(0).detach()
                updated = (0.97 * F.normalize(self.self_state.detach(), dim=-1)
                           + 0.03 * new_contrib)
                self.self_state.copy_(updated)

        return self.logit_bias(h)

    def reset_state(self):
        self.self_state.zero_()

    def save_identity(self):
        save_tensor(self.self_state.detach().cpu(), IDENTITY_FILE)


class NarrativeHead(nn.Module):
    def __init__(self, dim: int, vocab: int):
        super().__init__()
        self.net  = nn.Sequential(
            nn.Linear(dim * 2, dim), nn.GELU(), nn.Linear(dim, dim), nn.GELU()
        )
        self.head = nn.Linear(dim, vocab, bias=False)
        self.norm = RMSNorm(dim)

    def forward(self, hidden, self_state):
        B, T, D = hidden.shape
        s = F.normalize(self_state, dim=-1).expand(B, T, D)
        return self.head(self.net(torch.cat([self.norm(hidden), s], dim=-1)))


class HybridBrain(nn.Module):
    def __init__(self, vocab: int):
        super().__init__()
        self.vocab      = vocab
        self.emb        = nn.Embedding(vocab, N_EMBED)
        self.pos        = nn.Embedding(BLOCK_SIZE, N_EMBED)
        self.blocks     = nn.ModuleList([Block() for _ in range(N_LAYERS)])
        self.norm       = RMSNorm(N_EMBED)
        self.head       = nn.Linear(N_EMBED, vocab, bias=False)
        self.world      = WorldModel(vocab, N_EMBED)
        self.qualia_map = QualiaMap(N_EMBED)
        self.controller = Controller(N_EMBED, vocab)
        self.narrative  = NarrativeHead(N_EMBED, vocab)

    def reset_memory(self):
        for b in self.blocks:
            b.reset_memory()

    def forward(self, idx, targets=None, goal_vec=None):
        B, T = idx.shape
        x = self.emb(idx) + self.pos(torch.arange(T, device=idx.device))
        for block in self.blocks:
            x = block(x)
        x = self.norm(x)

        logits_base      = self.head(x)
        obj, prop        = self.world(idx)
        grounding_loss   = self.world.grounding_loss(obj, prop)
        qualia           = self.qualia_map(x)
        bias_logits      = self.controller(x, goal_vec=goal_vec)
        narrative_logits = self.narrative(x, self.controller.self_state.detach())

        w_ctrl = aux_weight(W_CONTROLLER)
        w_narr = aux_weight(W_NARRATIVE)
        w_grnd = aux_weight(W_GROUNDING)

        logits = logits_base + w_ctrl * bias_logits + w_narr * narrative_logits

        loss = None
        if targets is not None:
            ce_loss    = F.cross_entropy(
                logits.reshape(-1, logits.size(-1)), targets.reshape(-1)
            )
            qualia_reg = QualiaMap.regularisation_loss(qualia) * 1e-4
            loss = ce_loss + w_grnd * grounding_loss + qualia_reg

        return logits, loss, {"qualia": qualia, "grounding_loss": grounding_loss}

    @torch.no_grad()
    def generate(self, ctx, n, temp=0.85, top_k=TOP_K, goal_vec=None):
        self.reset_memory()
        idx = ctx
        for _ in range(n):
            idx_cond = idx[:, -BLOCK_SIZE:]
            logits, _, _ = self.forward(idx_cond, goal_vec=goal_vec)
            logits = logits[:, -1, :] / temp
            if idx.size(1) >= 3:
                recent = idx[0, -32:].unique()
                penalty = torch.zeros_like(logits[0]).scatter_(0, recent, 1.5)
                logits = logits - penalty.unsqueeze(0)
            v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
            logits = logits.masked_fill(logits < v[:, [-1]], float("-inf"))
            probs = F.softmax(logits, dim=-1)
            idx = torch.cat([idx, torch.multinomial(probs, 1)], dim=1)
            sync_step()
        return idx

    def save_checkpoint(self, path: Path = CHECKPOINT_FILE):
        save_tensor({"model_state": self.state_dict(), "vocab": self.vocab}, path)
        print(f"Checkpoint saved → {path}", flush=True)

    @classmethod
    def load_checkpoint(cls, path: Path = CHECKPOINT_FILE, device=DEVICE):
        data  = torch.load(path, map_location=device)
        model = cls(data["vocab"])
        model.load_state_dict(data["model_state"])
        return model.to(device)

    def save_identity(self):
        self.controller.save_identity()


# --------------------
# 4. Train
# --------------------
@torch.no_grad()
def estimate_val_loss(model, iters: int = 20):
    model.eval()
    losses = []
    for _ in range(iters):
        xb, yb = get_batch("val")
        _, loss, _ = model(xb, yb)
        sync_step()
        losses.append(loss.item())
    model.train()
    return sum(losses) / len(losses)


@torch.no_grad()
def sample_text(model, prompt: str = "User: Hey, how are you?\nBot:",
                n_new: int = 200, temp: float = 0.8):
    """Generate a short sample so coherence can be judged directly, not just via loss."""
    model.eval()
    ctx = torch.tensor([encode(prompt)], dtype=torch.long, device=DEVICE)
    out = model.generate(ctx, n_new, temp=temp)
    model.train()
    text = decode(out[0].tolist())
    # Trim at the conversation separator so the sample stays readable.
    cut = text.find("=== NEW CONVERSATION ===", len(prompt))
    return text if cut == -1 else text[:cut].rstrip()


def main():
    model = HybridBrain(VOCAB).to(DEVICE)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Model ready — {n_params / 1e6:.1f}M parameters on {DEVICE}", flush=True)

    optim = torch.optim.AdamW(
        model.parameters(), lr=LR, betas=(0.9, 0.95), weight_decay=0.15
    )

    def get_lr(it):
        if it < WARMUP:
            return LR * (it + 1) / WARMUP
        prog = min(1.0, (it - WARMUP) / (MAX_ITERS - WARMUP))
        return MIN_LR + 0.5 * (LR - MIN_LR) * (1.0 + math.cos(math.pi * prog))

    print("\n--- Optimization loop running ---", flush=True)
    t0 = step_t0 = time.time()
    best_loss = float("inf")
    model.train()

    global _aux_scale
    it = 0
    try:
        for it in range(MAX_ITERS + 1):
            for g in optim.param_groups:
                g["lr"] = get_lr(it)

            # Ramp auxiliary objectives in gradually (0 → 1 over AUX_WARMUP steps)
            # so pure language modelling dominates early training.
            _aux_scale = min(1.0, it / AUX_WARMUP)

            xb, yb = get_batch("train")
            logits, loss, aux = model(xb, yb)

            optim.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)

            if IS_XLA:
                xm.optimizer_step(optim, barrier=True)
            else:
                optim.step()

            if it % LOG_EVERY == 0:
                elapsed = time.time() - step_t0
                ms = elapsed / LOG_EVERY * 1000 if it > 0 else (time.time() - t0) * 1000
                step_t0 = time.time()
                loss_val = loss.item()
                best_loss = min(best_loss, loss_val)
                print(
                    f"step {it:5d} | loss {loss_val:.4f} "
                    f"| grounding {aux['grounding_loss'].item():.4f} "
                    f"| lr {get_lr(it):.2e} | aux {_aux_scale:.2f} | {ms:.0f}ms/step",
                    flush=True,
                )

            # Checkpoint on its own cadence, not on every loss improvement.
            if it > 0 and it % CKPT_EVERY == 0:
                vl = estimate_val_loss(model)
                print(f"           ↳ val loss {vl:.4f} — saving checkpoint", flush=True)
                model.save_checkpoint()
                model.save_identity()
                # Coherence check: read the text, don't just trust the loss number.
                try:
                    sample = sample_text(model)
                    print("           ┌─ sample ─────────────────────────────", flush=True)
                    for line in sample.splitlines():
                        print(f"           │ {line}", flush=True)
                    print("           └──────────────────────────────────────", flush=True)
                except Exception as e:
                    print(f"           (sample generation skipped: {e})", flush=True)

    except KeyboardInterrupt:
        print(f"\n[interrupted at step {it}] saving checkpoint before exit...", flush=True)
        model.save_checkpoint()
        model.save_identity()
        print("Saved. Safe to stop.", flush=True)
        return

    print(f"\nDone in {(time.time() - t0) / 60:.1f} min. Best train loss {best_loss:.4f}",
          flush=True)


if __name__ == "__main__":
    main()
