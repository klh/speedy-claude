#!/bin/bash
# ~/.claude/hooks/edit-enforce.sh
# PreToolUse(Bash) guard: block fragile shell-based file edits and nudge toward
# the Edit/Write tools, which are context-anchored, diffed, and (acceptEdits)
# prompt-free. History: models used `cat >> f <<EOF` and `python3 - <<EOF`
# rewriters to dodge permission prompts — untracked, unverified, fragile.
#
#   DENY  (hard block): cat > / cat >> file writes, sed -i / perl -i in-place
#   NUDGE (advisory)  : python/node heredoc mutators, echo/printf > file
#   EXEMPT           : /tmp, $TMPDIR, /dev/* (throwaway scaffolding is fine)
set -uo pipefail

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
[ "$TOOL_NAME" = "Bash" ] || { echo '{}'; exit 0; }
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -n "$CMD" ] || { echo '{}'; exit 0; }

deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}
nudge() {
  jq -nc --arg m "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$m}}'
  exit 0
}

# Word-boundary prefix: command head of a segment, not part of a larger word
# (so "man cat" or ".catch" never match, but "| cat", "; cat", "$$( cat" do).
HEAD='(^|[^A-Za-z0-9_.-])'

# Segment-start prefix for the hard denials: begin of command, or after a
# shell separator (; & | && ||) or subshell open. Prevents false denies when
# the pattern appears inside quoted prose — e.g. a git commit message that
# *mentions* "sed -i" or "cat >>" is data, not an executed command.
SEG='(^|[;&|(][[:space:]]*)'

if printf '%s' "$CMD" | grep -Eq '/tmp/|\$TMPDIR|/dev/(null|stdout|stderr)'; then
  echo '{}'; exit 0   # throwaway targets — allow
fi

# 1. cat writing to a file (incl. heredoc appends) — the exact pattern from the
#    user's complaint. Write/Edit tools instead.
if printf '%s' "$CMD" | grep -Eq "${SEG}cat ([^|]*[[:space:]])?>>?[[:space:]]*[^|>&[:space:]]+"; then
  deny "Shell file-write via cat. Use Write (new/whole file) or Edit (insert/append with unique context anchor) — both are prompt-free, diff-tracked, and syntax-checked post-edit (CLAUDE.md 'File Editing Rules')."
fi

# 2. In-place mutation via sed -i / perl -i — use sd or Edit instead.
if printf '%s' "$CMD" | grep -Eq "${SEG}(sed|perl)[[:space:]][^|]*-i([^A-Za-z]|$)"; then
  deny "sed -i / perl -i in-place edit. Use Edit (surgical change) or sd (bulk literal/regex replace). BSD sed -i quoting is also error-prone on macOS."
fi

# 3. Heredoc-fed interpreter for file rewriting — advisory.
if printf '%s' "$CMD" | grep -Eq "${HEAD}(python3?|node|deno|bun)([[:space:]]+-)?[[:space:]]*<<"; then
  nudge "Inline interpreter heredoc: if it mutates files, switch to Edit/Write (context-anchored + syntax-checked). Pure compute/read heredocs: ignore this."
fi

# 4. echo/printf generating file content — advisory (Write is atomic + checked).
if printf '%s' "$CMD" | grep -Eq "${HEAD}(echo|printf)[[:space:]][^>|&]*>>?[[:space:]]*[^>|&[:space:]]"; then
  nudge "Generating file content via echo/printf redirect — prefer the Write tool (one atomic, syntax-checked edit). Capturing command output (cmd > file) is fine."
fi

echo '{}'
exit 0
