#!/bin/bash
# ~/.claude/hooks/md-format.sh
# PostToolUse(Edit|Write|NotebookEdit) for .md files: auto-format with prettier
# (GitHub-flavored markdown by default — aligns table pipes, normalizes list
# markers, spacing, code fences). Prose is preserved (no rewrapping).
# Runs AFTER the write lands; reports a one-line note when it changed anything.
set -uo pipefail

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
case "$TOOL_NAME" in
  Edit|Write|NotebookEdit) ;;
  *) exit 0 ;;
esac

F="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null || true)"
[ -n "$F" ] && [ -f "$F" ] || exit 0

case "${F##*.}" in
  md|markdown) ;;
  *) exit 0 ;;
esac

command -v prettier >/dev/null 2>&1 || exit 0   # formatter missing — skip silently

BEFORE="$(cksum "$F" | cut -d' ' -f1)"
prettier --write --prose-wrap preserve --log-level warn "$F" >/dev/null 2>&1
AFTER="$(cksum "$F" | cut -d' ' -f1)"

if [ "$BEFORE" != "$AFTER" ]; then
  printf 'md-format: reformatted %s with prettier (GFM: table alignment, list markers, fence style). Re-read before further edits.\n' "$F" >&2
  exit 2   # feeds the note back to the agent so it knows the file changed
fi
exit 0
