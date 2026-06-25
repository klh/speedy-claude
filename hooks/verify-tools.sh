#!/bin/bash
# ~/.claude/hooks/verify-tools.sh — re-runnable speedy-claude health check.
# Checks: CLI tools on PATH, skills, global CLAUDE.md rules, settings.json wiring.
# Usage: bash ~/.claude/hooks/verify-tools.sh
set -uo pipefail
C="${HOME}/.claude"
pass=0; fail=0; failed=""

note_ok() { pass=$((pass+1)); }
note_fail() { echo "  ✗ $1"; fail=$((fail+1)); failed="$failed $1"; }

echo "=== CLI speed tools on PATH ==="
for t in fd rg bat batgrep batdiff sd difft tree jq delta hyperfine dust tokei eza zoxide broot procs btm aria2c lazygit act actionlint shellcheck git-standup fswatch watchexec xcp gum micro tldr serve mkcert ambr ambs sad; do
  if command -v "$t" >/dev/null 2>&1; then pass=$((pass+1)); else note_fail "$t MISSING"; fi
done
# lazygit is sometimes shadowed by a zsh function; verify the real binary too.
if command -v lazygit >/dev/null 2>&1 || [ -x /opt/homebrew/bin/lazygit ]; then pass=$((pass+1)); else note_fail "lazygit binary MISSING"; fi

echo "=== Skills ==="
n=$(fd -t d . "$C/skills" --maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
echo "  skill dirs: $n (expect 37)"

echo "=== Global rules ==="
test -f "$C/CLAUDE.md"                    && note_ok || note_fail "CLAUDE.md present"
rg -q 'Avoid' "$C/CLAUDE.md" 2>/dev/null  && note_ok || note_fail "CLAUDE.md Avoid/Use table"
test -f "$C/skills/cli-speed-tools/SKILL.md" && note_ok || note_fail "cli-speed-tools skill"
test -f "$C/skills/using-agent-skills/SKILL.md" && note_ok || note_fail "using-agent-skills skill"

echo "=== settings.json ==="
jq empty "$C/settings.json" 2>/dev/null && note_ok || note_fail "settings.json valid JSON"
jq -e '.hooks.SessionStart[].hooks[].command' "$C/settings.json" 2>/dev/null | grep -q session-start.sh && note_ok || note_fail "SessionStart hook wired"
jq -e '.hooks.PreToolUse[].hooks[].command' "$C/settings.json" 2>/dev/null | grep -q tool-enforce.sh && note_ok || note_fail "PreToolUse enforce hook"
jq -e '.permissions.allow | length >= 20' "$C/settings.json" >/dev/null 2>&1 && note_ok || note_fail "permissions.allow allowlist"
jq -e '.env.ANTHROPIC_AUTH_TOKEN != null' "$C/settings.json" >/dev/null 2>&1 && note_ok || note_fail "auth token preserved"

echo ""
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ] && echo "✅ speedy-claude healthy" || echo "⚠️  $fail issue(s):$failed"
exit 0
