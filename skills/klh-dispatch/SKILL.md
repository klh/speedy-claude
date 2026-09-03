---
name: klh-dispatch
description: Single entry-point orchestrator that detects task type and dispatches to the right klh-* skill. Use when the user says "dispatch", "klh this", or gives a task that could match multiple skills.
---

# KLH Dispatch

> Part of [klh/skills](https://github.com/klh/skills) — personal agent skills by [Klaus L. Hougesen](https://github.com/klh).
> Install: `npx skills add klh/skills --skill klh-dispatch`

## Overview

Single entry-point orchestrator. Detects what the user wants, picks the right skill, and invokes it. Inspired by the conductor pattern — the dispatcher routes but never implements.

## Trigger Phrases

Activates on:
- "dispatch", "klh this", "run this through klh"
- Any task where multiple skills could apply and you need to pick the right one
- "use the right skill for this"

SKIP when:
- User already named a specific klh-* skill (let them control directly)
- Task is a one-line fix (no skill needed)
- User is asking a factual question

## Routing Table

| User Intent | Dispatch To |
|-------------|-------------|
| List, search, find, or view files | `klh-cli-speed-tools` |
| Find bugs, vulnerabilities, code quality | `klh-find-bugs` |
| Debug unexpected behavior, test failure | `klh-systematic-debugging` |
| Simplify, refactor, clean up code | `klh-code-simplifier` |
| Write tests, mocking, TDD | `klh-testing-patterns` |
| Validate data, API inputs, schemas | `klh-zod-validation` |
| Build web components (Lit) | `klh-lit-dev` |
| UI components, design tokens, design system | `klh-core-components` |
| Public API specs, OpenAPI lookup | `klh-openapi-directory-first` |
| Track project decisions, bugs, work history | `klh-project-memory` |
| Create or update AGENTS.md | `klh-agents-md` |
| Configure Claude Code settings | `klh-settings-audit` |
| Multiple skills, verbosity, output style | `klh-all-skills` |
| New feature or complex task (multi-skill) | Walk the loop below |

## The Loop (Multi-Skill Tasks)

For tasks that need multiple skills in sequence:

### Phase 0 — Scope

Restate understanding in one sentence. If scope is unclear, ask one calibration question. If task is small, offer to skip straight to the right skill.

### Phase 1 — Plan

Identify which klh-* skills apply and in what order. List the skill chain.

**CHECKPOINT**: Confirm skill chain with user before executing.

### Phase 2 — Execute

Invoke skills in order. Each skill owns its phase. The dispatcher does not implement — it delegates.

After each skill completes:
- Verify the skill's output (did it do what was asked?)
- Check for Five Failure Modes (hallucinated actions, scope creep, cascading errors, context loss, tool misuse)
- If clean, move to next skill in chain

### Phase 3 — Verify

Run `klh-find-bugs` on any changed code. Catch regressions before declaring done.

### Phase 4 — STOP

Report what was done, which skills were used, and any deferred items.
Do NOT stage, commit, push, merge, or open PR. Wait for user direction.

## Mid-Flow Routing

These can be invoked at any point without breaking the loop:
- Bug discovered mid-task -> `klh-systematic-debugging`
- Need API docs -> `klh-openapi-directory-first`
- Code getting complex -> `klh-code-simplifier`
- Need to validate inputs -> `klh-zod-validation`
- Context feels heavy -> summarize anchors, clear stale context (see `klh-all-skills` drift management)

## Parallel Execution

When the plan has 3+ independent tasks:
1. Write a cohesion contract (shared types, interfaces, naming conventions)
2. Spawn agents for each task with scope restrictions
3. Each agent uses the appropriate klh-* skill
4. Verify combined output for integration issues

Max 5 parallel agents. Max 3 reconciliation rounds.

## Hard Caps

- Max 5 iteration loops (then stop and ask user)
- Max 50 tool calls total across the loop
- If a skill fails twice, stop and escalate to user
- Never auto-commit, auto-push, or auto-merge

## Cross-Cutting Rules

- User instructions always override this routing table
- If a task matches zero skills, handle directly without a skill
- If a task matches multiple skills equally, ask the user which to use
- The dispatcher is stateless between conversations — each session starts fresh
