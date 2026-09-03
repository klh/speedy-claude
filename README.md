# speedy-claude

Make Claude Code **10–1400x faster** at file operations — and **structurally safe** at editing.

Based on [agent-skills](https://github.com/addyosmani/agent-skills), extended with three layers that work together:

1. **Speed** — modern CLI tools + `CLAUDE.md` rules that replace sequential Read+Edit with single parallel pipelines
2. **Safety** — enforcement hooks that block fragile shell edits and syntax-check every file after each edit
3. **Autonomy** — evidence-based permission allowlist + `acceptEdits` so the agent works without prompting

Companion repo: **[klh/skills](https://github.com/klh/skills)** — personal `klh-*` skill variants (`npx skills add klh/skills`).

```
  DEFINE          PLAN           BUILD          VERIFY         REVIEW          SHIP
 ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐
 │ Idea │ ───▶ │ Spec │ ───▶ │ Code │ ───▶ │ Test │ ───▶ │  QA  │ ───▶ │  Go  │
 │Refine│      │  PRD │      │ Impl │      │Debug │      │ Gate │      │ Live │
 └──────┘      └──────┘      └──────┘      └──────┘      └──────┘      └──────┘
  /spec          /plan          /build        /test         /review       /ship
```

---

## The two problems

**Speed.** Claude Code edits files one at a time. Each Read/Edit round-trip costs ~0.5–1s; a 50-file change burns ~50s before any thinking happens. Single CLI pipelines do the same work in milliseconds.

**Safety.** Agents left to themselves edit via `cat >> file <<'EOF'` heredocs and inline `python3 - <<EOF` rewriters — prompt-free but context-blind, untracked, never syntax-checked. Speed without guardrails produces fast broken code. This repo now ships both.

## Benchmarks

Tested on a real codebase (733 TypeScript files, ~2500 total files, Apple M-series, 10 cores):

| Operation | Files | Claude Default | CLI Pipeline | Speedup |
|-----------|-------|---------------|-------------|---------|
| Multi-file find & replace | 47 | Read+Edit ~95s | `rg -l -0 \| xargs -0 -P8 sd` sub-second | **~100x** |
| Codebase-wide rename | 538 | ~538s sequential | `ambr` 490ms | **~1100x** |
| **Structural rename (strings/comments untouched)** | 2+ | `ambr` (rewrites strings too) | `ast-grep run -p 'old($A)' -r 'new($A)' --lang ts -U` | **correct where text tools are wrong** |
| Count pattern matches | 346 | Grep+Read+count ~5s | `rg -c \| awk` 54ms | **~90x** |
| Find files | 733 | `find` 3573ms | `fd` 56ms | **64x** |
| Regex replace | 346 | `sed -E` 1530ms | `sd -s` 921ms | 1.7x |
| Bulk rename (parallel) | 538 | `fd --threads=1` 3269ms | `fd -x` 1109ms | **3x** |
| JSON parsing | — | `python3 -c` 56ms | `jq` 31ms | 1.8x |
| File copy (NFS) | — | `cp` 6m18s | `xcp` 37s | **10x** |

## The editing stack (fast AND safe)

| Layer | Mechanism |
|-------|-----------|
| Surgical edit | Claude Code **Edit** tool — unique context anchor, ambiguity fails loudly, auto-accepted (`acceptEdits`) |
| New/whole file | **Write** tool |
| Textual bulk replace | `sd` (regex) · `ambr`/`ambs` (parallel, with `--statistics`) |
| Structural replace | `ast-grep` — AST nodes only; strings and comments stay untouched |
| Structured config | `jq` (JSON) · `yq` (YAML/TOML/XML) |
| Enforcement | `hooks/edit-enforce.sh` denies `cat > f`, `cat >> f`, `sed -i`, `perl -i`; nudges heredoc rewriters toward Edit/Write |
| Post-edit verification | `hooks/syntax-check.sh` — measured sub-10ms gates per save: jq 3.2ms json · yq 6.3ms yaml · taplo 9.1ms toml · esbuild 6.8ms ts/tsx/jsx (parse) + project-tsc tier-2 (types) · ruff 9.6ms py · bash -n 2.4ms sh; errors feed straight back to the agent |
| Lint / dev loop | `qlty check` — 68 linters, one diff-aware command (`qlty init -y && qlty plugins enable biome prettier` on first use) |

**Why the enforcement exists:** `cat` is auto-allowed by the harness, so shell heredoc writes were the model's prompt-dodging workaround — every one of them invisible to diffs and unchecked. Denying the pattern and making Edit/Write prompt-free removes both the failure mode *and* the incentive.

## Hooks

| Hook | Event | Effect |
|------|-------|--------|
| `session-start.sh` | SessionStart | One-line pointer (skills list is already in the system prompt — no full SKILL.md injection) |
| `tool-enforce.sh` | PreToolUse/Bash | Non-blocking nudge toward fast tools (`ls → eza`, `find → fd`, …). Low-noise: skips git subcommands, mid-pipe use, version probes |
| `edit-enforce.sh` | PreToolUse/Bash | **Denies** shell file-writes (cat redirects, `sed -i`, `perl -i`), **nudges** interpreter-heredoc rewriters and `echo >` content generation. Exempts `/tmp`, `$TMPDIR`, `/dev/*` |
| `syntax-check.sh` | PostToolUse/Edit\|Write | Instant parse check of the edited file; failures returned to the agent to fix immediately |
| `skill-install-gate.sh` | PreToolUse/Bash | **Denies** third-party skill/plugin/MCP installs unless `--security-reviewed` is present — earned only via the `skill-security-review` skill (exfiltration/injection/fraud audit) |
| `md-format.sh` | PostToolUse/Edit\|Write (.md) | Auto-formats markdown with prettier — GFM table alignment, list markers, fence style; prose preserved |
| `secrets-gate.sh` | PreToolUse/Bash (git commit/push) | gitleaks scan of staged content and outgoing history — deny on findings; `--no-verify` is the explicit human override |
| `stop-gate.sh` | Stop | The claim-done gate: re-runs syntax gates over changed files + conflict-marker check before the turn may end |

Register them via `settings.example.json` (below).

## Autonomy settings

`settings.example.json` is a ready template: GLM/z.ai (or any Anthropic-compatible) env vars, `acceptEdits`, an evidence-based allowlist (fast CLI tools + `npm test`/`dotnet test`/`git fetch`/`npx tsc --noEmit`), and deny guardrails (`sudo rm`, force-push, `rm -rf ~/*`). Copy to `~/.claude/settings.json`, fill the token, adjust to your stack.

## Skills — 49 active (base set + klh-* variants + audited registry adds)

A 2026-09 audit (`skillUsage` telemetry across months of sessions) found ~half the original skill pack was never invoked — pure context cost in every session. The active set is curated; the rest are parked in [`skills-available/`](skills-available/README.md) with a restore command (`git mv skills-available/<name> skills/`). Parked skills cost zero context.

Highlights: `ast-grep` (structural search rules) · `docker` · `az` · `sqlite`/`sql-best-practice` · `csharp-best-practice` · `cli-speed-tools` · `code-simplifier` · `find-bugs` · `lit-dev` · `core-components` · `zod4` · `test-driven-development` · `systematic-debugging` · `openapi-directory-first` · `browser-testing-with-devtools` · `settings-audit` · `project-memory` — full table in CLAUDE.md's *Skills Quick Reference*.

## Slash Commands

| What you're doing | Command | Key principle |
|-------------------|---------|---------------|
| Define what to build | `/spec` | Spec before code |
| Plan how to build it | `/plan` | Small, atomic tasks |
| Build incrementally | `/build` | One slice at a time |
| Prove it works | `/test` | Tests are proof |
| Review before merge | `/review` | Improve code health |
| Ship to production | `/ship` | Faster is safer |

## Agent Personas

| Agent | Role | Perspective |
|-------|------|-------------|
| [code-reviewer](agents/code-reviewer.md) | Senior Staff Engineer | Five-axis code review |
| [test-engineer](agents/test-engineer.md) | QA Specialist | Test strategy, coverage analysis |
| [security-auditor](agents/security-auditor.md) | Security Engineer | Vulnerability detection, OWASP |
| [minimalist-designer](agents/minimalist-designer.md) | Modernist Minimalist | A11y + DOM mastery, strict palettes, retro-minimal when it fits |
| [growth-marketer](agents/growth-marketer.md) | Low-Budget Growth | Offers, SEO/email flywheels, merch and product launches |
| [outreach-strategist](agents/outreach-strategist.md) | Research-First Outreach | Context sheets, tailored cold email, sequence design |
| [devops-systems-engineer](agents/devops-systems-engineer.md) | PaaS × Bare Metal | Fast flight + low cost, hybrid hosting, runbooks |
| [llm-performance-analyst](agents/llm-performance-analyst.md) | Agent Ops | Transcript metrics: token waste, tool efficiency, error-pattern taxonomy with preventive prescriptions |
| [tool-stack-auditor](agents/tool-stack-auditor.md) | Stack Economics | Audits the online services personas use (marketing, shops, JIT/print, hosting) for better/cheaper alternatives |

## Code style this repo encodes

Modular and DRY *within sanity*. Event mediator/composition over inheritance. Close to the metal over abstraction — Lit/web components over React-class frameworks, platform APIs over wrappers. Boring, inspectable code. (Full section in CLAUDE.md.)

## Multi-agent workflows

Say **`ultracode <task>`** or "use a workflow" in Claude Code to fan out an orchestrated multi-agent run — parallel review dimensions with adversarial verify passes, bulk migrations, research fan-outs. Default size medium (~≤15 agents). Works on GLM/z.ai setups; subagents inherit session model config.

## MCP recommendations

| Need | Server |
|------|--------|
| Browser testing / DOM / network | `chrome-devtools-mcp` |
| Current library docs | `context7` (`https://mcp.context7.com/mcp`) |

```bash
npm i -g chrome-devtools-mcp
claude mcp add -s user chrome-devtools -- chrome-devtools-mcp
claude mcp add -s user -t http context7 https://mcp.context7.com/mcp
```

## Install

### Option 1: Clone into ~/.claude (recommended — like dotfiles, full restore)

```bash
mv ~/.claude ~/.claude.bak
git clone https://github.com/klh/speedy-claude.git ~/.claude
~/.claude/install.sh
cp ~/.claude/settings.example.json ~/.claude/settings.json  # then edit token/allowlist
```

This restores the complete setup: 47 skills, 9 personas, 5 hooks, slash commands, statusline, and CLAUDE.md.

### Option 2: CLI tools only (no skills)

```bash
curl -fsSL https://raw.githubusercontent.com/klh/speedy-claude/main/install.sh | bash
```

### Option 3: Skills via npx

```bash
npx skills add klh/speedy-claude -g -y   # or the companion: npx skills add klh/skills -g -y
```

`install.sh` installs 35+ tools (brew/cargo + the qlty release binary), sets `delta` as git pager, and initializes `zoxide`. It does **not** touch your `settings.json` — copy `settings.example.json` yourself.

### Automated daily review (optional, session-independent)

Headless `claude -p` performance + tool-stack audits at 06:43 daily, findings land in `~/.claude/insights/` and surface at the next session start:

```bash
cp ~/.claude/hooks/daily-insights.sh ~/.claude/hooks/            # already there via clone
cp ~/.claude/hooks/launchd/com.klh.claude-insights.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.klh.claude-insights.plist
```

Statusline: reference implementation in `statusLine.sh` — register with
`"statusLine": {"type": "command", "command": "bash $HOME/.claude/statusLine.sh"}` in settings.json.

## The full dev loop

```
implement  →  tests (npm test / dotnet test)  →  qlty check (diff-aware lint)  →  difft review
     ↑____________________ syntax-check.sh guards every edit ____________________↑
```

The agent participates in the whole loop, not just generation — verified by tooling before anything is claimed done.

## License

MIT
