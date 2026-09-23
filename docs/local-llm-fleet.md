# Local LLM fleet — findings from the speed campaign (Sep 2026)

An optional layer on top of speedy-claude: a local MLX specialist swarm behind an
Anthropic-compatible router, so most agent traffic never leaves the machine.
This doc records what we measured, what we swapped, and the gotchas that cost us
time — so a new Mac can skip straight to the good config.

Measured on an M5 Max 128GB, macOS 26. Numbers are directional (n=4 prompts,
temp 0), logged over time in a JSONL benchmark store.

## Runner: rapid-mlx over mlx_lm.server

A/B on identical prompts (4-prompt battery, warm, temp 0, 350 max tokens):

| Port    | Model                             | mlx_lm.server | rapid-mlx 0.14.3 | Delta    |
| ------- | --------------------------------- | ------------- | ---------------- | -------- |
| code    | Qwen3-Coder-30B-A3B-Instruct-4bit | 91.9 tok/s    | 121.8 tok/s      | **+33%** |
| reason  | Qwen3.8-27B-4bit                  | 24.8 tok/s    | 29.5 tok/s       | **+19%** |
| extract | Qwen3-4B-Instruct-2507-4bit       | fast already  | fast already     | ~even    |

Why it is faster, concretely:

- **MTP actually works.** `mlx_lm` 0.31.x silently strips weights whose names
  start with `mtp.` at load, so `-mtp` checkpoints give zero speedup there.
  rapid-mlx auto-detects MTP eligibility and uses it.
- Continuous batching + radix prefix cache: repeated prompt prefixes are
  near-free across requests (watch the `cache_fetch HIT` lines in the log).
- KV stays bf16 by default; int4/int8 KV quant is available if RAM-bound.
- Native `/v1/messages` (Anthropic) in addition to `/v1/chat/completions`.

Gotcha: rapid-mlx prints a scary _kernel-panic warning_ whenever projected RAM
use is high. It is a firmware-amcc heuristic, not a hard limit — on a 128GB
machine a 16GB model with 86GB in use is fine, but read the numbers before
dismissing it.

## The fleet (single source of truth)

One registry file holds port↔model↔flags; lifecycle and routing both import it.
Change a model in one place, everything follows.

| Port | Model                             | Role                       | RAM    | Engine |
| ---- | --------------------------------- | -------------------------- | ------ | ------ |
| 8901 | Qwen3-Coder-30B-A3B-Instruct-4bit | code (MoE, 3B active)      | ~16GB  | rapid  |
| 8902 | Qwen3-4B-Instruct-2507-4bit       | extract/simple             | ~2GB   | rapid  |
| 8903 | Qwen3.8-27B-4bit                  | reason/architecture        | ~15GB  | rapid  |
| 8904 | Qwen3-Embedding-0.6B-4bit-DWQ     | embed                      | ~0.3GB | mlx_lm |
| 8905 | Qwen3-Reranker-0.6B-4bit          | rerank                     | ~0.3GB | mlx_lm |
| 8906 | Qwen3.5-9B-4bit                   | danish/general (on demand) | ~5.6GB | rapid  |
| 8912 | Kev-4B decision model             | classifier leg             | ~8GB   | kev    |

Model-swap discipline: every swap lives behind one registry line, and the
rollback is reverting that line. Bench before and after with the same battery.

Rerank is a deliberate gap, not an accidental one: the 0.6B reranker server was
retired when mlx_lm 0.31.x dropped the `/v1/rerank` route (embeddings stayed on
a dedicated on-demand server). If RAG relevance work needs it again, add a
dedicated embed/rerank server package — don't assume mlx_lm serves it.

## Routing: regex pre-filter, then a small classifier for the ambiguity band

Request flow (all local, ~0 overhead for the common case):

1. **Regex scorer (0ms)** — 7 cheap dimensions (code markers, length, prose
   ratio, …) classify SIMPLE → extract model, code → coder, everything else →
   reason model. Most traffic never leaves this stage.
2. **Ambiguity band** — scores in a calibrated band (we run [0.14, 0.30];
   measure your own distribution first — our first band was dead code because
   prose never scored above 0.25) go to a **typed classifier**.
3. **Kev-4B** (LoRA + pointer head, OpenAI-compatible server, ~1s) answers
   structured questions: `use_case` over 7 classes → a routing table pin
   (coding→coder, architecture/trading/research→reason, personal/business→extract).
4. Bounded fallbacks between neighbors; optional cloud escalation for genuinely
   hard prompts (off in cost mode).

Calibration notes from real traffic: trivial asks → 4B end-to-end in ~0.9s;
architecture prose → classified → 27B; personal email asks never touch the 27B.

## Classifier shootout (Jev-style typed routing)

| Model                      | Accuracy                                                  | Latency | RAM  | Verdict                                            |
| -------------------------- | --------------------------------------------------------- | ------- | ---- | -------------------------------------------------- |
| Kev-9B                     | 5/5, p 0.98–1.00                                          | ~800ms  | 18GB | OOM-killed by macOS in a RAM spike                 |
| **Kev-4B**                 | 5/5, p 0.98–1.00                                          | ~1s     | ~8GB | **in production**, launchd-managed                 |
| Laya-MLX 421M (ModernBERT) | 3/5 — personal collapses into "coding" at 0.94 confidence | 9–28ms  | <1GB | rejected: a 40% misroute rate beats any speed gain |
| Laya-multilingual 322M     | 3/5                                                       | 9–28ms  | <1GB | rejected                                           |

`needs_strong`-style questions come back mushy from Kev (0.17–0.44) — use
`use_case` only unless you calibrate that head yourself.

## Benchmarking discipline

Everything measured lands in an append-only JSONL (`benchmarks.jsonl`) with
suite/model/metric/meta, plus a self-contained HTML SVG trend graph. Four
standard prompts (TS coding, web component, architecture trade-offs, Danish
prose), warm, temp 0, fixed max_tokens, auto-logged per run. Over time this is
what tells you whether an engine upgrade actually helped.

## System-level notes (Apple Silicon / Metal)

- `powermode` High Power was already active — check before chasing it.
- MLX can use ~75% of unified RAM as GPU-recommended max; wired-limit raising
  prevents paging stalls on big batches (wire it before long-context serving).
- rapid-mlx evicts UBC for weights at load and sets Metal memory limits
  automatically (`allocation_limit = 90%`, `cache_limit = 20%`).
- **uv tool fragility**: when brew pythons move, uv tool python symlinks die.
  Pin explicitly: `uv tool install --force --python 3.13 mlx-lm` and
  `uv run --python 3.13 …`.
- **launchd gotchas**: `bun` resolves to `~/.local/bin/bun` in some installs
  and vanishes for launchd — use the absolute `/opt/homebrew/bin/bun`;
  LM Studio's `lms` CLI needs the GUI app running once.
- **mlx-community phantom repos**: auto-conversion placeholders exist with
  0–12K of content. Before benchmarking a repo, check the tree size, not the
  name.

## From-scratch setup on a new Mac

```bash
bun setup/llm-stack.ts              # deps + models + smoke bench
bun setup/llm-stack.ts --with-launchd   # also install KeepAlive plists
bun setup/llm-stack.ts --dry-run    # print the commands, run nothing
```

Idempotent, argument-array spawns only, everything under `$HOME`.
