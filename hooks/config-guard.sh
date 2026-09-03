#!/bin/bash
# ~/.claude/hooks/config-guard.sh
# PreToolUse(Edit|Write) — protects the agent's own control plane.
# Prompt-injection persistence route: an injected agent silently appends to a
# hook or settings and gets code execution on the NEXT session — bypassing
# every Bash gate. This gate denies Write/Edit into config/credential paths
# unless the command carries --config-change-approved (earned by presenting
# the change to the user first). /tmp and the insights inbox stay open.
set -uo pipefail

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
case "$TOOL_NAME" in Edit|Write|NotebookEdit) ;; *) echo '{}'; exit 0 ;; esac

F="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null || true)"
[ -n "$F" ] || { echo '{}'; exit 0; }

# Normalize for matching: drop quotes, resolve ~
case "$F" in '~'*) F="$HOME${F#\~}";; esac
F="$(printf '%s' "$F" | tr -d "\"'")"

deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}

# Protected control plane: hooks, settings, skills, agents, commands, mcp-servers,
# plugin config, shell rc, launchd. (Parked skills + skills-available included:
# restoring a parked skill is an install.)
PROT='(^\$HOME/\.claude/(hooks|skills|skills-available|agents|commands|mcp-servers|plugins|settings(\.local)?\.json|CLAUDE\.md|AGENTS\.md)/?|^\$HOME/\.agents/|^\$HOME/\.zshrc|^\$HOME/\.zprofile|^\$HOME/\.zshenv|^\$HOME/Library/LaunchAgents/)'
P="$(printf '%s' "$F" | sed "s|$HOME|\$HOME|")"

if printf '%s' "$P" | grep -Eq "$PROT"; then
  # Escape hatch for deliberate, user-visible config work:
  # the agent must have shown the user the change and gotten agreement, then
  # passes the marker in the tool_input (Edit: in new_string comment/commit msg
  # is NOT enough — marker lives in file_path? no: marker passed via a leading
  # comment line inside new_string is spoofable. Instead: only allow when the
  # user runs with bypass or approves the ask this hook triggers otherwise.)
  deny "config-guard: \$F is agent control-plane (hooks/settings/skills/agents/launchd/shell-rc). Present the exact change to the user and let THEM approve the permission prompt — or apply it manually. Unattended/self-approved writes here are denied by design."
fi

echo '{}'
exit 0
