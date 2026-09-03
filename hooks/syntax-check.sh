#!/bin/bash
# ~/.claude/hooks/syntax-check.sh
# PostToolUse(Edit|Write|NotebookEdit): syntax-validate the file just edited,
# by extension, and feed failures back to Claude so they are fixed immediately.
# Silent (exit 0, no output) when the file passes or the type has no checker.
#
# 2026-09-03 upgrade (measured on this machine, hyperfine, cold start):
#   json   jq empty                 3.2ms   (jsonc -> biome lint)
#   yaml   yq e '.' >/dev/null      6.3ms
#   ts/tsx esbuild --outfile=/dev/null  6.8ms  (parse-only; tier 2 = project tsc)
#   css    biome lint               9.5ms
#   toml   taplo check              9.1ms
#   py     ruff check --no-cache    9.6ms   (replaced python3 ast.parse 22.5ms)
#   sh     bash -n                  2.4ms
#   js     node --check            24ms     (or esbuild, faster, ts-safe)
#
# Tier 2 (type errors, slower): when a project-local tsc exists we run it AFTER
# the parse gate passes, and only for .ts — filtered for resolution noise.
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

# Tool availability resolved once (cheap: command -v is a builtin lookup)
have() { command -v "$1" >/dev/null 2>&1; }

case "$EXT" in
  json)
    ERR=$(jq empty "$F" 2>&1 | head -n 3)
    ;;
  jsonc)
    have biome && ERR=$(biome lint "$F" 2>&1 | rg -i 'parse' | head -n 3)
    ;;
  yaml|yml)
    have yq && { yq e '.' "$F" >/dev/null 2>&1 || ERR="invalid YAML: $(yq e '.' "$F" 2>&1 | head -n 2)"; }
    ;;
  toml)
    have taplo && { taplo check "$F" >/dev/null 2>&1 || ERR="invalid TOML: $(taplo check "$F" 2>&1 | head -n 2)"; }
    ;;
  py)
    if have ruff; then
      # exit!=0 may be lint OR syntax; only surface syntax lines (lint noise stays out of the gate)
      ruff check --no-cache "$F" >/dev/null 2>&1 || ERR=$(ruff check --no-cache "$F" 2>&1 | rg -i 'syntax' | head -n 2)
    else
      ERR=$(python3 -c 'import ast,sys; ast.parse(open(sys.argv[1],encoding="utf-8").read())' "$F" 2>&1 | tail -n 2)
    fi
    ;;
  sh|bash|zsh|dash)
    ERR=$(bash -n "$F" 2>&1 | head -n 3)
    ;;
  ts|mts|cts|tsx|jsx|js|mjs|cjs)
    # Tier 1: esbuild parse-only gate — fastest correct gate, TS/TSX/JSX-safe
    if have esbuild; then
      esbuild "$F" --outfile=/dev/null --log-level=error >/dev/null 2>&1 || \
        ERR=$(esbuild "$F" --outfile=/dev/null --log-level=error 2>&1 | head -n 5)
    elif [ "$EXT" = js ] || [ "$EXT" = mjs ] || [ "$EXT" = cjs ]; then
      ERR=$(node --check "$F" 2>&1 | head -n 5)
    else
      ERR=""
    fi
    # Tier 2: real type errors via project-local tsc, only for .ts when parse passed
    if [ -z "$ERR" ] && { [ "$EXT" = ts ] || [ "$EXT" = mts ] || [ "$EXT" = cts ]; }; then
      TSC=""
      d="$(dirname "$F")"
      for _ in 1 2 3 4 5 6; do
        if [ -x "$d/node_modules/.bin/tsc" ]; then TSC="$d/node_modules/.bin/tsc"; break; fi
        [ "$d" = "/" ] && break
        d="$(dirname "$d")"
      done
      if [ -n "$TSC" ]; then
        ERR=$("$TSC" --noEmit --skipLibCheck --target esnext --module esnext \
              --moduleResolution bundler --jsx preserve "$F" 2>&1 \
              | grep 'error TS' \
              | grep -Ev 'TS2307|TS2304|TS2792|TS7016|TS6133|TS6192|TS5107' \
              | head -n 5)
      fi
    fi
    ;;
  css|scss)
    have biome && { biome lint "$F" >/dev/null 2>&1 || ERR=$(biome lint "$F" 2>&1 | head -n 3); }
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
