#!/bin/bash
# Daily headless agent reviews — run by launchd (com.klh.claude-insights)
# Works with NO interactive Claude session open: spawns `claude -p` headlessly.
# Model: haiku shortcode (mapped to glm-5.2[1m] via settings.json env) — cheap
# and capable enough for review work, per user preference.
set -uo pipefail

INSIGHTS="$HOME/.claude/insights"
mkdir -p "$INSIGHTS"
TODAY="$(date +%F)"
exec >>"$INSIGHTS/launchd.log" 2>&1

run_claude() { claude -p "$1" --model haiku --permission-mode acceptEdits; }

echo "=== $(date -Iseconds) daily-insights run start"

echo "--- performance analyst ---"
run_claude "You are running as the llm-performance-analyst persona. FIRST read /Users/kk/.claude/agents/llm-performance-analyst.md and follow its methodology exactly.

Scope: Claude Code sessions from the last 24h. Find transcripts with: fd -e jsonl . /Users/kk/.claude/projects --changed-within 24h
Compute the persona's metrics (token/cache efficiency, read-before-write ratio, edit failures, hook denials) and its error-pattern taxonomy (hasty edits, tunnel vision, symptom loops, context amnesia, tool misuse, scope drift).

Write two outputs:
1. /Users/kk/.claude/insights/${TODAY}.md — full report per the persona output format
2. Append ONLY new actionable prescriptions (one line each: [pattern] -> [concrete fix]) to /Users/kk/.claude/insights/PENDING.md

Rules: REPORT ONLY — no config changes. Sample deeply: 3 sessions line-by-line beat 30 skimmed. Keep under ~50k tokens. If no new patterns, write a one-line 'no new findings' entry."

echo "--- tool-stack auditor ---"
run_claude "You are running as the tool-stack-auditor persona. FIRST read /Users/kk/.claude/agents/tool-stack-auditor.md and follow its methodology exactly.

Scope: the last 7 days. Find session transcripts with: fd -e jsonl . /Users/kk/.claude/projects --changed-within 7d — plus /Users/kk/.claude/insights/*.md reports.

Write two outputs:
1. /Users/kk/.claude/insights/${TODAY}-toolstack.md — your report
2. Append new actionable swaps (one line each: [tool/service in use] -> [alternative] [savings/why]) to /Users/kk/.claude/insights/PENDING.md

Rules: REPORT ONLY. Verify alternatives exist and are maintained before recommending. Keep under ~50k tokens."

echo "=== $(date -Iseconds) daily-insights run end"
