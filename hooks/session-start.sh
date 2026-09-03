#!/bin/bash
# agent-skills session start hook — compact pointer (2026-09-03 cleanup).
# v3 (hooks-review #1): SessionStart must emit plain stdout or a proper
# hookSpecificOutput.additionalContext JSON — the previous {priority,message}
# shape failed schema validation and the text never reached the agent.
set -uo pipefail

MSG=""
MSG+="Skills: use klh-dispatch to route, klh-cli-speed-tools for shell work, klh-systematic-debugging before any fix. Parked skills live in ~/.claude/skills-available/ (see its README)."
# Surface un-reviewed performance insights if any are pending
if [ -s "$HOME/.claude-insights/PENDING.md" ]; then
  MSG+=$'\n'"NEW INSIGHTS PENDING: ~/.claude-insights/PENDING.md is non-empty — read it, apply or decline its prescriptions, then clear the file."
fi

jq -nc --arg m "$MSG" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$m}}'
