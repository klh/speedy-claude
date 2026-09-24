# Coordination protocol — ready-to-copy CLAUDE.md for a multi-agent repo

Drop this into a repo's `CLAUDE.md` (or AGENTS.md) to bind the coordinator and
all lanes to the converged architecture. Requires the control plane installed
(`hooks/bin/claim.ts`, `hooks/bin/coord.ts`, `hooks/lib/govdb.ts` + the
keepwarm launchd agent — see [README](../README.md#multi-agent-coordination--the-converged-architecture)).

## Multi-agent coordination protocol (binding for the coordinator and all lanes)

### Output: delta-only
Emit only **state changes**, in this shape:

```text
Δ
MERGED  lane → sha
SPAWNED lane (why)
ALERT   one line
EXIT    blocked/ok (reason)   ← only when it changed
```

Never print: unchanged fleet state, step-by-step narration, full diffs,
passing test details (`GATE: PASS` suffices — expand only on FAIL), repeated
exit reasons, "no drift"/"no new defects" silence-confirmations, tool
narration. The control plane already knows the details — query it, don't
narrate it:

```bash
bun ~/.claude/bin/coord.ts fact set integration.head <sha> --source coordinator
bun ~/.claude/bin/coord.ts emit landed --scope <scope> --sha <sha> --as <sid>
```

### Event bus over prose
- Checkpoint commits (every 10-20 min): `coord emit checkpoint --sha <sha> --as <sid>`
- Landings: `coord emit landed ...` + `coord fact set integration.head <sha>`
- Lanes waiting on another lane: `coord wait --as <sid> --scope <other-scope> --max-seconds 600`
  (adaptive 250ms→2s backoff, instant wake)
- **Direct messages are interrupts-only**: STOP, CONFLICT, DEPENDENCY_CHANGED,
  NEED_DECISION. Everything else is a `coord` event/fact.

### Lane completion reports (delta-only, one source of truth)
The machine event IS the report — the coordinator renders prose from it:

```bash
coord emit landed --sha <sha> --gate=pass --as <sid>       # success (defaults: unstated = normal)
coord emit landed --sha <sha> --gate=pass --artifact=fresh --driveby=row36 --as <sid>
coord emit blocked --scope <scope> --as <sid> --note "expected 28, passed 22 — cause one-liner"
```

Human rendering stays terse — success needs only deviations:

```text
DONE <sha>
DONE <sha> artifact=fresh driveby=row36
BLOCKED <scope> 22/28 stitchRender host contract
```

Never narrate implementation history, never repeat test counts on success,
never include prose evidence when a structured field exists. Exact counts go
to facts/logs, not the report.

### Integration ladder
- Per-lane: cheap targeted checks
- Per-merge: qlty + affected tests, merged onto integration HEAD — a lane is
  only done when the merge is green
- Final battery: once, after ~60s integration silence; mark in-flight results
  stale instead of restarting them
- Deterministic checks (build/qlty/tests) are process jobs with results in
  `coord fact` — launch a repair agent only on FAIL
- Conflicts → repair agent in a disposable worktree; never wake both origin
  lanes

### Claims
- Every lane registers via `claim add <sid> <scope...> --intent "..."` at
  spawn; shared areas get BOTH lanes' claims; hot-mark only after an observed
  collision
- Lanes report `{base SHA, commit SHA, changed paths, test status}` — the
  coordinator operates on immutable commits, never working dirs
- `claim doctor` after fleet drains

### Coupling rule
Deeply coupled work = ONE implementation lane + parallel review/test lanes.
4 independent lanes > 8 coupled ones.
