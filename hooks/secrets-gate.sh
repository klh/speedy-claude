#!/bin/bash
# ~/.claude/hooks/secrets-gate.sh — v4 (segmenter, 2026-09-03)
# No regex against shell. A quote-aware single-pass segmenter splits the
# command into ;&| segments (quotes consumed — co"mmit" IS commit by
# construction); gate logic is plain word comparison. One jq call total.
set -uo pipefail

INPUT="$(cat)"
IFS=$'\t' read -r TOOL CMD CWD < <(jq -r '[.tool_name // "", .tool_input.command // "", .cwd // ""] | @tsv' <<<"$INPUT" 2>/dev/null)
[ "$TOOL" = "Bash" ] || { echo '{}'; exit 0; }
[ -n "$CMD" ] || { echo '{}'; exit 0; }

command -v gitleaks >/dev/null 2>&1 || { echo '{}'; exit 0; }

deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# --- quote-aware segmenter: prints one ;&|-delimited command segment per line.
# Quote chars are consumed (never segment boundaries, never word chars), so
# quote-splitting tricks normalize away. Parentheses also start new segments
# (subshells). ~1-3ms for typical command lengths. ---
segments() {
  local cmd="$1" q="" seg="" c i
  for ((i = 0; i < ${#cmd}; i++)); do
    c="${cmd:i:1}"
    if [ -n "$q" ]; then
      seg+="$c" # quoted chars are CONTENT: kept, never boundaries
      [ "$c" = "$q" ] && q=""
      continue
    fi
    case "$c" in
      '"' | "'") q="$c" ;; # quote marks themselves are dropped
      ';' | '&' | '|' | '(' | ')')
        [ -n "$seg" ] && printf '%s\n' "$seg"
        seg=""
        ;;
      *) seg+="$c" ;;
    esac
  done
  [ -n "$seg" ] && printf '%s\n' "$seg"
}

IS_COMMIT=0; IS_PUSH=0; REPO_DIR="${CWD:-$HOME}"
SEGS="$(segments "$CMD")"

# --no-verify seen as a bare flag anywhere = agent policy deny
case "$SEGS" in
*--no-verify*) deny "secrets-gate: --no-verify in an agent command is denied by policy. If you are the USER, run the git command in your own terminal." ;;
esac

while IFS= read -r seg; do
  # strip leading VAR=value assignments (env prefixes) before the verb
  while :; do
    case "$seg" in
      [A-Za-z_]*=*) next="${seg#* }"; [ "$next" = "$seg" ] && seg="" || seg="$next" ;;
      *) break ;;
    esac
    [ -z "$seg" ] && break
  done
  [ -n "$seg" ] || continue
  first="${seg%% *}"
  rest=""
  [ "$first" != "$seg" ] && rest="${seg#* }"
  [ "$first" = "git" ] || continue

  # word walk for the rest: detect commit/push + capture -C dir / --git-dir=
  args="$rest"
  while [ -n "$args" ]; do
    a="${args%% *}"
    [ "$a" = "$args" ] && args="" || args="${args#* }"
    case "$a" in
      commit) IS_COMMIT=1 ;;
      push) IS_PUSH=1 ;;
      -C)
        if [ -n "$args" ]; then
          t="${args%% *}"; args="${args#* }"
          case "$t" in /*) REPO_DIR="$t" ;; *) REPO_DIR="$REPO_DIR/$t" ;; esac
        fi
        ;;
      --git-dir=*) REPO_DIR="${a#--git-dir=}" ;;
    esac
  done
done <<<"$SEGS"

((IS_COMMIT + IS_PUSH)) || { echo '{}'; exit 0; }

cd "$REPO_DIR" 2>/dev/null || { echo '{}'; exit 0; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo '{}'; exit 0; }

if ((IS_COMMIT)); then
  gitleaks protect --staged --redact --no-banner >/dev/null 2>&1 ||
    deny "gitleaks found secrets in STAGED content. Remove the secret (rotate if real). --no-verify is not available to agents."
fi
if ((IS_PUSH)); then
  gitleaks git . --redact --no-banner >/dev/null 2>&1 ||
    deny "gitleaks found secrets in commit history headed for the remote. Rotate the credential and rewrite/purge history. --no-verify is not available to agents."
fi

echo '{}'
exit 0
