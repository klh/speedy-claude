#!/bin/bash
# ~/.claude/hooks/stop-gate.sh
# Stop hook: the "claim done" gate. Before the agent ends its turn, verify the
# work it touched: re-run the measured syntax gates over every code file it
# changed (staged + unstaged) and check for conflict markers. Exit 2 feeds the
# failures back so they get fixed BEFORE the task is declared complete.
# Silent pass when nothing relevant changed or not a git repo.
set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT="$(cat)"

# Only gate when the session actually did file work (stop_hook_active guards
# against loops: if we already blocked once, let it pass through).
ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || true)"
[ "$ACTIVE" = "true" ] && exit 0

# Find the repo root from the transcript's cwd
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)"
[ -n "$CWD" ] && [ -d "$CWD" ] || exit 0
cd "$CWD" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Nothing changed? Done.
CHANGED="$(git status --porcelain 2>/dev/null | head -50)"
[ -n "$CHANGED" ] || exit 0

FAILURES=""

# 1. Conflict markers / unmerged paths
UNMERGED="$(git diff --name-only --diff-filter=U 2>/dev/null)"
[ -n "$UNMERGED" ] && FAILURES="Unmerged files: $UNMERGED"$'\n'

# 2. Syntax re-verification of changed code files via the same measured gates
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "${f##*.}" in
    json|py|sh|bash|zsh|ts|tsx|js|jsx|mjs|cjs|mts|cts|yaml|yml|toml) ;;
    *) continue ;;
  esac
  OUT="$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s"}\n}' "$PWD/$f" | bash "$HOOKS_DIR/syntax-check.sh" 2>&1)"
  RC=$?
  [ $RC -ne 0 ] && FAILURES="${FAILURES}${OUT}"$'\n'
done < <(git status --porcelain 2>/dev/null | awk '{print $NF}' | rg -v '\.claude/')

if [ -n "$FAILURES" ]; then
  printf 'STOP-GATE: not done yet — fix these before claiming completion:\n%s\n' "$FAILURES" >&2
  exit 2
fi
exit 0
