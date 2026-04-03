# speedy-claude

Make Claude Code 10-1400x faster at file operations by replacing its default sequential Read+Edit loop with modern CLI pipelines.

## The Problem

Claude Code edits files one at a time. Each Read or Edit tool call costs ~0.5-1s of round-trip overhead. When a change affects 50 files, that's **~50 seconds** of just waiting for tool calls — before Claude even thinks.

The fix: single CLI commands that do the same work in milliseconds.

## Benchmarks

Tested on a real codebase (733 TypeScript files, ~2500 total files, Apple M-series, 10 cores):

| Operation | Files | Claude Default | CLI Pipeline | Speedup |
|-----------|-------|---------------|-------------|---------|
| Multi-file find & replace | 47 | Read+Edit ~95s | `rg \| sad -k` 67ms | **~1400x** |
| Codebase-wide rename | 538 | ~538s sequential | `ambr` 490ms | **~1100x** |
| Count pattern matches | 346 | Grep+Read+count ~5s | `rg -c \| awk` 54ms | **~90x** |
| Find files | 733 | `find` 3573ms | `fd` 56ms | **64x** |
| Regex replace | 346 | `sed -E` 1530ms | `sd -s` 921ms | **1.7x** |
| Regex replace (large file) | — | `sed` 11.3s | `sd` 0.94s | **12x** |
| Bulk rename (parallel) | 538 | `fd --threads=1` 3269ms | `fd -x` (parallel) 1109ms | **3x** |
| Disk usage | — | `du` 14.9s | `dust` 4.0s | **3.7x** |
| JSON parsing | — | `python3 -c` 56ms | `jq` 31ms | **1.8x** |
| File copy (NFS) | — | `cp` 6m18s | `xcp` 37s | **10x** |
| Search text | ~13GB | GNU `grep` 6.6s | `rg` 1.0s | **6.3x** |

## What Gets Installed

### Core (file operations — biggest impact)

| Tool | Replaces | Why |
|------|----------|-----|
| `fd` | `find` | 64x faster, parallel, respects .gitignore |
| `ripgrep` (`rg`) | `grep` | 6x faster, SIMD-accelerated |
| `bat` | `cat` | Syntax highlighting + line numbers |
| `sd` | `sed` | Literal default, no BSD `-i ''` tax, 12x faster at regex |
| `amber` (`ambr`) | `find \| xargs sed` | Parallel codebase-wide replace, 3.3x faster |
| `sad` | `sed` + manual diff | Diff preview before applying |
| `jq` | `python3 -c` for JSON | Native C, <1ms vs 30ms Python startup |
| `difftastic` (`difft`) | `diff` | AST-aware structural diff |
| `delta` | raw `git diff` | Syntax-highlighted git pager |

### bat extras (search with context)

| Tool | Why |
|------|-----|
| `batgrep` | Search + syntax-highlighted context in one command |
| `batdiff` | Syntax-highlighted diffs |
| `batman` | Man pages with syntax highlighting |

### Navigation & monitoring

| Tool | Replaces | Why |
|------|----------|-----|
| `eza` | `ls` | Icons, git status, tree mode |
| `dust` | `du` | Visual treemap |
| `zoxide` | `cd` | Frecency-based smart jumping |
| `procs` | `ps` | Colored, searchable, tree view |
| `bottom` (`btm`) | `htop` | Cross-platform graphs |
| `lazygit` | git CLI (complex ops) | Interactive TUI for staging, rebasing |
| `broot` | `tree` + `cd` | Interactive tree with search |
| `tokei` | `cloc` / `wc -l` | Code stats for 150+ languages, instant |
| `watchexec` | `watch` | File watcher, reruns on change |
| `hyperfine` | manual `time` | Statistical benchmarking |

### HTTP & network

| Tool | Replaces | Why |
|------|----------|-----|
| `xh` | `curl` | HTTPie syntax, auto JSON, Rust |
| `doggo` | `dig` | Colored DNS, JSON output |
| `hurl` | sequential curl | Multi-request with assertions |
| `xcp` | `cp` | 10x faster on network drives |
| `aria2` | `wget` | Multi-source parallel downloads |

### Git & CI

| Tool | Why |
|------|-----|
| `act` | Run GitHub Actions locally |
| `actionlint` | Lint GitHub Actions YAML |
| `shellcheck` | Lint shell scripts |

## Install

### Option 1: One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/klh/speedy-claude/main/install.sh | bash
```

### Option 2: Manual

```bash
git clone https://github.com/klh/speedy-claude.git
cd speedy-claude
./install.sh
```

### Option 3: Claude Code plugin

Add to your global or project CLAUDE.md:

```bash
cat speedy-claude/claude-md-snippet.md >> ~/.claude/CLAUDE.md
```

## What the install script does

1. Installs 30+ tools via Homebrew and Cargo
2. Sets `delta` as your git diff pager
3. Initializes `zoxide` for smart cd
4. Appends the CLAUDE.md speed rules to your global config
5. Prints a summary of what changed

## How it works

The `claude-md-snippet.md` file teaches Claude Code to:

1. **Never Read+Edit in a loop** — use `ambr`/`sd`/`sad` pipelines for multi-file changes
2. **Search with context** — use `batgrep` instead of `rg` + separate Read calls
3. **Use structural diffs** — use `difft` instead of raw `git diff`
4. **Run linters first** — use `shellcheck`/`actionlint` before manual review
5. **Use parallel execution** — `fd -x` and `ambr` run in parallel by default
6. **Use single-command patterns** — `rg -c | awk` replaces Grep+Read+count

These rules are loaded every session and override Claude's default behavior of sequential file-by-file operations.

## Requirements

- macOS (Linux support via install flags)
- [Homebrew](https://brew.sh)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (optional — tools work independently)

## Uninstall

```bash
# Remove the CLAUDE.md additions
# (manually remove the "CLI Speed Tools" section from ~/.claude/CLAUDE.md)

# Reset git pager
git config --global --unset core.pager
git config --global --unset interactive.diffFilter

# Uninstall brew packages
brew uninstall git-delta hyperfine tokei procs zoxide bottom lazygit broot watchexec doggo xcp difftastic sd sad bat eza fd ripgrep jq dust bat-extras shellcheck actionlint act xh hurl aria2 tree gum git-standup fswatch micro tldr serve mkcert

# Uninstall cargo packages
cargo install --list | rg 'ambr' && cargo uninstall amber
```

## License

See [LICENSE](LICENSE).
