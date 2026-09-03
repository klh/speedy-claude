---
description: Run TDD workflow — write failing tests, implement, verify. For bugs, use the Prove-It pattern.
---

Invoke the test-driven-development skill. For Jest work, also use klh-testing-patterns.

For new features:

1. Write tests that describe the expected behavior (they should FAIL)
2. Implement the code to make them pass
3. Refactor while keeping tests green

For bug fixes (Prove-It pattern):

1. Write a test that reproduces the bug (must FAIL)
2. Confirm the test fails
3. Implement the fix — root cause only, no drive-by refactors
4. Confirm the test passes
5. Run the full test suite for regressions (`npm test` / `dotnet test` — both allowlisted, no prompts)

For browser-related issues, use the browser-testing-with-devtools skill with the chrome-devtools MCP. Evidence before assertions: attach real command output when declaring anything green.
