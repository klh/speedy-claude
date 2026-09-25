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
	if (!["RUNNING", "PAUSE_REQUESTED", "PAUSED", "RESUME_READY", "BLOCKED", "WAIT_RATE"].includes(f.value)) {
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

// 7. zombie lanes: CLAIMED items whose owner went silent — usage-limit
// deaths freeze subagents silently while the claim and the wall clock keep
// going (2026-09-24: 47 frozen, 6h blackout). THREE-STATE multi-signal rule
// (lookup failure is NEVER death):
//   ZOMBIE  = hb stale + transcript stale (2 independent signals)
//   SUSPECT = one signal stale, other UNKNOWN
//   UNKNOWN = telemetry missing — never claims death
// Threshold from fact fleet.zombie_after_ms (default 45min). WAIT_RATE /
// PAUSED sessions are expected-silent, never zombies. Remediation (reclaim
// + re-dispatch pointing at the frozen transcript) belongs to the canonical
// coordinator; alerts dedupe via fact zombie.<id> (6h).
const ZOMBIE_MS = Number(
	(db.query("SELECT value FROM facts WHERE key = 'fleet.zombie_after_ms'").get() as { value: string } | null)?.value ?? 45 * 60_000,
);
const zProjects = db.query("SELECT DISTINCT project FROM work_items WHERE state IN ('CLAIMED','RUNNING')").all() as { project: string }[];
for (const { project } of zProjects) {
	const claimed = db
		.query("SELECT id, owner_sid, title FROM work_items WHERE project = ? AND state IN ('CLAIMED','RUNNING') AND owner_sid IS NOT NULL")
		.all(project) as { id: string; owner_sid: string; title: string }[];
	for (const w of claimed) {
		const sess = db.query("SELECT state, hb, transcript_path FROM sessions WHERE sid = ?").get(w.owner_sid) as
			| { state: string; hb: number; transcript_path: null | string }
			| null;
		if (sess && ["PAUSED", "WAIT_RATE"].includes(sess.state)) continue; // expected-silent
		const signals: string[] = [];
		let known = 0;
		if (sess?.hb) {
			known++;
			if (now - sess.hb > ZOMBIE_MS) signals.push(`hb ${Math.round((now - sess.hb) / 60000)}min`);
			else signals.length = 0; // fresh hb outranks older transcript signal
		}
		if (sess?.transcript_path) {
			try {
				const age = now - statSync(sess.transcript_path).mtimeMs;
				known++;
				if (age > ZOMBIE_MS) signals.push(`transcript ${Math.round(age / 60000)}min`);
			} catch {
				// path recorded but unstat-able — telemetry gap, not death
			}
		}
		const verdict = signals.length >= 2 ? "ZOMBIE" : signals.length === 1 ? "SUSPECT" : known === 0 ? "UNKNOWN" : "ACTIVE";
		const label = `${w.owner_sid.slice(0, 10)} ${verdict}${signals.length ? ` (${signals.join(", ")})` : " (no telemetry)"}`;
		if (verdict === "ACTIVE") continue;
		const fk = `zombie.${w.id}`;
		const seen = db.query("SELECT ts FROM facts WHERE key = ?").get(fk) as { ts: number } | null;
		if (!seen || now - seen.ts > 6 * 3600_000) {
			db.query("INSERT OR REPLACE INTO facts (key, value, source, version, ts) VALUES (?, ?, 'monitor', 1, ?)").run(fk, label, now);
			if (verdict === "ZOMBIE") {
				db.query(
					"INSERT INTO events (ts, source, kind, scope, payload, target) VALUES (?, 'monitor', 'alert', ?, ?, (SELECT value FROM facts WHERE key = 'coordinator.sid'))",
				).run(now, w.id, JSON.stringify({ note: `ZOMBIE lane: ${label} — reclaim + re-dispatch pointing at its transcript` }));
			}
			fixed.push(`${verdict} ${w.id} (${label})`);
		} else if (verdict === "ZOMBIE") {
			issues.push(`zombie ${w.id}: ${label} (alerted ${Math.round((now - seen.ts) / 60000)}min ago)`);
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
