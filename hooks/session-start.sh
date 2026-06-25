#!/bin/bash
# agent-skills session start hook
# Injects the using-agent-skills meta-skill into every new session

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$(dirname "$SCRIPT_DIR")/skills"
META_SKILL="$SKILLS_DIR/using-agent-skills/SKILL.md"

if [ -f "$META_SKILL" ]; then
  CONTENT=$(cat "$META_SKILL")
  # Output as JSON for Claude Code hook consumption.
  # Use jq -Rs to safely escape the (possibly multiline) skill content — a raw
  # heredoc would inject unescaped control chars and produce invalid JSON.
  {
    printf 'Prefer fast CLI tools (eza, fd, rg, bat, sd, ambr/ambs, sad, batgrep, difft, dust, jq, xh) over native ls/find/grep/cat/sed/diff/du/curl/ps — see cli-speed-tools skill.\n\n'
    printf 'agent-skills loaded. Use the skill discovery flowchart to find the right skill for your task.\n\n'
    printf '%s' "$CONTENT"
  } | jq -Rs '{priority:"IMPORTANT", message:.}'
else
  echo '{"priority": "INFO", "message": "agent-skills: using-agent-skills meta-skill not found. Skills may still be available individually."}'
fi
