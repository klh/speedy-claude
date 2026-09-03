#!/bin/bash
# ~/.claude/hooks/secrets-gate.sh
# PreToolUse(Bash) secrets protection: scans staged content at `git commit`
# and outgoing history at `git push` with gitleaks. Denies on findings —
# a leaked token in a public repo is irreversible; a 1-3s scan is cheap.
# Exempts: --no-verify commits (explicit user override), non-git commands.
set -uo pipefail

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
[ "$TOOL_NAME" = "Bash" ] || { echo '{}'; exit 0; }
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -n "$CMD" ] || { echo '{}'; exit 0; }

command -v gitleaks >/dev/null 2>&1 || { echo '{}'; exit 0; }

SEG='(^|[;&|(][[:space:]]*)'
deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)"
cd "${CWD:-$HOME}" 2>/dev/null || true
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo '{}'; exit 0; }

# commit: scan staged content (fast, catches new secrets at entry)
if printf '%s' "$CMD" | grep -Eq "${SEG}git +commit" && ! printf '%s' "$CMD" | grep -q -- '--no-verify'; then
  if ! gitleaks protect --staged --redact --no-banner >/dev/null 2>&1; then
    deny "gitleaks found secrets in STAGED content. Remove the secret (rotate if real), or re-run with --no-verify for an explicit user override."
  fi
fi

# push: scan the repo's commit history (the irreversible outward action)
if printf '%s' "$CMD" | grep -Eq "${SEG}git +push" && ! printf '%s' "$CMD" | grep -q -- '--no-verify'; then
  if ! gitleaks git . --redact --no-banner >/dev/null 2>&1; then
    deny "gitleaks found secrets in commit history headed for the remote. Rotate the credential, rewrite history (or gitignore + purge), or --no-verify to override explicitly."
  fi
fi

echo '{}'
exit 0
