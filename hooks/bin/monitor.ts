// monitor.ts — control-plane health check. Read-only by default; --fix
// applies only SAFE, deterministic repairs. Exit 1 if issues remain.
//
// PRINCIPLE (learned 2026-09-24 the hard way): never auto-fix based on an
// identity we cannot resolve. Lane NAMES (visual-chain, bare-suite2…) have no
// transcript of their own — subagent transcripts are agent-<uuid>.jsonl — so
// transcript-liveness is only decidable for TOP-LEVEL session sids. Checks
// here are therefore ts-based or pure-DB; ownership liveness for lanes is a
// known blind spot (backlog W9), surfaced by `work orphaned` instead.
// usage: bun ~/.claude/bin/monitor.ts [--fix]
import { statSync } from "node:fs";
import { openGovernorDb } from "../lib/govdb.ts";

const db = openGovernorDb();
const now = Date.now();
const fix = process.argv.includes("--fix");
const issues: string[] = [];
const fixed: string[] = [];

// 1. stale RUNNING sessions with dead transcripts (session sids ARE
// transcript filenames — decidable for TOP-LEVEL sessions only; lanes close
// at 24h, their real liveness is backlog W9)
for (const s of db.query("SELECT sid, hb FROM sessions WHERE state = 'RUNNING' AND parent_sid IS NULL AND hb < ?").all(now - 20 * 60_000) as {
	sid: string; hb: number;
}[]) {
	let live = false;
	try {
		const glob = new Bun.Glob(`**/*${s.sid}*.jsonl`);
		for (const rel of glob.scanSync({ cwd: `${process.env.HOME}/.claude/projects`, onlyFiles: true })) {
			try {
				if (statSync(`${process.env.HOME}/.claude/projects/${rel}`).mtimeMs > now - 15 * 60_000) {
					live = true;
					break;
				}
			} catch {}
		}
	} catch {}
	if (!live) {
		if (fix) {
			db.query("UPDATE sessions SET state = 'CLOSED' WHERE sid = ? AND state = 'RUNNING'").run(s.sid);
			fixed.push(`swept stale session ${s.sid.slice(0, 8)} → CLOSED`);
		} else issues.push(`session ${s.sid.slice(0, 8)} RUNNING, hb stale, transcript dead`);
	}
}

// 2. DONE items must not hold an owner (pure DB invariant)
for (const w of db.query("SELECT project, id, owner_sid FROM work_items WHERE state = 'DONE' AND owner_sid IS NOT NULL").all() as {
	project: string; id: string; owner_sid: string;
}[]) {
	issues.push(`${w.project.split("/").pop()?.replace(".git", "")}/${w.id} DONE but still owned by ${w.owner_sid.slice(0, 8)}`);
}

// 3. expired locks (ts-based, safe to sweep)
for (const l of db.query("SELECT path, sid, ts FROM locks WHERE ts < ?").all(now - 15 * 60_000) as {
	path: string; sid: string; ts: number;
}[]) {
	if (fix) {
		db.query("DELETE FROM locks WHERE path = ? AND ts = ?").run(l.path, l.ts);
		fixed.push(`swept expired lock ${String(l.path).slice(0, 50)}`);
	} else issues.push(`expired lock ${String(l.path).slice(0, 50)} (${Math.round((now - l.ts) / 60_000)}m)`);
}

// 4. lane facts must stay inside the preemption state machine
for (const f of db.query("SELECT key, value FROM facts WHERE key LIKE 'lane.%.state'").all() as { key: string; value: string }[]) {
	if (!["RUNNING", "PAUSE_REQUESTED", "PAUSED", "RESUME_READY", "BLOCKED"].includes(f.value)) {
		issues.push(`lane fact ${f.key} = ${f.value} — outside state machine`);
	}
}

// 5. malformed event payloads
for (const e of db.query("SELECT id, payload FROM events ORDER BY id DESC LIMIT 20").all() as { id: number; payload: string | null }[]) {
	if (e.payload) {
		try {
			JSON.parse(e.payload);
		} catch {
			issues.push(`event #${e.id} has malformed payload`);
		}
	}
}

// 6. FOCUS: workload surface per project — health-clean ≠ nothing to do
const projs = db.query("SELECT DISTINCT project FROM work_items WHERE state NOT IN ('DONE','SUPERSEDED') ORDER BY project").all() as { project: string }[];
for (const { project } of projs) {
	const name = project.split("/").pop()?.replace(".git", "") || project;
	const all = db.query("SELECT id, state, owner_sid, title FROM work_items WHERE project = ? AND state NOT IN ('DONE','SUPERSEDED') ORDER BY id").all(project) as {
		id: string; state: string; owner_sid: string | null; title: string;
	}[];
	const inflight = all.filter((w) => w.state === "CLAIMED" || w.state === "RUNNING");
	const ready = all.filter((w) => w.state === "READY");
	console.log(
		`FOCUS ${name}: ${inflight.length} in-flight, ${ready.length} ready/queued, ${all.length - inflight.length - ready.length} gated/other`,
	);
	for (const w of inflight) console.log(`  ▶ ${w.id} [${String(w.owner_sid).slice(0, 10)}] ${w.title.slice(0, 50)}`);
	for (const w of ready.slice(0, 6)) console.log(`  · ${w.id} ${w.title.slice(0, 55)}`);
	if (ready.length > 6) console.log(`  … +${ready.length - 6} more (work ready)`);
}

if (fixed.length) console.log(fixed.map((f) => `✓ ${f}`).join("\n"));
if (issues.length) {
	console.error(issues.map((i) => `⚠ ${i}`).join("\n"));
	process.exit(1);
}
console.log("health clean");
