# speedy-claude

Make Claude Code 10-1400x faster at file operations by replacing its default sequential Read+Edit loop with modern CLI pipelines.

## What is this?

A collection of production-grade engineering skills for AI coding agents — centered around the **CLI Speed Tools** skill that teaches agents to use modern Rust/C CLI replacements instead of slow sequential file operations.

The repo also includes skills for debugging, testing, code review, documentation, and more — all following the [agent-skills](https://github.com/addyosmani/agent-skills) format.

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
| Bulk rename (parallel) | 538 | `fd --threads=1` 3269ms | `fd -x` (parallel) 1109ms | **3x** |
| JSON parsing | — | `python3 -c` 56ms | `jq` 31ms | **1.8x** |
| File copy (NFS) | — | `cp` 6m18s | `xcp` 37s | **10x** |

## Skills Included

| Skill | Purpose |
|-------|---------|
| `cli-speed-tools` | Replace slow CLI tools with modern alternatives |
| `systematic-debugging` | Four-phase root cause analysis |
| `code-simplifier` | Simplify and refactor code |
| `find-bugs` | Bug and vulnerability detection |
| `testing-patterns` | Unit testing and mocking strategies |
| `code-documenter` | Generate documentation |
| `agents-md` | Create AGENTS.md files |
| `core-components` | Design system patterns |
| `lit-dev` | Lit web components with TypeScript |
| `zod-validation` | Zod schema validation |
| `zod4` | Zod 4 validation library |
| `openapi-directory-first` | API documentation lookup |
| `project-memory` | Structured project memory |
| `settings-audit` | Settings.json audit |
| `supabase-postgres-best-practices` | Postgres optimization |
| `find-skills` | Discover agent skills |
| `skill-lookup` | Search skill registries |

## Install

### Option 1: Full bootstrap (recommended — like dotfiles)

```bash
git clone https://github.com/klh/speedy-claude.git
cd speedy-claude
./install.sh
```

This installs everything: CLI tools, skills, and CLAUDE.md config.

### Option 2: CLI tools only (no skills)

```bash
curl -fsSL https://raw.githubusercontent.com/klh/speedy-claude/main/install.sh | bash
```

### Option 3: Copy individual skills

Copy skill directories from `skills/` into `~/.claude/skills/`.

## What the install script does

1. Installs 30+ tools via Homebrew and Cargo
2. Sets `delta` as your git diff pager
3. Initializes `zoxide` for smart cd
4. Copies 18 skills into `~/.claude/skills/`
5. Appends the CLAUDE.md speed rules to your global config
6. Prints a summary of what changed

## How it works

The `cli-speed-tools` skill teaches Claude Code to:

1. **Never Read+Edit in a loop** — use `ambr`/`sd`/`sad` pipelines for multi-file changes
2. **Search with context** — use `batgrep` instead of `rg` + separate Read calls
3. **Use structural diffs** — use `difft` instead of raw `git diff`
4. **Run linters first** — use `shellcheck`/`actionlint` before manual review
5. **Use parallel execution** — `fd -x` and `ambr` run in parallel by default
6. **Use single-command patterns** — `rg -c | awk` replaces Grep+Read+count

These rules are loaded every session and override Claude's default behavior of sequential file-by-file operations.

## Project Structure

```
skills/       → Core skills (SKILL.md per directory)
references/   → Supplementary checklists
docs/         → Setup guides
install.sh    → One-liner installer for 30+ CLI speed tools
```

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
