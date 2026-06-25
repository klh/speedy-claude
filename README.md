# speedy-claude

Based on [agent-skills](https://github.com/addyosmani/agent-skills) — production-grade engineering skills for AI coding agents, extended with CLI speed optimizations that make file operations **10-1400x faster**.

Companion repo: **[klh/skills](https://github.com/klh/skills)** — personal agent skills published at `npx skills add klh/skills`.

```
  DEFINE          PLAN           BUILD          VERIFY         REVIEW          SHIP
 ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐
 │ Idea │ ───▶ │ Spec │ ───▶ │ Code │ ───▶ │ Test │ ───▶ │  QA  │ ───▶ │  Go  │
 │Refine│      │  PRD │      │ Impl │      │Debug │      │ Gate │      │ Live │
 └──────┘      └──────┘      └──────┘      └──────┘      └──────┘      └──────┘
  /spec          /plan          /build        /test         /review       /ship
```

Plus CLI speed tools that replace slow sequential file operations with single parallel pipelines.

---

## The Problem

Claude Code edits files one at a time. Each Read or Edit tool call costs ~0.5-1s of round-trip overhead. When a change affects 50 files, that's **~50 seconds** of just waiting — before Claude even thinks.

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

---

## Install

### Option 1: Clone into ~/.claude (recommended — like dotfiles)

```bash
# Back up existing config if needed
mv ~/.claude ~/.claude.bak

# Clone directly — skills/ and CLAUDE.md land in the right place
git clone https://github.com/klh/speedy-claude.git ~/.claude

# Install CLI tools
~/.claude/install.sh
```

### Option 2: CLI tools only (no skills)

```bash
curl -fsSL https://raw.githubusercontent.com/klh/speedy-claude/main/install.sh | bash
```

### Option 3: Install via npx skills

```bash
# Install all skills from this repo
npx skills add klh/speedy-claude -g -y

# Or install the companion personal skills repo
npx skills add klh/skills -g -y
```

## What the install script does

1. Installs 30+ tools via Homebrew and Cargo
2. Sets `delta` as your git diff pager
3. Initializes `zoxide` for smart cd
4. Prints a summary of what changed

Skills and CLAUDE.md are included by cloning the repo into `~/.claude/` — no copying needed.

---

## All 39 Skills

### Define — Clarify what to build

| Skill | What It Does |
|-------|-------------|
| [idea-refine](skills/idea-refine/SKILL.md) | Structured divergent/convergent thinking |
| [spec-driven-development](skills/spec-driven-development/SKILL.md) | Write PRD before any code |

### Plan — Break it down

| Skill | What It Does |
|-------|-------------|
| [planning-and-task-breakdown](skills/planning-and-task-breakdown/SKILL.md) | Decompose specs into verifiable tasks |

### Build — Write the code

| Skill | What It Does |
|-------|-------------|
| [incremental-implementation](skills/incremental-implementation/SKILL.md) | Thin vertical slices |
| [test-driven-development](skills/test-driven-development/SKILL.md) | Red-Green-Refactor |
| [context-engineering](skills/context-engineering/SKILL.md) | Feed agents the right info at the right time |
| [frontend-ui-engineering](skills/frontend-ui-engineering/SKILL.md) | Component architecture, design systems |
| [api-and-interface-design](skills/api-and-interface-design/SKILL.md) | Contract-first API design |
| [cli-speed-tools](skills/cli-speed-tools/SKILL.md) | Modern CLI replacements (10-1400x faster) |
| [core-components](skills/core-components/SKILL.md) | Design system patterns |
| [lit-dev](skills/lit-dev/SKILL.md) | Lit web components with TypeScript |

### Verify — Prove it works

| Skill | What It Does |
|-------|-------------|
| [browser-testing-with-devtools](skills/browser-testing-with-devtools/SKILL.md) | Chrome DevTools MCP testing |
| [debugging-and-error-recovery](skills/debugging-and-error-recovery/SKILL.md) | Five-step triage |
| [systematic-debugging](skills/systematic-debugging/SKILL.md) | Four-phase root cause analysis |
| [find-bugs](skills/find-bugs/SKILL.md) | Bug and vulnerability detection |
| [testing-patterns](skills/testing-patterns/SKILL.md) | Unit testing and mocking strategies |
| [zod-validation](skills/zod-validation/SKILL.md) | Zod schema validation |
| [zod4](skills/zod4/SKILL.md) | Zod 4 validation library |

### Review — Quality gates before merge

| Skill | What It Does |
|-------|-------------|
| [code-review-and-quality](skills/code-review-and-quality/SKILL.md) | Five-axis code review |
| [code-simplification](skills/code-simplification/SKILL.md) | Chesterton's Fence, Rule of 500 |
| [code-simplifier](skills/code-simplifier/SKILL.md) | Simplify and refactor code |
| [security-and-hardening](skills/security-and-hardening/SKILL.md) | OWASP Top 10 prevention |
| [performance-optimization](skills/performance-optimization/SKILL.md) | Measure-first performance |

### Ship — Deploy with confidence

| Skill | What It Does |
|-------|-------------|
| [git-workflow-and-versioning](skills/git-workflow-and-versioning/SKILL.md) | Trunk-based development |
| [ci-cd-and-automation](skills/ci-cd-and-automation/SKILL.md) | Shift Left, feature flags |
| [deprecation-and-migration](skills/deprecation-and-migration/SKILL.md) | Code-as-liability mindset |
| [documentation-and-adrs](skills/documentation-and-adrs/SKILL.md) | Architecture Decision Records |
| [shipping-and-launch](skills/shipping-and-launch/SKILL.md) | Pre-launch checklists |

### Configure & Docs

| Skill | What It Does |
|-------|-------------|
| [settings-audit](skills/settings-audit/SKILL.md) | Settings.json audit |
| [project-memory](skills/project-memory/SKILL.md) | Structured project memory |
| [find-skills](skills/find-skills/SKILL.md) | Discover agent skills |
| [skill-lookup](skills/skill-lookup/SKILL.md) | Search skill registries |
| [agents-md](skills/agents-md/SKILL.md) | Create AGENTS.md files |
| [code-documenter](skills/code-documenter/SKILL.md) | Generate documentation |
| [openapi-directory-first](skills/openapi-directory-first/SKILL.md) | API documentation lookup |
| [supabase-postgres-best-practices](skills/supabase-postgres-best-practices/SKILL.md) | Postgres optimization |

### Meta

| Skill | What It Does |
|-------|-------------|
| [using-agent-skills](skills/using-agent-skills/SKILL.md) | How to use this skills pack |

---

## Slash Commands

7 commands that map to the development lifecycle:

| What you're doing | Command | Key principle |
|-------------------|---------|---------------|
| Define what to build | `/spec` | Spec before code |
| Plan how to build it | `/plan` | Small, atomic tasks |
| Build incrementally | `/build` | One slice at a time |
| Prove it works | `/test` | Tests are proof |
| Review before merge | `/review` | Improve code health |
| Simplify the code | `/code-simplify` | Clarity over cleverness |
| Ship to production | `/ship` | Faster is safer |

---

## Agent Personas

Pre-configured specialist personas for targeted reviews:

| Agent | Role | Perspective |
|-------|------|-------------|
| [code-reviewer](agents/code-reviewer.md) | Senior Staff Engineer | Five-axis code review |
| [test-engineer](agents/test-engineer.md) | QA Specialist | Test strategy, coverage analysis |
| [security-auditor](agents/security-auditor.md) | Security Engineer | Vulnerability detection, OWASP |

---

## How CLI Speed Tools Work

The `cli-speed-tools` skill teaches agents to:

1. **Never Read+Edit in a loop** — use `ambr`/`sd`/`sad` pipelines for multi-file changes
2. **Search with context** — use `batgrep` instead of `rg` + separate Read calls
3. **Use structural diffs** — use `difft` instead of raw `git diff`
4. **Run linters first** — use `shellcheck`/`actionlint` before manual review
5. **Use parallel execution** — `fd -x` and `ambr` run in parallel by default
6. **Use single-command patterns** — `rg -c | awk` replaces Grep+Read+count

---

## Tool-First Enforcement (optional)

The skill + `CLAUDE.md` rules are *soft* guidance. For a non-blocking hard
guardrail, this repo ships `hooks/tool-enforce.sh` — a `PreToolUse` advisory
that nudges Claude toward the fast tool whenever it standalone-invokes a native
binary (`ls -> eza`, `find -> fd`, `grep -> rg`, `cat -> bat`, `sed -> sd`,
`du -> dust`, `diff -> difft`, `ps -> procs`, `curl -> xh`). It never blocks
(exit 0) and stays low-noise: it skips `git` subcommands, mid-pipe use,
`--version`/`--help` probes, and non-Bash tools.

Enable it by appending (idempotently) to your `PreToolUse` hooks, and add a
`permissions.allow` entry for the fast tools so they don't prompt on first use
(an allowlist removes the friction that otherwise biases toward native tools):

```bash
HOOK="bash $HOME/.claude/hooks/tool-enforce.sh"
jq --arg h "$HOOK" \
  'if (.hooks.PreToolUse // [] | map(.hooks[]?.command) | any(test("tool-enforce.sh"))) then .
   else .hooks.PreToolUse += [{"hooks":[{"type":"command","command":$h}]}] end' \
  ~/.claude/settings.json > ~/.claude/settings.json.new \
  && mv ~/.claude/settings.json.new ~/.claude/settings.json
```

Re-verify any time with `bash ~/.claude/hooks/verify-tools.sh`.

---

## Project Structure

```
speedy-claude/
├── skills/                    # 39 skills (SKILL.md per directory)
├── agents/                    # 3 specialist personas
├── hooks/                     # Session lifecycle hooks
├── .claude/commands/          # 7 slash commands
├── references/                # 4 supplementary checklists
├── docs/                      # Setup guides per tool
├── install.sh                 # CLI speed tools installer
├── CLAUDE.md                  # Project config
└── AGENTS.md                  # Agent conventions
```

---

## Credits

- **[agent-skills](https://github.com/addyosmani/agent-skills)** by Addy Osmani — 20 production-grade engineering skills
- **[klh/skills](https://github.com/klh/skills)** — 13 personal agent skills, published via `npx skills add klh/skills`
- Custom skills and CLI speed tools by [Klaus L. Hougesen](https://github.com/klh)

## License

MIT
