# speedy-claude

A collection of production-grade engineering skills for AI coding agents — with CLI speed optimizations that make file operations 10-1400x faster.

## Project Structure

```
skills/       → Core skills (SKILL.md per directory)
references/   → Supplementary checklists (testing, performance, security, accessibility)
docs/         → Setup guides
install.sh    → One-liner installer for 30+ CLI speed tools
```

## Skills by Phase

**Build:** cli-speed-tools, code-simplifier, core-components, lit-dev, code-documenter, agents-md, openapi-directory-first
**Verify:** systematic-debugging, find-bugs, testing-patterns, zod-validation, zod4
**Configure:** settings-audit, project-memory, find-skills, skill-lookup

## Conventions

- Every skill lives in `skills/<name>/SKILL.md`
- YAML frontmatter with `name` and `description` fields
- Description starts with what the skill does (third person), followed by trigger conditions ("Use when...")
- Every skill has: Overview, When to Use, Process, Common Rationalizations, Red Flags, Verification
- References live in `references/` within the skill directory
- Supporting files only created when content exceeds 100 lines

## Commands

- `npm test` — Not applicable (this is a documentation project)
- Validate: Check that all SKILL.md files have valid YAML frontmatter with name and description
- Install: `curl -fsSL https://raw.githubusercontent.com/klh/speedy-claude/main/install.sh | bash`

## Boundaries

- Always: Follow the skill-anatomy format for new skills
- Never: Add skills that are vague advice instead of actionable processes
- Never: Duplicate content between skills — reference other skills instead

## CLI Speed Tools

The `cli-speed-tools` skill teaches AI agents to use modern CLI replacements instead of sequential file operations. Key rules:

1. **Never Read+Edit in a loop** — use `ambr`/`sd`/`sad` pipelines for multi-file changes
2. **Search with context** — use `batgrep` instead of `rg` + separate Read calls
3. **Use structural diffs** — use `difft` instead of raw `git diff`
4. **Run linters first** — use `shellcheck`/`actionlint` before manual review
5. **Use parallel execution** — `fd -x` and `ambr` run in parallel by default
6. **Use single-command patterns** — `rg -c | awk` replaces Grep+Read+count

These rules override the default behavior of sequential file-by-file operations, providing up to **1400x speedup** on multi-file changes.

## Install

Clone this repo into `~/.claude/` for a dotfiles-style setup:

```bash
git clone https://github.com/klh/speedy-claude.git ~/.claude
~/.claude/install.sh
```

Or install CLI tools only (no skills):

```bash
curl -fsSL https://raw.githubusercontent.com/klh/speedy-claude/main/install.sh | bash
```
