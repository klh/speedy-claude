---
description: Implement the next task incrementally — build, test, verify, commit
---

Invoke the klh-systematic-debugging skill if anything breaks; use ast-grep for identifier-shaped changes and sd/ambr for mechanical ones.

Pick the next pending task from the plan. For each task:

1. Read the task's acceptance criteria
2. Load relevant context (existing code, patterns, types)
3. Write a failing test for the expected behavior (RED)
4. Implement the minimum code to pass the test (GREEN)
5. Run the full test suite to check for regressions
6. Run the build/typecheck to verify compilation (`npx tsc --noEmit` / `dotnet build`)
7. Commit with a descriptive message (gitleaks scans staged content — rotate anything it flags)
8. Mark the task complete and move to the next one

Cadence rules: verify every 3rd edit to the same file (run/build then, not after the 5th). More than 5 planned changes to one file = re-read once, single whole-file Write. Every edit is syntax-checked automatically post-write; fix reported errors before continuing.
