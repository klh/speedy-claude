#!/bin/bash
# ~/.claude/hooks/syntax-check.sh
# PostToolUse(Edit|Write|NotebookEdit): syntax-validate the file just edited,
# by extension, and feed failures back to Claude so they are fixed immediately.
# Silent (exit 0, no output) when the file passes or the type has no checker.
#
# Checkers: jq (json) · ast.parse (py) · bash -n (sh) · node --check (js)
#           project-local tsc --noEmit for .ts (module/name-resolution error
#           codes filtered out — single-file mode can't resolve project paths;
#           what remains is real syntax/structure breakage)
set -uo pipefail

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
case "$TOOL_NAME" in
  Edit|Write|NotebookEdit) ;;
  *) exit 0 ;;
esac

F="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null || true)"
[ -n "$F" ] && [ -f "$F" ] || exit 0

EXT="${F##*.}"
ERR=""

case "$EXT" in
  json)
    ERR=$(jq empty "$F" 2>&1 | head -n 3)
    ;;
  py)
    ERR=$(python3 -c 'import ast,sys; ast.parse(open(sys.argv[1],encoding="utf-8").read())' "$F" 2>&1 | tail -n 2)
    ;;
  sh|bash|zsh|dash)
    ERR=$(bash -n "$F" 2>&1 | head -n 3)
    ;;
  js|mjs|cjs)
    ERR=$(node --check "$F" 2>&1 | head -n 5)
    ;;
  ts|mts|cts|tsx)
    # Walk up from the file to find a project-local tsc; skip if none (no false
    # positives from a global tsc with wrong config).
    TSC=""
    d="$(dirname "$F")"
    for _ in 1 2 3 4 5 6; do
      if [ -x "$d/node_modules/.bin/tsc" ]; then TSC="$d/node_modules/.bin/tsc"; break; fi
      [ "$d" = "/" ] && break
      d="$(dirname "$d")"
    done
    if [ -n "$TSC" ]; then
      ERR=$("$TSC" --noEmit --skipLibCheck --target esnext --module esnext \
            --moduleResolution bundler --jsx preserve --allowJs false "$F" 2>&1 \
            | grep 'error TS' \
            | grep -Ev 'TS2307|TS2304|TS2792|TS7016|TS6133|TS6192|TS5107' \
            | head -n 5)
    fi
    ;;
  *)
    exit 0
    ;;
esac

if [ -n "$ERR" ]; then
  # PostToolUse exit 2: stderr is fed back to Claude (edit already applied, so
  # this is a feedback loop, not a block).
  printf 'SYNTAX ERROR in %s after %s:\n%s\nFix this now before continuing.\n' "$F" "$TOOL_NAME" "$ERR" >&2
  exit 2
fi
exit 0
