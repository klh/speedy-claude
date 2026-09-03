#!/bin/bash
# ~/.claude/hooks/skill-install-gate.sh
# PreToolUse(Bash) security gate for third-party skill/plugin installation.
# Skills are prompt+code injectors by definition: a malicious SKILL.md runs
# with full agent trust. This gate DENIES installation commands unless the
# command carries the --security-reviewed marker, which the agent may only
# append after running the skill-security-review skill and getting a PASS.
set -uo pipefail

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
[ "$TOOL_NAME" = "Bash" ] || { echo '{}'; exit 0; }
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -n "$CMD" ] || { echo '{}'; exit 0; }

# Already reviewed: marker present → allow.
printf '%s' "$CMD" | grep -q -- '--security-reviewed' && { echo '{}'; exit 0; }

deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

SEG='(^|[;&|(][[:space:]]*)'

# 1. Skill registry installs (npx skills add ...)
if printf '%s' "$CMD" | grep -Eq "${SEG}(npx +)?skills +add"; then
  deny "Third-party skill install blocked by security gate. FIRST run the skill-security-review skill against the exact source (repo[/path]); only on a PASS verdict re-run this command with --security-reviewed appended."
fi

# 2. Cloning/copying INTO an agent-skills directory
if printf '%s' "$CMD" | grep -Eq '(git +clone|/bin/cp|/bin/mv|\bcp\b|\bmv\b).*\.(claude|agents)/skills' ; then
  deny "Direct install into a skills directory blocked by security gate. Run the skill-security-review skill on the source first; on PASS, re-run with --security-reviewed appended."
fi

# 3. Plugin / marketplace installs (same trust class: third-party prompt+code)
if printf '%s' "$CMD" | grep -Eq "${SEG}claude +(plugin +(install|marketplace +add)|mcp +add)"; then
  deny "Third-party plugin/MCP install blocked by security gate. Run the skill-security-review skill on the plugin/marketplace source first; on PASS, re-run with --security-reviewed appended."
fi

echo '{}'
exit 0
