# Optional skills (not installed by default)

These ship with the repo but are **not active** — each was either never used in
real sessions or duplicates a preferred variant. Claude Code only scans
`skills/`, so parked skills cost zero context. Restore any of them with:

```bash
git mv skills-available/<name> skills/
```

## Why each group was parked (2026-09-03 audit)

| Group                      | Skills                                                                                                                                                                                                                                                                                                                                                                                             | Reason                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Meta skill                 | `using-agent-skills`, `all skills`                                                                                                                                                                                                                                                                                                                                                                 | Fired on every prompt; guidance absorbed into CLAUDE.md "Operating Style". Session-start hook no longer injects it                                     |
| Unused workflow guides     | `api-and-interface-design`, `ci-cd-and-automation`, `code-documenter`, `code-review-and-quality`, `code-simplification`, `debugging-and-error-recovery`, `deprecation-and-migration`, `documentation-and-adrs`, `frontend-ui-engineering`, `idea-refine`, `incremental-implementation`, `performance-optimization`, `planning-and-task-breakdown`, `security-and-hardening`, `shipping-and-launch` | Never invoked in months of session telemetry (`skillUsage`); ~60% of every session's fixed context cost with zero value                                |
| Duplicate of klh-* variant | `testing-patterns`                                                                                                                                                                                                                                                                                                                                                                                 | If you install the companion [klh/skills](https://github.com/klh/skills) repo, prefer `klh-testing-patterns`                                           |
| Duplicate of active skill  | `find-skills`                                                                                                                                                                                                                                                                                                                                                                                      | Same job as active `skill-lookup` (discover + install skills)                                                                                          |
| Subtopic of active skill   | `csharp-docstrings`                                                                                                                                                                                                                                                                                                                                                                                | XML doc comments are handled on demand inside `csharp-best-practice` (kept — active .NET work); restore if a repo enforces strict doc-comment coverage |

## Merged, not parked (2026-09-03)

`zod-openapi` was merged INTO `skills/klh-zod-validation/references/openapi.md` rather than parked — runtime validation and contract derivation are one workflow over the same validators. `skills/zod4/SKILL.md` and `commands/ship.md` point there now.

## Kept deliberately (do not re-flag in future audits)

- `sql-best-practice` — SQL style/tuning is a distinct axis from `sqlite` (file operations); both earn their slot (heavy sqlite3 usage in session telemetry)
- `csharp-best-practice` — user works in .NET repos (verified usage)

## Active set

Whatever is in `skills/` — 35 skills as of 2026-09-03. The annotated table lives in CLAUDE.md's _Available Skills Quick Reference_.

> If you also install **klh/skills** (`npx skills add klh/skills -g -y`), you
> get `klh-` prefixed twins of several of these — keep the klh versions and
> park the base ones (they are byte-identical plus cross-links).
