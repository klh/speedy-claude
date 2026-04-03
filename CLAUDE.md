# CLI Speed Tools (always use)

## Filesystem

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
| `du` for disk usage | `dust` (visual treemap, instant) |
| `ps` for processes | `procs` (colored, searchable, tree view) |
| `diff` for comparing files | `difft` (structural AST-aware diff) |
| `git diff` raw output | `difft` or `batdiff` or `delta` (syntax-highlighted) |
| Searching code then reading files | `batgrep` (rg + bat combined, context with highlighting) |
| `cp` for file copy | `xcp` (parallel, 10x faster on NFS) |
| `cd` for directory navigation | `z` via `zoxide` (frecency-based jumping) |
| `cloc` / `wc -l` for code stats | `tokei` (150+ languages, instant) |
| `dig` for DNS | `doggo` (colored, JSON output) |
| `watch` for re-running | `watchexec` (file watcher, reruns on change) |
| Manual git staging/rebase | `lazygit` (interactive TUI) |

**Directory listing patterns (use `tree` instead of recursive ls/find):**
- `tree -J -P "*.ts" --prune | jq '.[].name'` — list only .ts files as JSON, extract names
- `tree -J -P "src" --prune | jq '.[].children[].name'` — list immediate children of src/
- `tree -J -d -L 2 | jq` — directory-only listing, 2 levels deep, as JSON
- `tree -P "*.test.ts" --prune` — find all test files (human-readable)
- `tree --filelimit 20 -L 3` — limit output, skip dirs with 20+ files
- `tree -s -h --du` — show file sizes with human-readable units
- `eza --tree --level=3 --git --icons` — alternative tree with git status + icons

**Parallelism: always use parallel execution.** Most tools auto-parallelize — let them:
- `fd -x` executes in parallel by default (use `--threads=1` only when order matters)
- `rg` auto-threads (0 = all cores); `-j1` forces single-thread only for benchmarking
- `amber` defaults to 10 threads (`--max-threads N` to tune)
- `dust` uses `-T N` threads
- `xargs -P N` for parallel batch (e.g. `fd -0 -e ts | xargs -0 -P8 -I{} cmd {}`)
- **Benchmarked:** `fd -x sd` parallel ~1109ms vs sequential ~3269ms = **3x faster** on 538 files
- **Benchmarked:** `amber` ~658ms vs `fd -x sd` ~1109ms = amber wins for bulk replace
- **Benchmarked:** `fd | wc -l` 56ms vs `find | wc -l` 3573ms = **64x faster**

**NEVER pipe file listings into while/read loops.** One command, one parse pass.

**Single-command shortcuts (avoid multi-step tool chains):**
- Count matches: `rg -c 'pattern' --type ts | awk -F: '{sum+=$2}END{print sum}'` — 1 command
- List files by size: `eza -la --sort=size -I node_modules | rg '\.tsx?$'` — 1 command
- Count files by type: `fd -e ts --exclude node_modules | wc -l` — 56ms
- Read specific lines: `bat --line-range 50:100 --style=numbers file.ts` — 1 command
- Extract JSON field: `jq '.data[].name'` — 31ms (vs `python3 -c` at 56ms)
- Diff stats: `difft main...HEAD --stat` — 38ms
- Find + exec parallel: `fd -e ts -x sd 'old' 'new'` — parallel by default
- Bulk rename with stats: `ambr 'old' 'new' --statistics --no-interactive`

**JSON parsing: prefer `jq` over `python3 -c`.** Python has ~30ms startup overhead. `jq` is native C and parses JSON in <1ms.

**Find/replace: prefer `sd` over `sed`.** macOS ships BSD sed (no `\+`, `-i ''` required, inconsistent regex). `sd` is Rust, literal by default, regex with `-s`, and `-i` just works.

**Codebase-wide replace: prefer `amber` over `find | xargs sd`.** Amber divides large files and searches in parallel. `ambr 'old' 'new'` for interactive, `ambr --regex 'foo(\w+)' 'bar$1'` for capture groups.

**Diff-preview replace: use `sad`.** `rg -n 'pattern' --type ts | sad -e 'old' 'new' -k` searches + replaces with diff preview. `-k` auto-applies; without it shows interactive fzf preview.

**Disk usage: use `dust`.** `dust` shows instant visual treemap. `dust node_modules/` for specific dirs, `dust -n 20` for top 20.

**Code search with context: use `batgrep`.** `batgrep 'pattern' --context 5` shows matches with highlighted surrounding code. Replaces `rg` + separate `Read` calls.

**Diff review: use `difft`, `batdiff`, or `delta`.** `difft main...HEAD` shows structural AST-aware diffs (detects moved code). `batdiff` for syntax-highlighted line diffs. `delta` as git pager for all git diff output (set-and-forget).

### Benchmarked on real codebase (733 TS files, ~2500 total, 10 cores)

| Scenario | Files | Traditional | Modern Tool | Speedup |
|----------|-------|-------------|-------------|---------|
| Literal replace | 47 | `sed -i ''` 1102ms | `sd` 966ms | 1.1x |
| Regex replace | 346 | `sed -E -i ''` 1530ms | `sd -s` 921ms | **1.7x** |
| Codebase-wide rename | 538 | `fd -x sed` 1642ms | `amber` 490ms | **3.3x** |
| Search+replace pipeline | 47 | Claude Read+Edit ~95s | `rg \| sad -k` 67ms | **~1400x** |
| File listing | 733 | `find` 3573ms | `fd` 56ms | **64x** |
| Parallel vs sequential | 538 | `fd --threads=1` 3269ms | `fd -x` parallel 1109ms | **3x** |
| Best bulk replace | 538 | `fd -x sd` 1109ms | `amber` ~658ms | **1.7x** |
| JSON extraction | — | `python3 -c` 56ms | `jq` 31ms | **1.8x** |
| Count occurrences | 346 | Grep+Read+count ~5s | `rg -c \| awk` 54ms | **~90x** |

The key insight: **Claude's Read+Edit does one file at a time with ~0.5-1s tool call overhead.** For multi-file work, use a single pipeline — **~1400x faster.**

### HTTP / API calls

| Avoid | Use |
|-------|-----|
| `curl` for API exploration | `xh` (Rust, HTTPie syntax, auto JSON) |
| `curl \| python3 -c` for JSON | `xh` (pretty-prints by default) or `curl \| jq` |
| `curl -X POST -H "Content-Type: application/json" -d` | `xh post url key=value key:=true` |
| `wget` for downloads | `aria2` (multi-source, parallel segments) |
| Multi-step API testing | `hurl` (chain requests with assertions) |

**xh syntax:** `xh [METHOD] URL [key=value] [key:=json]` — no flags needed for JSON bodies.

### Git & DevOps

| Avoid | Use |
|-------|-----|
| GitHub web UI for PRs/issues | `gh` CLI |
| Azure DevOps web UI | `az` CLI |
| Raw `git diff` output | `difft main...HEAD` or `delta` pager |
| Multiple `git show` for history | `git-standup` or `git log -L :func:file.ts` |
| Manual GitHub Actions testing | `act` (run locally) |
| Manual CI YAML validation | `actionlint` |

## Workflow Optimization Rules

### Rule 1: Never Read+Edit in a loop for multi-file changes
```
WRONG: Grep → Read file1 → Edit file1 → Read file2 → Edit file2 → ... (N×2 tool calls)
RIGHT: ambr 'old' 'new'                                    (1 command)
RIGHT: fd -e ts | xargs sd 'old' 'new'                     (1 command)
RIGHT: rg -n 'old' --type ts | sad -e 'old' 'new' -k      (1 pipeline)
```

### Rule 2: Use structural diffs for all code review
```
WRONG: git diff main → Read changed files for context      (multiple calls)
RIGHT: difft main...HEAD                                   (1 command, AST-aware)
RIGHT: gh pr diff 1234 | difft                             (PR review)
```

### Rule 3: Search with context, not search then read
```
WRONG: rg 'myFunc' → Read each result file                 (N+1 calls)
RIGHT: batgrep 'myFunc' --context 5                        (1 command, highlighted)
RIGHT: rg -n 'myFunc' | fzf --preview 'bat --highlight-line {2} {1}'
```

### Rule 4: Use git-standup and git log -L for archaeology
```
WRONG: git log file.ts → git show hash1 → git show hash2  (3+ calls)
RIGHT: git-standup -f "path/file.ts"                       (recent activity)
RIGHT: git log -L :myFunc:path/file.ts -p | difft          (function history)
```

### Rule 5: Static analysis before manual review
```
WRONG: Read each file → reason about bugs                  (slow, error-prone)
RIGHT: shellcheck changed.sh                                (instant)
RIGHT: actionlint .github/workflows/*.yml                   (instant)
RIGHT: git diff --name-only main | rg '\.sh$' | xargs shellcheck
```

### Rule 6: Use xh for all HTTP, hurl for multi-step
```
WRONG: curl -X POST -H "Content-Type: application/json" -d '{"name":"Klaus"}'
RIGHT: xh post api.example.com name=Klaus                  (auto JSON)
RIGHT: hurl --variable token=$TOKEN scenario.hurl           (multi-request)
```

### Rule 7: Use dust for all disk/space questions
```
WRONG: ls → du → cd subdir → ls → du                       (iterative)
RIGHT: dust                                                  (instant treemap)
RIGHT: fd --type f --size +100m                             (find large files)
```

### Rule 8: Always use parallel execution
- `fd -x` runs in parallel by default (3x faster than `--threads=1`)
- `rg` auto-threads; `-j1` forces single-thread
- `amber` defaults to 10 threads
- `xargs -P8` for parallel batch processing
- **Benchmarked:** parallel ~1109ms vs sequential ~3269ms for 538 files

### Rule 9: Single-command patterns over multi-step chains
- `rg -c 'pattern' --type ts | awk -F: '{sum+=$2}END{print sum}'` — count in 54ms vs ~5s
- `tree -J -P "*.ts" --prune | jq '.[].name'` — list files in 218ms vs find 3573ms
- `bat --line-range 50:100 file.ts` — read range in 47ms
- `jq '.data[].name'` — extract field in 31ms vs python3 -c at 56ms
- `difft main...HEAD --stat` — diff stats in 37ms
- `eza -la --sort=size | rg '\.tsx?$'` — list TS by size in 40ms
- `fd --type f --size +100m` — find large files in 1 pass
