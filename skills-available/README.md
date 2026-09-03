# Optional skills (not installed by default)

These ship with the repo but are **not active** — each was either never used in
real sessions or duplicates a preferred variant. Claude Code only scans
`skills/`, so parked skills cost zero context. Restore any of them with:

```bash
git mv skills-available/<name> skills/
```

## Why each group was parked (2026-09-03 audit)

| Group | Skills | Reason |
|---|---|---|
| Meta skill | `using-agent-skills`, `all skills` | Fired on every prompt; guidance absorbed into CLAUDE.md "Operating Style". Session-start hook no longer injects it |
| Unused workflow guides | `api-and-interface-design`, `ci-cd-and-automation`, `code-documenter`, `code-review-and-quality`, `code-simplification`, `debugging-and-error-recovery`, `deprecation-and-migration`, `documentation-and-adrs`, `frontend-ui-engineering`, `idea-refine`, `incremental-implementation`, `performance-optimization`, `planning-and-task-breakdown`, `security-and-hardening`, `shipping-and-launch` | Never invoked in months of session telemetry (`skillUsage`); ~60% of every session's fixed context cost with zero value |
| Duplicate of klh-* variant | `testing-patterns` | If you install the companion [klh/skills](https://github.com/klh/skills) repo, prefer `klh-testing-patterns` |

## Active set (19)

`agents-md` · `browser-testing-with-devtools` · `cli-speed-tools` ·
`code-simplifier` · `context-engineering` · `core-components` · `find-bugs` ·
`find-skills` · `git-workflow-and-versioning` · `lit-dev` ·
`openapi-directory-first` · `project-memory` · `settings-audit` ·
`skill-lookup` · `spec-driven-development` · `systematic-debugging` ·
`test-driven-development` · `zod-validation` · `zod4`

> If you also install **klh/skills** (`npx skills add klh/skills -g -y`), you
> get `klh-` prefixed twins of several of these — keep the klh versions and
> park the base ones (they are byte-identical plus cross-links).
