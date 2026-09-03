---
description: Conduct a five-axis code review — correctness, readability, architecture, security, performance
---

For deep reviews, dispatch the code-reviewer persona (and security-auditor for security-critical changes). Mechanical pass first:

```bash
qlty check            # diff-aware: only your branch's changes
difft main...HEAD     # structural diff — moves/renames render correctly
```

Review the current changes (staged or recent commits) across all five axes:

1. **Correctness** — Does it match the spec? Edge cases handled? Tests adequate?
2. **Readability** — Clear names? Straightforward logic? Well-organized?
3. **Architecture** — Follows existing patterns? Clean boundaries? Right abstraction level? (Event mediator/composition over inheritance; close to the metal)
4. **Security** — Input validated? Secrets safe? Auth checked? (dispatch security-auditor for auth/crypto/input changes)
5. **Performance** — No N+1 queries? No unbounded ops?

Categorize findings as Critical, Important, or Suggestion. Output a structured review with specific file:line references and fix recommendations. Every Critical/Important finding includes the fix.
