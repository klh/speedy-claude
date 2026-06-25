#!/bin/bash
# ~/.claude/hooks/tool-enforce.sh
# NON-BLOCKING PreToolUse advisory. When the Bash tool invokes a standalone
# native binary that has a faster modern equivalent, emits a JSON nudge as
# additionalContext. Never blocks (always exit 0). Low-noise by design.
set -uo pipefail

INPUT="$(cat)"

# Only the Bash tool is in scope.
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
[ "$TOOL_NAME" = "Bash" ] || { echo '{}'; exit 0; }

CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -n "$CMD" ] || { echo '{}'; exit 0; }

# First meaningful token: strip leading VAR=val assignments and sudo/nice/time/env/command wrappers.
LEADING_STRIPPED="$(printf '%s' "$CMD" | sed -E 's/^[[:space:]]*//; s/([[:space:]]|^)([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]*)+//; s/^[[:space:]]*(sudo|nice|time|command|env)[[:space:]]+//')"
FIRST_TOKEN="$(printf '%s' "$LEADING_STRIPPED" | awk '{print $1}')"
BASE="$(printf '%s' "$FIRST_TOKEN" | sed -E 's|.*/||')"   # basename, handles /usr/bin/ls

# Native binary -> fast replacement.
NUDGE=""
case "$BASE" in
  ls)   NUDGE="ls -> eza -la (or eza --tree)" ;;
  find) NUDGE="find -> fd" ;;
  grep) NUDGE="grep -> rg" ;;
  cat)  NUDGE="cat -> bat" ;;
  sed)  NUDGE="sed -> sd" ;;
  du)   NUDGE="du -> dust" ;;
  diff) NUDGE="diff -> difft" ;;
  ps)   NUDGE="ps -> procs" ;;
  curl) NUDGE="curl -> xh" ;;
  *)    NUDGE="" ;;
esac
[ -n "$NUDGE" ] || { echo '{}'; exit 0; }

# LOW-NOISE EXCLUSIONS:
# 1. git subcommands own their verbs (git diff, git grep, git ls-files).
printf '%s' "$CMD" | grep -Eq "(^|[[:space:]])git[[:space:]]" && { echo '{}'; exit 0; }
# 2. version/help self-probes of the native tool.
printf '%s' "$CMD" | grep -Eq -- '--version|--help' && { echo '{}'; exit 0; }
# 3. Mid-pipe native tools are naturally skipped: BASE is computed from the
#    FIRST token, so `foo | grep x` has BASE=foo, not grep. Only standalone
#    leading invocations (cat f, grep -r x .) get nudged.
# 4. Guard against shell builtins.
case "$BASE" in echo|cd|pwd|export|set|true|false) echo '{}'; exit 0 ;; esac

# Emit non-blocking nudge. Exit 0 = never blocks the tool call.
jq -nc --arg n "speedy-claude nudge: prefer the fast tool — $NUDGE (see CLAUDE.md / cli-speed-tools skill)" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$n}}'
exit 0
