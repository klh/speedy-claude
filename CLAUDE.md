# Global Rules

## Operating Style (applies to every response)

- Think before acting; read existing files before writing code. No redundant re-reads.
- Act autonomously on reversible steps; ask only before publishing, deleting, or other irreversible/outward-facing actions.
- One focused implementation pass — avoid write-delete-rewrite cycles.
- Verify with real command output before claiming anything works. Evidence before assertions.
- Concise output, thorough reasoning. No sycophancy, no filler. If unsure, say so; never invent file paths.
- Parked skills live in `~/.claude/skills-available/` (see its README to restore).
- Third-party skills/plugins/MCP servers are prompt+code injectors: ALWAYS run the `skill-security-review` skill on the exact source ref before installing — the install gate denies unmarked installs; append `--security-reviewed` only after a PASS verdict.

## File Editing Rules (enforced by hooks)

- **Never create or modify files via shell.** No `cat > f <<'EOF'`, `cat >> f`, `echo/printf > f`, `sed -i`, `perl -i`, or inline `python3 - <<EOF` rewriters. `edit-enforce.sh` denies these; they bypass context anchoring, diffing, and syntax checks.
- Use **Edit** for surgical changes (requires a unique context anchor — ambiguity fails loudly instead of corrupting) and **Write** for new/whole files. Both are prompt-free under `acceptEdits` and syntax-checked on save by `syntax-check.sh` (per-type gates: jq json · yq yaml · taplo toml · ruff py · bash -n sh · esbuild parse-gate ts/js 6.8ms + project-tsc tier-2).
- Bulk mechanical replaces: `sd` / `ambr` (fast, blessed). Identifier/structure-shaped changes: `ast-grep`. Semantic multi-file changes: Edit per file.
- Capturing **command output** to a file (`xh ... > resp.json`) is fine; generating file *content* through the shell is not.
- After any structural edit, fix syntax errors reported by the PostToolUse check before moving on.
- **Verify every 3rd edit** to the same file: run/build/test it then, not after the 5th (observed failure mode: five blind edits, then the first run crashes).
- **>5 planned changes to one file** = re-read once and do a single whole-file Write, not 3 Reads + 7 Edits of churn.
- **Automation architecture (doctrine):** glue logic in TypeScript run by Bun (`bun hooks/x.ts`) — typed, testable, real parsers (e.g. shell-quote AST for command analysis, NEVER regex against shell text). Heavy operations go to native CLI tools launched with ARGUMENT ARRAYS (no shell re-parsing, no quoting bugs), batched — one rg over 10k files, not 10k launches. Rust only when profiling proves a bottleneck. Plain bash remains for trivial one-liners only.
- Markdown is auto-formatted on every save (`md-format.sh` → prettier, GFM, prose preserved). Do not hand-align tables — write them loosely and let the formatter tidy; re-read after bulk writes.

## Structural Editing & Linting

| Job | Tool | Pattern |
|-----|------|---------|
| AST-aware find/replace (won't touch strings/comments) | `ast-grep` | `ast-grep run -p 'oldCall($A)' -r 'newCall($A)' --lang ts` (dry-run by default, `-U` applies; `sg` alias) |
| Goto linter — full dev loop checks | `qlty` | `qlty check` (diff-aware: branch changes only) · `qlty check --all` · `qlty fmt` · first time in a repo: `qlty init -y && qlty plugins enable biome prettier` |
| YAML/TOML/XML structured edits | `yq` | `yq -i '.a.b = "x"' file.yaml` (like jq, for config) |
| Fast JS/TS lint+format inside configured projects | `biome` | project-level tool; qlty orchestrates it otherwise |

Textual bulk replaces stay with `sd`/`ambr`; `ast-grep` for anything identifier/structure-shaped.

## Multi-agent Workflows

- Say **`ultracode <task>`** or **"use a workflow"** to fan out an orchestrated multi-agent run (deterministic script coordinating many subagents: parallel review dimensions, verify passes, bulk migrations, research fan-outs).
- Default workflow size: medium (~≤15 agents). Results return as a single aggregated report.

## MCP Tool Selection

| Need | Use |
|------|-----|
| Browser testing / DOM / console / network | `chrome-devtools` MCP (`npm i -g chrome-devtools-mcp` → `claude mcp add`) |
| Current library/API docs (avoid stale training data) | `context7` MCP (`claude mcp add -t http context7 https://mcp.context7.com/mcp`) |
| Screenshot OCR, image/diagram/chart analysis | vision MCP of your provider |
| GitHub repo reading | `gh` CLI first |
| Web search / page fetch | built-in WebSearch/WebFetch |
| Jira / Confluence | `atlassian` plugin |

## Hybrid LLM Routing Doctrine (measured 2026-09-04, M5 Max 128GB)

| Decision point                        | Route                              | Why (measured)                    |
| ------------------------------------- | ---------------------------------- | --------------------------------- |
| Short task, <50 output tokens         | LOCAL :8902 (non-thinking 4B)      | TTFT 138ms vs 400ms remote = 2.4x |
| Code generation (warm)                | LOCAL :8901 (32B coder)            | 311ms vs 485ms remote = 1.6x      |
| Deep reasoning, analysis              | LOCAL :8903 (Claude-distilled 27B) | Free, near-Claude quality         |
| >32k context                          | REMOTE (z.ai)                      | Local RAM-limited                 |
| Frontier quality, production-critical | REMOTE (z.ai glm-5.3)              | Better reasoning                  |
| Danish/multilingual                   | LOCAL Qwen3.5 (201 langs)          | Specialist advantage              |

Rules:

1. **Default to local** — it is free and 2.4x faster. Only go remote when context or quality demands it.
2. **Cold start penalty** (~800ms first hit) — keep specialists resident via launchd KeepAlive.
3. **The router is deterministic** (keyword-based, 0ms) — no LLM overhead for routing decisions.
4. **Always check claude-fast first** — it falls back to remote automatically if the local stack is down.
5. **Model selection is task-shaped**: code to coder, menial to non-thinking, reasoning to Claude-distilled.

## CLI Speed Tools (always use)

### Filesystem

| Avoid | Use |
|-------|-----|
| `ls`, `ls -la` | `eza -la` |
| `grep -r` | `rg` |
| `find` | `fd` |
| `cat` | `bat` |
| `find` + pipe loops | `tree` or `eza --tree` |
| Parsing file listings manually | `tree -J -P "pattern" --prune \| jq` |
| `python3 -c` for JSON parsing | `jq` (native C, ~6x faster than Python startup) |
| `sed` for find/replace | `sd` (Rust, literal by default, regex with `-s`, no BSD `-i ''` tax) |
| `find \| xargs sed` across codebase | `amber` (parallel Rust, interactive per-match, ignores .git) |
| Need stats on a bulk replace | `ambr --statistics --no-interactive` (per-file counts + timing) |
| `| while read` loops | Single command + pipe to `jq`/`xargs` |
| `du` for disk usage | `dust` (visual treemap) or `gdu` (interactive TUI) |
| `du -sh` (total only) | `dust -d 1` |
| `ps` for processes | `procs` (colored, searchable) or `btm` (graphs) |
| `diff` for comparing files | `difft` (structural AST-aware diff) |
| `git diff` raw output | `difft` or `batdiff` or `delta` (syntax-highlighted) |
| Searching code then reading files | `batgrep` (rg + bat combined, context with highlighting) |
| `cp` for file copy | `xcp` (parallel, 10x faster on NFS) |
| `cd` for directory navigation | `z` via `zoxide` (frecency-based jumping) |
| `cloc` / `wc -l` for code stats | `tokei` (150+ languages, instant) |
| `dig` for DNS | `doggo` (colored, JSON output) |
| `watch` for re-running | `watchexec` (file watcher, reruns on change) |
| Manual git staging/rebase | `lazygit` (interactive TUI) |

**Filtering patterns:**
- `tree -J -P "pattern" --prune | jq` — `-J` for JSON output, `-P --prune` filters at filesystem level, pipe to `jq` to extract. **Always use `-J` or jq gets text, not JSON.**
- `tree -J | jq` — one pass, native C parse, no Python overhead
- `fd` + `xargs` — parallel batch, one process per match (not per file in a loop)

**Directory listing patterns (use `tree` instead of recursive ls/find):**
- `tree -J -P "*.ts" --prune | jq '.[].name'` — list only .ts files as JSON, extract names
- `tree -J -P "src" --prune | jq '.[].children[].name'` — list immediate children of src/
- `tree -J -d -L 2 | jq` — directory-only listing, 2 levels deep, as JSON
- `tree -P "*.test.ts" --prune` — find all test files (human-readable)
- `tree --filelimit 20 -L 3` — limit output, skip dirs with 20+ files
- `tree -J -P "*.tsx" --prune | jq '[.[].content[]?.name]'` — extract specific file names from JSON
- `tree -s -h --du` — show file sizes with human-readable units
- `eza --tree --level=3 --git --icons` — alternative tree with git status + icons
- `eza -la --sort=size --reverse | head -20` — largest files in current dir

**Parallelism: always use parallel execution.** This machine has 10 CPU cores. Most tools auto-parallelize — let them:
- `fd -x` executes in parallel by default (use `--threads=1` only when order matters)
- `rg` auto-threads (0 = all cores); `-j1` forces single-thread only for benchmarking
- `amber` defaults to 10 threads (`--max-threads N` to tune)
- `dust` uses `-T N` threads
- `xargs -P N` for parallel batch (e.g. `fd -0 -e ts | xargs -0 -P8 -I{} cmd {}`)
- **Benchmarked:** `fd -x sd` parallel ~1109ms vs sequential ~3269ms = **3x faster** on 538 files
- **Benchmarked:** `amber` ~658ms vs `fd -x sd` ~1109ms = amber wins for bulk replace
- **Benchmarked:** `fd | wc -l` 56ms vs `find | wc -l` 3573ms = **64x faster**

**NEVER pipe file listings into while/read loops.** One command, one parse pass. If you're writing `| while read` or spawning a process per file, stop and find the single-command equivalent.

**Single-command shortcuts (avoid multi-step tool chains):**
- Count matches: `rg -c 'pattern' --type ts | awk -F: '{sum+=$2}END{print sum}'` — 1 command instead of Grep + Read + count
- List files by size: `eza -la --sort=size -I node_modules | rg '\.tsx?$'` — 1 command instead of find + ls + sort
- Count files by type: `fd -e ts --exclude node_modules | wc -l` — 56ms (vs `find` at 3573ms)
- Read specific lines: `bat --line-range 50:100 --style=numbers file.ts` — 1 command instead of Read + extract
- Extract JSON field: `jq '.data[].name'` — 31ms (vs `python3 -c` at 56ms)
- Diff stats: `difft main...HEAD --stat` — 38ms (vs `git diff` + Read context)
- Find + exec parallel: `fd -e ts -x sd 'old' 'new'` — parallel by default
- Find + exec sequential: `fd -e ts --threads=1 -x sd 'old' 'new'` — when order matters
- Bulk rename with stats: `ambr 'old' 'new' --statistics --no-interactive` — shows timing info

**JSON parsing: prefer `jq` over `python3 -c`.** Python has ~30ms startup overhead. `jq` is native C and parses JSON in <1ms. Only use Python when you need logic beyond what jq can express.

**Find/replace: prefer `sd` over `sed`.** macOS ships BSD sed (no `\+`, `-i ''` required, inconsistent regex). `sd` is Rust, literal by default, regex with `-s`, and `-i` just works. `sd 'old' 'new' file.txt` for simple replace, `sd -s '(\w+)\s(\w+)' '$2 $1' file.txt` for regex.

**Codebase-wide replace: prefer `amber` over `find | xargs sd`.** Amber divides large files and searches in parallel — faster at scale. `ambr 'old' 'new'` for interactive whole-codebase replace, `ambr --regex 'foo(\w+)' 'bar$1'` for capture groups. Ignores `.git` by default.

**Bulk replace with stats: use `ambr`.** `ambr 'old' 'new' --statistics --no-interactive` shows per-file counts and timing — check the blast radius before committing. `fd -x sd` is the scripted equivalent.

**Disk usage: use `dust`.** Replaces iterative `du` + `ls` exploration. `dust` shows instant visual treemap of disk usage. `dust node_modules/` for specific dirs, `dust -n 20` for top 20.

**Code search with context: use `batgrep`.** Combines `rg` search with `bat` syntax highlighting. `batgrep 'pattern' --context 5` shows matches with highlighted surrounding code. Replaces `rg` + separate `Read` calls.

**Diff review: use `difft`, `batdiff`, or `delta`.** `difft main...HEAD` shows structural AST-aware diffs (detects moved/renamed code). `batdiff` for syntax-highlighted line diffs. `delta` as git pager for all git diff output (set-and-forget).

### Benchmarked on this repo (733 TS files, ~2500 total, 10 CPU cores)

| Scenario | Files | Traditional | Modern Tool | Speedup |
|----------|-------|-------------|-------------|---------|
| Literal replace | 47 | `sed -i ''` 1102ms | `sd` 966ms | 1.1x |
| Regex replace | 346 | `sed -E -i ''` 1530ms | `sd -s` 921ms | **1.7x** |
| Codebase-wide rename | 538 | `fd -x sed` 1642ms | `amber` 490ms | **3.3x** |
| Search+replace pipeline | 47 | Claude Read+Edit ~95s | `rg -l -0 --type ts \| xargs -0 -P8 sd` sub-second | **~100x** |
| File listing | 733 | `find` 3573ms | `fd` 56ms | **64x** |
| Parallel vs sequential (sd) | 538 | `fd --threads=1 -x sd` ~3269ms | `fd -x sd` ~1109ms | **3x** |
| Best bulk replace | 538 | `fd -x sd` ~1109ms | `amber` ~658ms | **1.7x** |
| File count by type | 733 | `find` 3573ms | `tree -J \| jq` 218ms | **16x** |
| JSON extraction | — | `python3 -c` 56ms | `jq` 31ms | **1.8x** |
| Diff stats | — | `git diff --stat` 64ms | `difft --stat` 37ms | **1.7x** |
| Count occurrences | 346 | Grep+Read+count ~5s | `rg -c \| awk` 54ms | **~90x** |

The key insights:
1. **Claude's Read+Edit does one file at a time with ~0.5-1s tool call overhead.** For multi-file work, use a single pipeline (`rg | xargs sd`, `fd -x sd`, or `ambr`) — **100-1100x faster**.
2. **Parallelism matters.** `fd -x` runs in parallel by default. Sequential (`--threads=1`) is **3x slower** on this machine.
3. **amber wins for bulk replace.** Parallel file splitting + 10 threads = fastest codebase-wide rename.
4. **Single-command patterns** replace multi-step tool chains. `rg -c | awk` replaces Grep + Read + count. `difft --stat` replaces `git diff` + Read context files.

### HTTP / API calls

| Avoid | Use |
|-------|-----|
| `curl` for API exploration | `xh` (Rust, HTTPie syntax, auto JSON) |
| `curl \| python3 -c` for JSON responses | `xh` (pretty-prints JSON by default) or `curl \| jq` |
| `curl -X POST -H "Content-Type: application/json" -d` | `xh post url key=value key:=true` |
| `wget` for downloads | `aria2` (multi-source, parallel segments) |
| Need to debug a request | `xh --offline` (show without sending) or `xh --curl` (export curl equivalent) |
| Multi-step API testing | `hurl` (chain requests with assertions) |

**xh syntax:** `xh [METHOD] URL [key=value] [key:=json]` — no flags needed for JSON bodies.
- `xh get api.example.com/users` — GET with pretty output
- `xh post api.example.com/data name=Klaus active:=true` — auto JSON body
- `xh --curl get api.example.com` — export as curl command
- `xh --offline post api.example.com name=test` — debug without sending

**hurl for multi-request testing:** Write `.hurl` files with chained requests and assertions. `hurl --variable token=$TOKEN scenario.hurl`. Replaces manual sequential curl calls.

### Git & DevOps

| Avoid | Use |
|-------|-----|
| GitHub web UI for PRs/issues | `gh` CLI (`gh pr create`, `gh issue list`, etc.) |
| Azure DevOps web UI | `az` CLI (`az repos`, `az pipelines`, etc.) |
| Manual branch cleanup | `commit-commands:clean_gone` skill |
| Raw `git diff` output | `difft main...HEAD` or `batdiff` |
| Multiple `git show` for history | `git log --since="1 day ago" --oneline` or `git log -L :func:file.ts` |
| Manual GitHub Actions testing | `act` (run GH Actions locally) |
| Manual CI YAML validation | `actionlint` (static checker) |

**`gh` is installed.** Use it for all GitHub operations: PRs, issues, releases, actions, reviews.
**`az` is installed.** Use it for all Azure DevOps operations: repos, pipelines, work items.
**Git archaeology:** `git log --since="1 day ago" --oneline` for recent activity; `git log -L :func:file.ts -p | difft` for function history.
**`act` is installed.** `act -j lint --dryrun` to test GitHub Actions locally.
**`actionlint` is installed.** `fd '\.yml$' .github/workflows | xargs actionlint` to validate CI.

### CLI Aliases

`l` (eza -la), `ltree` (eza tree), `sf` (fzf file picker), `sgr` (ripgrep+fzf), `fk` (fzf process killer)

## Workflow Optimization Rules

### Rule 1: Never Read+Edit in a loop for multi-file changes
When a change affects 2+ files, use a single CLI pipeline instead of sequential Read+Edit calls.

```
WRONG: Grep → Read file1 → Edit file1 → Read file2 → Edit file2 → ... (N×2 tool calls)
RIGHT: ambr 'old' 'new'                                    (1 command)
RIGHT: fd -e ts | xargs sd 'old' 'new'                     (1 command)
RIGHT: rg -l -0 'old' --type ts | xargs -0 sd 'old' 'new'    (1 pipeline)
```

### Rule 2: Use structural diffs for all code review
When reviewing changes (PR, branch diff, commit), use `difft` for structural comparison.

```
WRONG: git diff main → Read changed files for context      (multiple calls)
RIGHT: difft main...HEAD                                   (1 command, AST-aware)
RIGHT: gh pr diff 1234 | difft                             (PR review)
RIGHT: git diff --name-only main | fzf --preview 'difft main...HEAD -- {}'
```

### Rule 3: Search with context, not search then read
When finding code, get context in the search result instead of a separate Read.

```
WRONG: rg 'myFunc' → Read each result file                 (N+1 calls)
RIGHT: batgrep 'myFunc' --context 5                        (1 command, highlighted)
RIGHT: rg -n 'myFunc' | fzf --preview 'bat --highlight-line {2} {1}'
```

### Rule 4: Use git log --since and -L for archaeology
When investigating file/function history, avoid multiple git show calls.

```
WRONG: git log file.ts → git show hash1 → git show hash2  (3+ calls)
RIGHT: git log --since="1 day ago" --oneline               (recent activity)
RIGHT: git log -L :myFunc:path/file.ts -p | difft          (function history)
```

### Rule 5: Static analysis before manual review
When checking for bugs, run linters first to catch obvious issues instantly.

```
WRONG: Read each file → reason about bugs                  (slow, error-prone)
RIGHT: shellcheck changed.sh                                (instant)
RIGHT: actionlint .github/workflows/*.yml                   (instant)
RIGHT: git diff --name-only main | rg '\.sh$' | xargs shellcheck
```

### Rule 6: Use xh for all HTTP, hurl for multi-step
Never use curl with manual header/JSON wrangling.

```
WRONG: curl -X POST -H "Content-Type: application/json" -d '{"name":"Klaus"}'
RIGHT: xh post api.example.com name=Klaus                  (auto JSON)
RIGHT: hurl --variable token=$TOKEN scenario.hurl           (multi-request)
```

### Rule 7: Use dust for all disk/space questions
Never iterate with du + ls.

```
WRONG: ls → du → cd subdir → ls → du                       (iterative)
RIGHT: dust                                                  (instant treemap)
RIGHT: fd --type f --size +100m                             (find large files)
```

### Rule 8: Structural edits beat textual for identifier-shaped changes
When renaming functions/args or reshaping calls, `ast-grep` matches AST nodes — string literals and comments stay untouched.

```
WRONG: ambr 'getForeignKeys' 'foreignKeysFor'            (also rewrites strings & comments)
RIGHT: ast-grep run -p 'getForeignKeys($ID)' -r 'foreignKeysFor($ID)' --lang ts -U
```

### Rule 9: Full dev loop — verify before claiming done
After implementing: run tests → `qlty check` (diff-aware) → `difft` review of the change. Never report success on unverified code; PostToolUse syntax checks must be clean first.

```
RIGHT: npm test && qlty check && difft main...HEAD
```

## Complete Tool Inventory

### Installed & Ready

| Category | Tool | Replaces |
|----------|------|----------|
| **Listing** | `eza` | `ls` |
| **Finding** | `fd` | `find` |
| **Searching** | `rg` (ripgrep) | `grep` |
| **Reading** | `bat` | `cat` |
| **Search+context** | `batgrep` | `rg` + `Read` |
| **Find/replace** | `sd` | `sed` |
| **Bulk replace** | `ambr`/`ambs` (amber) | `find \| xargs sed` |
| **Bulk replace stats** | `ambr --statistics` | blind bulk replaces |
| **Structural replace** | `ast-grep` (`sg`) | regex renames that must ignore strings & comments |
| **Universal linter** | `qlty` | 68 linters, one diff-aware command |
| **JS/TS lint+fmt** | `biome` | eslint+prettier in one Rust binary |
| **YAML/TOML/XML** | `yq` | `jq` for config files |
| **File copy** | `xcp` | `cp` (10x faster on NFS) |
| **Structural diff** | `difft` (difftastic) | `diff` |
| **Syntax diff** | `batdiff`, `delta` | `git diff` |
| **Disk usage** | `dust` | `du` |
| **Interactive disk** | `lazygit` | git TUI (staging, rebase, cherry-pick) |
| **Dir navigation** | `zoxide` (`z`) | `cd` (frecency-based jumping) |
| **Code stats** | `tokei` | `cloc` / `wc -l` (150+ languages, instant) |
| **Process viewer** | `procs`, `btm` (bottom) | `ps`, `htop` |
| **DNS lookup** | `doggo` | `dig` (colored, JSON output) |
| **System monitor** | `btm` (bottom) | `htop` (cross-platform graphs) |
| **Git TUI** | `lazygit` | git CLI (interactive staging, rebasing) |
| **Interactive tree** | `broot` | `tree` + `cd` + `find` combined |
| **File watcher** | `watchexec`, `fswatch` | `watch` (smarter rerun on change) |
| **Benchmarking** | `hyperfine` | manual `time` (statistical analysis) |
| **JSON** | `jq` | `python3 -c` |
| **Python** | `uv` | `pip` / `venv` (10-100x faster) |
| **HTTP** | `xh` | `curl` |
| **HTTP (multi)** | `hurl` | sequential curl |
| **HTTP (fancy)** | `httpie` | `curl` interactive |
| **Downloads** | `aria2` | `wget` |
| **GitHub** | `gh` | web UI |
| **Azure** | `az` | web UI |
| **GH Actions local** | `act` | push-to-test |
| **CI lint** | `actionlint` | manual YAML review |
| **Shell lint** | `shellcheck` | manual review |
| **Git activity** | `git log --since` aliases | multiple `git show` |
| **Fuzzy find** | `fzf` | manual file picking |
| **Glamour shell** | `gum` | basic shell prompts |
| **Tree view** | `tree` | recursive `ls` |
| **Process monitor** | `btop` | `top` |
| **Container TUI** | `lazydocker` | docker CLI |
| **File manager** | `ranger` | GUI file manager |
| **Editor** | `micro` | `nano` |
| **Man pages** | `batman` | `man` |
| **Static server** | `serve` | python/http server |
| **TLS certs** | `mkcert` | manual openssl |
| **Terraform** | `terraform` | — |
| **Protobuf** | `protoc` | — |
| **OCR** | `tesseract` | — |
| **Docs** | `pandoc` | — |
| **Media** | `ffmpeg` | — |
| **AI local** | `ollama` | cloud LLM only |
| **AI terminal** | `shell-gpt` (pipx) | — |
| **Load testing** | `k6` | manual benchmarks |
| **Network** | `nmap`, `masscan` | — |
| **Tunnels** | `cloudflared`, `ngrok` | — |
| **Binary analysis** | `radare2` | — |
| **GNU coreutils** | 186 `g*` tools | BSD equivalents |


## Code Style Preferences

- **Modular, DRY** — within sanity, not extremist. Extract a shared helper on the second duplicate, not the first; stop abstracting when it hurts readability.
- **Event mediator / composition over inheritance.** Prefer emitting/subscribing to events (Lit events, EventTarget, pub-sub) over base-class extension chains.
- **Close to the metal over abstraction.** Lit / native web components over React-class frameworks; platform APIs over wrappers; fewer layers between code and the runtime.
- **React/Vue are maintenance-only.** Existing React repos (e.g. tredebanken-v2) get idiomatic React work — follow their patterns, no rewrites. NEVER introduce React/Vue-class frameworks to greenfield or to repos that do not already use them; new UI defaults to Lit/native web components.
- Prefer boring, inspectable code. One obvious way through a module; explicit data flow; no magic.

## Available Skills Quick Reference

36 active skills (klh-* variants + registry adds; optional ones parked in `skills-available/`). Check this list when a task matches; invoke the skill before starting.

### Editing & Code Intelligence

| Skill | When to use |
|-------|-------------|
| `klh-cli-speed-tools` | ANY terminal file operation — listing, searching, reading files |
| `klh-code-simplifier` | Simplifying, refactoring, or cleaning up existing code |
| `klh-find-bugs` | Reviewing changes for bugs, security vulnerabilities, code quality |
| `ast-grep` | Writing ast-grep rules for structural code search/rewrite beyond text search |
| `docker` | ANY container work — Dockerfile/compose authoring, debugging, networking, Buildx |
| `az` | Azure CLI auth checks, subscription context, resource/deployment lookups |
| `sqlite` | SQLite queries (read-only safe scripts), backups, health checks, diffing |
| `zsh` | Reading/debugging/editing zsh config or scripts — setopt, globbing, ZLE, compinit |
| `md-format` | Markdown conventions — GFM-first; formatting is automatic via hook |
| `sql-best-practice` | Idiomatic SQL review, schema work, query tuning |
| `csharp-best-practice` | Idiomatic C# review — conventions, structure, testing, tooling (.NET repos) |
| `klh-openapi-directory-first` | Working with ANY public API — check openapi-directory before training data or web search |

### Frontend & UI

| Skill | When to use |
|-------|-------------|
| `klh-core-components` | Building UI, using design tokens, or working with the component library |
| `klh-lit-dev` | Creating Lit web components with TypeScript |
| `browser-testing-with-devtools` | Browser testing, DOM/console/network inspection via Chrome DevTools MCP |

### Validation & Testing

| Skill | When to use |
|-------|-------------|
| `klh-zod-validation` | Zod runtime validation + deriving JSON Schema/OpenAPI/Postman contracts from zod schemas |
| `zod4` | Using Zod 4 schema validation library |
| `test-driven-development` | Before implementing ANY feature or bugfix |

### Debugging & Planning

| Skill | When to use |
|-------|-------------|
| `klh-systematic-debugging` | Bugs, test failures, unexpected behavior — root cause before any fix |
| `spec-driven-development` | Starting a new project/feature with no specification |
| `context-engineering` | Setting up or repairing agent context/rules files for a project |

### Docs & Setup

| Skill | When to use |
|-------|-------------|
| `klh-agents-md` | Creating/maintaining AGENTS.md / CLAUDE.md agent docs |
| `klh-project-memory` | Setting up structured project memory in docs/project_notes/ |
| `klh-settings-audit` | Auditing/generating a project's Claude Code settings.json permissions |
| `skill-lookup` | Search and install skills from the prompts.chat registry |
| `skill-security-review` | Mandatory security audit BEFORE installing any third-party skill, plugin, or MCP server |
| `find-skills` | Discover and install agent skills |
| `git-workflow-and-versioning` | Committing, branching, organizing parallel work streams |

### Local additions (installed beyond the speedy-claude repo)

| Skill | When to use |
|-------|-------------|
| `klh-dispatch` | Single entry-point orchestrator routing tasks to the right klh-* skill |
| `klh-testing-patterns` | Jest factories, mocking strategies, TDD workflow |
| `brainstorming` | Before creative work — explores intent/requirements/design |
| `writing-plans` | Have requirements for a multi-step task, before touching code |
| `verification-before-completion` | Before claiming work is done/committed — evidence before assertions |
| `requesting-code-review` | Completing tasks or major features, before merge |
| `receiving-code-review` | Processing review feedback with technical rigor |
| `dinero-regnskab` | Visma Dinero bookkeeping automation (browser) |
