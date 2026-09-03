---
name: csharp-best-practice
description: >
  review c# code and planning work against common c# conventions for formatting, naming, structure, testing, and tooling. use when the user asks for idiomatic c#, csharp code review, c# refactoring guidance, c# project structure, or c# tooling such as analyzers, editorconfig, or xunit.
---

# C# Best Practice

Use this skill to review or improve C# work using common ecosystem conventions instead of ad hoc local habits.

## Intent Router

| Need | Load |
| --- | --- |
| core conventions, tooling defaults, and review checklist for C# | `references/best-practices.md` |

## Quick Start

1. Confirm the target version, dialect, runtime, framework, or vendor before recommending changes.
2. Prefer existing project conventions when they are already enforced and internally consistent.
3. Apply the default guidance in `references/best-practices.md` for naming, structure, testing, and tooling.
4. Recommend the smallest change set that improves clarity, safety, and maintainability.

## Workflow

- Identify the runtime, dialect, or host environment before making specific recommendations.
- Separate language-level guidance from framework-, vendor-, or platform-specific conventions.
- Prioritize correctness, readability, changeability, and operability before micro-optimizations.
- Note the automation path: formatter, linter, type checker, compiler flags, or test runner.
- Call out the highest-leverage refactors first instead of producing style-only churn.

## Typical Focus Areas

- naming, layout, and public API clarity
- boundary handling, state management, and error paths
- dependency direction, module structure, and test seams
- tooling, CI checks, and repeatable local verification
- performance, portability, or safety constraints only when they materially affect the design

## Outputs to Prefer

- summarize the governing constraints before detailed recommendations
- group findings by severity, maintenance impact, or migration effort
- recommend concrete edits, checks, or follow-up tests
- preserve externally visible behavior unless the request explicitly allows semantic changes

## Common Requests

```text
Review this C# module for idiomatic structure, naming, boundary handling, and test gaps.
```

```text
Refactor this C# snippet to follow common C# best practice without changing behavior.
```

## Verification and Follow-Through

- verify the recommendation with the formatter, linter, compiler, or test command named in `references/best-practices.md`
- call out which behavior must remain unchanged before suggesting stylistic cleanup
- recommend one or two concrete checks that prove the refactor improved clarity, safety, or maintainability
- preserve enforced repository conventions when they intentionally differ from the default baseline

## Recovery Cues

- if the runtime, dialect, framework, or vendor is unknown, give the safest default and name the missing fact that would narrow the advice
- if project automation already enforces a competing convention, follow the enforced rule and explain the exception
- if correctness bugs and style issues are mixed together, fix correctness and observability first, then return to style

## Safety Notes

- do not force ecosystem migration unless the current stack is clearly blocking maintainability
- avoid style-only churn in legacy code that is otherwise stable
- preserve externally visible behavior unless the user asks for breaking changes
