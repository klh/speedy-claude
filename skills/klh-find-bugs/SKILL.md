---
name: klh-find-bugs
description: Find bugs, security vulnerabilities, and code quality issues in local branch changes. Use when asked to review changes, find bugs, security review, or audit code on the current branch.
---

# Find Bugs

> Part of [klh/skills](https://github.com/klh/skills) — personal agent skills by [Klaus L. Hougesen](https://github.com/klh).
> Install: `npx skills add klh/skills --skill klh-find-bugs`

## Overview

Finds bugs, security vulnerabilities, and code quality issues in local branch changes.

## When to Use

- When asked to review changes or find bugs
- When performing a security review or code audit on the current branch

Review changes on this branch for bugs, security vulnerabilities, and code quality issues.

## Phase 1: Complete Input Gathering

1. Get the FULL diff: `git diff $(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')...HEAD`
2. If output is truncated, read each changed file individually until you have seen every changed line
3. List all files modified in this branch before proceeding

## Phase 2: Attack Surface Mapping

For each changed file, identify and list:

* All user inputs (request params, headers, body, URL components)
* All database queries
* All authentication/authorization checks
* All session/state operations
* All external calls
* All cryptographic operations

## Phase 3: Security Checklist (check EVERY item for EVERY file)

* [ ] **Injection**: SQL, command, template, header injection
* [ ] **XSS**: All outputs in templates properly escaped?
* [ ] **Authentication**: Auth checks on all protected operations?
* [ ] **Authorization/IDOR**: Access control verified, not just auth?
* [ ] **CSRF**: State-changing operations protected?
* [ ] **Race conditions**: TOCTOU in any read-then-write patterns?
* [ ] **Session**: Fixation, expiration, secure flags?
* [ ] **Cryptography**: Secure random, proper algorithms, no secrets in logs?
* [ ] **Information disclosure**: Error messages, logs, timing attacks?
* [ ] **DoS**: Unbounded operations, missing rate limits, resource exhaustion?
* [ ] **Business logic**: Edge cases, state machine violations, numeric overflow?

## Phase 4: Verification

For each potential issue:

* Check if it's already handled elsewhere in the changed code
* Search for existing tests covering the scenario
* Read surrounding context to verify the issue is real

## Phase 5: Pre-Conclusion Audit

Before finalizing, you MUST:

1. List every file you reviewed and confirm you read it completely
2. List every checklist item and note whether you found issues or confirmed it's clean
3. List any areas you could NOT fully verify and why
4. Only then provide your final findings

## Output Format

**Prioritize**: security vulnerabilities > bugs > code quality

**Skip**: stylistic/formatting issues

For each issue:

* **File:Line** - Brief description
* **Severity**: Critical/High/Medium/Low
* **Problem**: What's wrong
* **Evidence**: Why this is real (not already fixed, no existing test, etc.)
* **Fix**: Concrete suggestion
* **References**: OWASP, RFCs, or other standards if applicable

If you find nothing significant, say so - don't invent issues.

Do not make changes - just report findings. I'll decide what to address.

## Five Failure Modes

Every review must explicitly check for these:

1. **Hallucinated actions** — invented file paths, env vars, API endpoints, or function names that don't exist
2. **Scope creep** — files changed or behaviors modified outside the stated scope
3. **Cascading errors** — silent fallbacks, swallowed exceptions, or default values masking real failures
4. **Context loss** — new code contradicts earlier decisions or existing patterns in the codebase
5. **Tool misuse** — wrong tool for the job, or right tool with wrong parameters

For each failure mode, ask: "Is there evidence this happened here?"

## Integration with Other Skills

- **klh-systematic-debugging** — use find-bugs for initial audit, then klh-systematic-debugging for root cause analysis
- **klh-code-simplifier** — simplify flagged code patterns after identifying bugs