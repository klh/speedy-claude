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
narration. **Cycle output is 3–6 lines max, changed fields only; expand only
on ERROR/BLOCKED/DECISION.** The control plane already knows the details —
query it, don't narrate it:

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

### Cooperative preemption (pause / reroute / resume)
```bash
coord pause <sid> --reason "incoming contract change" --scope src/auth --intervention "LiveController API rewrite"
# lane hits a safe boundary → checkpoints, writes its capsule, then waits:
coord capsule set --as <sid> --task=live4 --checkpoint=91ab72c --base=f30b910 --step="rewiring host" --next="MediaMonitor bindings" --assumptions="applyPreview unchanged"
# in-band change lands, then:
coord resume <sid> --onto <new-head> --note "applyPreview: (x) → (x, ctx); MediaMonitor → factory"
```
- `coord state --as <sid>` between tool rounds: run/PAUSED + inbox count + integration HEAD. PAUSE_REQUESTED goes out the moment the coordinator knows a collision is coming — the lane checkpoints early instead of working past the intervention.
- Continuation capsule (facts `lane.<sid>.capsule`): task, checkpoint, base, step, next, assumptions — the minimum restart packet; also survives session compaction.
- Claims while paused default to SOFT (other lanes may drift in, drift-logged); hot-mark the scope only if the intervention must exclude everyone.
- PAUSE intends to continue this exact lane (capsule kept); STOP supersedes it (commits/facts remain, capsule dropped).
- resume_ready carries the delta summary — the lane updates its worktree onto the new integration HEAD, reruns targeted tests, continues. Reconciliation conflict → repair path.

### Work Graph (operational state lives here — never in Markdown)
- Session start: `coord bootstrap --as <sid> --role coordinator|worker` → identity + OWNED + READY pool + inbox + head
- Register active/blocked/queued work: `work add <title> --scope <scope> --by <sid>` — the graph is partitioned per project (repo root)
- Take before implementing: `work take <id> --as <sid>` (CAS; a lost race is informational — pick another)
- Parallelizable? `work split <id> "t1" "t2" ... --reason independent-scopes --keep 1` — splitter keeps one child; idle lanes take from `work ready`
- Progress: `work done <id> --sha <sha>` — SHATTERED parents roll up automatically; scope claim auto-releases
- Ownership: `work mine --as <sid>` / `work owned` · stale owner: `work orphaned` → inspect capsule → `work reclaim <id>`
- Restart: `claude -c` auto-rebinds ownership on SessionStart (resume); verify with `coord doctor-session <sid>` - no live state may point at a closed predecessor
- Spawn gate: READY work exists + fleet under target + rate headroom + acceptable coupling -> spawn; high coupling = review/test lanes, never more implementation lanes
- Markdown carries architecture/spec/decisions only — never live task state

### Consults (questions, not work)
- Discover: `coord who-knows "query" [--scope src/x]` - ranks live sessions by recent claims / DONE work / scope touches; contextual beats nominal
- Ask: `coord consult --best "<question>" [--scope s] --as <sid>` -> expert inbox gets `? C## from <asker>`; reply `coord consult-reply C## "<answer>" --as <expert>` (or `--decline`)
- A consult never claims scope, never pauses a lane, never creates work. WORK = implement / CONSULT = answer / HANDOFF = take ownership. Cross-session questions use native @session messaging with who-knows for discovery.

### Claims
- Every lane registers via `claim add <sid> <scope...> --intent "..."` at
  spawn; shared areas get BOTH lanes' claims; hot-mark only after an observed
  collision
- Lanes report `{base SHA, commit SHA, changed paths, test status}` — the
  coordinator operates on immutable commits, never working dirs
- `claim doctor` after fleet drains

### Exit invariant (before EXIT)
- Every actionable item exists as a Work Graph item (READY/BLOCKED) - never only in prose/Markdown; every WIP patch or worktree is referenced by an item
- Claims released; state preserved in events/capsules; terse EXIT only: head, tree, work, wip, claims
- A stopped session's items stay owned until rebound or `work reclaim`ed - never silently re-queued

### Coupling rule
Deeply coupled work = ONE implementation lane + parallel review/test lanes.
4 independent lanes > 8 coupled ones.
