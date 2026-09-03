#!/bin/bash
# agent-skills session start hook — compact pointer (2026-09-03 cleanup).
# The full using-agent-skills meta-skill was retired: the skill list already
# lives in the system prompt, and CLAUDE.md carries the CLI-tool rules.
# Keep this injection to 3 lines max — it runs on EVERY session start.

{
  printf 'Speedy-claude loaded. Fast CLI tools per CLAUDE.md (eza/fd/rg/bat/sd/ast-grep); structural edits via ast-grep; qlty check before claiming done. Parked skills: ~/.claude/skills-available/ (see its README).\n'
} | jq -Rs '{priority:"INFO", message:.}'
