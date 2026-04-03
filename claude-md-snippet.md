# CLI Speed Tools (always use)

## Rule 1: Never Read+Edit in a loop for multi-file changes
When a change affects 2+ files, use a single CLI pipeline instead of sequential Read+Edit calls.
- `ambr 'old' 'new'` — interactive whole-codebase replace (parallel)
- `fd -e ts | xargs sd 'old' 'new'` — targeted by file type
- `rg -n 'old' --type ts | sad -e 'old' 'new' -k` — search+replace pipeline with diff preview

## Rule 2: Search with context, not search then read
Use `batgrep` or `rg -n` with context to get surrounding code in the search result, eliminating separate Read calls.
- `batgrep 'myFunc' --context 5` — search with syntax-highlighted context
- `rg -n 'myFunc' -C 3 --type ts` — 3 lines of context around each match

## Rule 3: Use structural diffs for all code review
Use `difft` for structural AST-aware comparison instead of raw `git diff`.
- `difft main...HEAD` — branch diff that detects moved/renamed code
- `gh pr diff 1234 | difft` — PR review

## Rule 4: Use single-command patterns over multi-step chains
- Count matches: `rg -c 'pattern' --type ts | awk -F: '{sum+=$2}END{print sum}'`
- Find files: `fd -e ts | wc -l` (64x faster than `find`)
- Disk usage: `dust` (visual treemap, instant)
- Code stats: `tokei` (150+ languages, instant)
- JSON: `jq '.field'` (not `python3 -c`)
- Read line range: `bat --line-range 50:100 file.ts`
- HTTP: `xh get api.example.com/users` (not `curl`)
- Processes: `procs` (not `ps aux | grep`)

## Rule 5: Always use parallel execution
- `fd -x` runs in parallel by default (3x faster than `--threads=1` on 10 cores)
- `ambr` uses 10 threads by default for bulk rename
- `xargs -P8` for parallel batch when fd -x isn't suitable
- NEVER pipe file listings into `| while read` loops

## Rule 6: Static analysis before manual review
- `shellcheck` for shell scripts
- `actionlint` for GitHub Actions YAML
- Pipe changed files: `git diff --name-only main | rg '\.sh$' | xargs shellcheck`

## Tool Quick Reference

| Avoid | Use |
|-------|-----|
| `find` | `fd` |
| `grep` | `rg` (ripgrep) |
| `cat` | `bat` |
| `sed` | `sd` (literal default, regex with `-s`) |
| `find \| xargs sed` | `ambr` (parallel codebase replace) |
| Diff preview | `sad` (preview before apply) |
| `rg` + Read for context | `batgrep` (combined) |
| `diff` | `difft` (AST-aware) |
| `git diff` raw | `difft` or `delta` (syntax-highlighted) |
| `du` | `dust` (visual treemap) |
| `ps` | `procs` |
| `curl` | `xh` (auto JSON) |
| `cp` | `xcp` (parallel) |
| `dig` | `doggo` (colored, JSON) |
| `wc -l` / `cloc` | `tokei` |
| `cd` | `z` via zoxide (frecency) |
| `time` | `hyperfine` (statistical) |
