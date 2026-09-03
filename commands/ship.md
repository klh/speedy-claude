---
description: Run the pre-launch checklist and prepare for production deployment
---

Run the complete pre-launch checklist — mechanical checks as commands, judgment as review:

1. **Code Quality** — `qlty check --all` clean · tests pass · build clean · no TODOs · no console.logs
2. **Security** — `gitleaks git . --redact` clean · no secrets in code · auth in place · headers configured
3. **Performance** — Core Web Vitals good · no N+1 queries · bundle sized
4. **Accessibility** — keyboard nav · screen-reader compatible · contrast ≥ 4.5:1 (dispatch minimalist-designer for UI work)
5. **Infrastructure** — env vars documented (never committed) · migrations ready · monitoring configured
6. **Documentation** — README current · changelog updated · API contract regenerated if endpoints changed (klh-zod-validation skill, references/openapi.md)

Report failing checks and resolve before deployment. Define the rollback plan first. Push is secrets-gated (gitleaks history scan) — rotate anything flagged, don't --no-verify past a real finding.
