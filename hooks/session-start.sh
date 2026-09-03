#!/bin/bash
# agent-skills session start hook — compact pointer (2026-09-03 cleanup).
# The full using-agent-skills meta-skill was retired: the skill list already
# lives in the system prompt, and CLAUDE.md carries the CLI-tool rules.
# Keep this injection to 3 lines max — it runs on EVERY session start.

{
  printf 'Speedy-claude loaded. Fast CLI tools per CLAUDE.md (eza/fd/rg/bat/sd/ast-grep); structural edits via ast-grep; qlty check before claiming done. Parked skills: ~/.claude/skills-available/ (see its README).\n'
  # Surface un-reviewed performance insights if any are pending
  if [ -s "$HOME/.claude/insights/PENDING.md" ]; then
    printf 'NEW INSIGHTS PENDING: ~/.claude/insights/PENDING.md is non-empty — read it, apply or decline its prescriptions, then clear the file.\n'
  fi
} | jq -Rs '{priority:"INFO", message:.}'
