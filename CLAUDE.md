# Global Rules

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
| Need diff preview before replace | `sad` (Rust, shows colored diff before applying) |
| `| while read` loops | Single command + pipe to `jq`/`xargs` |
| `du` for disk usage | `dust` (visual treemap) or `gdu` (interactive TUI) |
| `du -sh` (total only) | `diskus` (fastest) |
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

**Diff-preview replace: use `sad`.** Shows colored diff of every change before applying — `sd` + `git diff` combined. `rg -n 'pattern' --type ts | sad -e 'old' 'new' -k` searches + replaces across all matches in one pipeline. With `-k` it auto-applies; without it shows interactive fzf preview. Ideal for verifying transformations before committing.

**Disk usage: use `dust`.** Replaces iterative `du` + `ls` exploration. `dust` shows instant visual treemap of disk usage. `dust node_modules/` for specific dirs, `dust -n 20` for top 20.

**Code search with context: use `batgrep`.** Combines `rg` search with `bat` syntax highlighting. `batgrep 'pattern' --context 5` shows matches with highlighted surrounding code. Replaces `rg` + separate `Read` calls.

**Diff review: use `difft`, `batdiff`, or `delta`.** `difft main...HEAD` shows structural AST-aware diffs (detects moved/renamed code). `batdiff` for syntax-highlighted line diffs. `delta` as git pager for all git diff output (set-and-forget).

### Benchmarked on this repo (733 TS files, ~2500 total, 10 CPU cores)

| Scenario | Files | Traditional | Modern Tool | Speedup |
|----------|-------|-------------|-------------|---------|
| Literal replace | 47 | `sed -i ''` 1102ms | `sd` 966ms | 1.1x |
| Regex replace | 346 | `sed -E -i ''` 1530ms | `sd -s` 921ms | **1.7x** |
| Codebase-wide rename | 538 | `fd -x sed` 1642ms | `amber` 490ms | **3.3x** |
| Search+replace pipeline | 47 | Claude Read+Edit ~95s | `rg \| sad -k` 67ms | **~1400x** |
| File listing | 733 | `find` 3573ms | `fd` 56ms | **64x** |
| Parallel vs sequential (sd) | 538 | `fd --threads=1 -x sd` ~3269ms | `fd -x sd` ~1109ms | **3x** |
| Best bulk replace | 538 | `fd -x sd` ~1109ms | `amber` ~658ms | **1.7x** |
| File count by type | 733 | `find` 3573ms | `tree -J \| jq` 218ms | **16x** |
| JSON extraction | — | `python3 -c` 56ms | `jq` 31ms | **1.8x** |
| Diff stats | — | `git diff --stat` 64ms | `difft --stat` 37ms | **1.7x** |
| Count occurrences | 346 | Grep+Read+count ~5s | `rg -c \| awk` 54ms | **~90x** |

The key insights:
1. **Claude's Read+Edit does one file at a time with ~0.5-1s tool call overhead.** For multi-file work, use a single pipeline (`rg | sad`, `fd -x sd`, or `ambr`) — **~1400x faster**.
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
| Multiple `git show` for history | `git-standup` or `git log -L :func:file.ts` |
| Manual GitHub Actions testing | `act` (run GH Actions locally) |
| Manual CI YAML validation | `actionlint` (static checker) |

**`gh` is installed.** Use it for all GitHub operations: PRs, issues, releases, actions, reviews.
**`az` is installed.** Use it for all Azure DevOps operations: repos, pipelines, work items.
**`git-standup` is installed.** `git-standup -f "path/file.ts"` for recent activity on a file.
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
RIGHT: rg -n 'old' --type ts | sad -e 'old' 'new' -k      (1 pipeline)
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

### Rule 4: Use git-standup and git log -L for archaeology
When investigating file/function history, avoid multiple git show calls.

```
WRONG: git log file.ts → git show hash1 → git show hash2  (3+ calls)
RIGHT: git-standup -f "path/file.ts"                       (recent activity)
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
| **Preview replace** | `sad` | `sed` + manual diff |
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
| **Python** | `uv` | `pip` / `venv` |
| **HTTP** | `xh` | `curl` |
| **HTTP (multi)** | `hurl` | sequential curl |
| **HTTP (fancy)** | `curlie`, `httpie` | `curl` interactive |
| **Downloads** | `aria2` | `wget` |
| **GitHub** | `gh` | web UI |
| **Azure** | `az` | web UI |
| **GH Actions local** | `act` | push-to-test |
| **CI lint** | `actionlint` | manual YAML review |
| **Shell lint** | `shellcheck` | manual review |
| **Git activity** | `git-standup` | multiple `git show` |
| **Fuzzy find** | `fzf` | manual file picking |
| **Glamour shell** | `gum` | basic shell prompts |
| **Tree view** | `tree` | recursive `ls` |
| **Process monitor** | `btop`, `htop` | `top` |
| **Container TUI** | `lazydocker`, `ctop` | docker CLI |
| **File manager** | `ranger` | GUI file manager |
| **Editor** | `micro` | `nano` |
| **Man pages** | `batman` | `man` |
| **Static server** | `serve` | python/http server |
| **TLS certs** | `mkcert` | manual openssl |
| **API fuzzing** | `schemathesis` | manual API testing |
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

## Available Skills Quick Reference

**Always check this list before starting any task. Invoke the relevant skill FIRST.**

### Filesystem & Code Intelligence

| Skill | When to use |
|-------|-------------|
| `cli-speed-tools` | ANY terminal file operation — listing, searching, reading files |
| `openapi-directory-first` | Working with ANY public API — check openapi-directory before training data or web search |
| `code-simplifier` | Simplifying, refactoring, or cleaning up existing code |
| `find-bugs` | Reviewing changes for bugs, security vulnerabilities, code quality |
| `simplify` | Review changed code for reuse, quality, and efficiency after edits |

### Frontend & UI

| Skill | When to use |
|-------|-------------|
| `frontend-design` | Creating production-grade frontend interfaces |
| `core-components` | Building UI, using design tokens, or working with the component library |
| `lit-dev` | Creating Lit web components with TypeScript |

### Validation & Testing

| Skill | When to use |
|-------|-------------|
| `zod-validation` | Validating API inputs and data with Zod schemas |
| `zod4` | Using Zod 4 schema validation library |
| `testing-patterns` | Writing unit tests, mocking strategies, TDD workflow |
| `superpowers:test-driven-development` | Before implementing ANY feature or bugfix |

### Debugging & Problem Solving

| Skill | When to use |
|-------|-------------|
| `systematic-debugging` / `superpowers:systematic-debugging` | Bugs, test failures, unexpected behavior — four-phase root cause analysis |
| `superpowers:dispatching-parallel-agents` | Facing 2+ independent tasks that can run in parallel |

### Planning & Architecture

| Skill | When to use |
|-------|-------------|
| `superpowers:brainstorming` | BEFORE any creative work — features, building, designing |
| `superpowers:writing-plans` | Have a spec/requirements for a multi-step task |
| `superpowers:executing-plans` | Have a written plan to execute in a worktree |
| `superpowers:subagent-driven-development` | Executing plans with independent tasks in parallel |

### Git & Workflow

| Skill | When to use |
|-------|-------------|
| `commit-commands:commit` | Create a git commit |
| `commit-commands:commit-push-pr` | Commit, push, and open a PR |
| `commit-commands:clean_gone` | Clean up git branches marked as [gone] |
| `superpowers:using-git-worktrees` | Starting feature work that needs isolation |
| `superpowers:finishing-a-development-branch` | Implementation complete, tests pass, ready to finish |

### Code Review & Quality

| Skill | When to use |
|-------|-------------|
| `superpowers:requesting-code-review` | Completed tasks, implemented features, before merging |
| `superpowers:receiving-code-review` | Received code review feedback, before implementing |
| `superpowers:verification-before-completion` | About to claim work is complete/fixed/passing |

### Memory & Documentation

| Skill | When to use |
|-------|-------------|
| `episodic-memory:search-conversations` | Search previous conversations for context |
| `episodic-memory:remembering-conversations` | "How should I..." or "what's the best approach..." questions |
| `project-memory` | Setting up structured project memory |
| `agents-md` | Creating or updating AGENTS.md files |
| `claude-md-management:revise-claude-md` | Update CLAUDE.md with session learnings |
| `claude-md-management:claude-md-improver` | Audit and improve CLAUDE.md files |
| `code-documenter` | Generating technical documentation |

### Config & Setup

| Skill | When to use |
|-------|-------------|
| `update-config` | Modifying settings.json (hooks, permissions, env vars) |
| `settings-audit` | Setting up new project, auditing existing settings |
| `superpowers:writing-skills` | Creating or editing skills |
| `skill-lookup` | Search and install skills from prompts.chat registry |
| `find-skills` | Discover and install agent skills |

### Specialized Tools

| Skill | When to use |
|-------|-------------|
| `playwright-skill` | Browser automation, testing, web interaction |
| `context7` | Fetching current library/framework documentation |
| `supabase-postgres-best-practices` | Postgres queries, schema design, performance |
| `claude-api` | Building with Claude API / Anthropic SDK / Agent SDK |
| `loop` | Running recurring tasks on an interval |
| `superpowers-lab:finding-duplicate-functions` | Auditing codebase for semantic duplication |
| `superpowers-lab:mcp-cli` | Using MCP servers on-demand via CLI |
| `superpowers-lab:using-tmux-for-interactive-commands` | Running interactive CLI tools (vim, git rebase -i) |
