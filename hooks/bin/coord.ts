// coord.ts — the coordination event bus over governor.db: agents share state
// BY REFERENCE (short structured events + canonical facts), never by retelling
// it in prose. Direct SendMessage stays reserved for interrupts.
//
// usage:
//   bun ~/.claude/bin/coord.ts emit <kind> [--scope s] [--sha x] [--note "..."] [--as sid]
//   bun ~/.claude/bin/coord.ts poll [--as sid] [--scope s] [--kinds a,b] [--limit n]
//   bun ~/.claude/bin/coord.ts wait --as sid [--scope s] [--kinds a,b] [--max-seconds 30]
//        (adaptive long-poll: 250ms fast path, backs off to 2s when idle)
//   bun ~/.claude/bin/coord.ts fact set <key> <value> [--source s]
//   bun ~/.claude/bin/coord.ts fact get <key> / fact list
//
// event kinds (doctrine): checkpoint | landed | interface_changed | test_red |
//   test_green | conflict | blocked | decision | dependency_changed
// poll with --as auto-advances that agent's cursor: communication cost scales
// with NEW information, never with history.
import { Database } from "bun:sqlite";
import { openGovernorDb, projectIdentity } from "../lib/govdb.ts";

interface Ev {
	id: number;
	ts: number;
	source: string;
	kind: string;
	scope: string | null;
	payload: string | null;
}

const die = (m: string): never => {
	console.error(`coord: ${m}`);
	process.exit(2);
};

const db: Database = openGovernorDb();
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name: string): string | null => {
	const i = rest.indexOf(name);
	return i >= 0 ? (rest[i + 1] ?? null) : null;
};

// output polish — quiet ANSI, disabled when piped or NO_COLOR
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint =
	(code: string) =>
	(s: string): string =>
		tty ? `\x1b[${code}m${s}\x1b[0m` : s;
const dim = paint("2");
const cyan = paint("36");
const green = paint("32");
const amber = paint("33");
const red = paint("31");

if (cmd === "emit") {
	const kind = rest[0];
	if (!kind) die('usage: emit <kind> [--to sid] [--scope s] [--sha x] [--note "..."] [--field=value ...] [--as sid]');
	const scope = arg("--scope");
	const sha = arg("--sha");
	const note = arg("--note");
	const source = arg("--as") ?? "unknown";
	const to = arg("--to");
	// arbitrary --key=value passthrough: the event IS the completion report
	// (e.g. --gate=pass --artifact=stale) — one source of truth, no retelling
	const extra: Record<string, string> = {};
	for (const t of rest.slice(1)) {
		const m = /^--([\w-]+)=(.+)$/.exec(t);
		if (m && !["scope", "sha", "note", "as", "to"].includes(m[1])) extra[m[1]] = m[2];
	}
	const payload = JSON.stringify({ ...(sha ? { sha } : {}), ...(note ? { note } : {}), ...extra });
	db.query("INSERT INTO events (ts, source, kind, scope, payload, target) VALUES (?, ?, ?, ?, ?, ?)").run(
		Date.now(),
		source,
		kind,
		scope,
		payload,
		to,
	);
	console.log(`${green("✓")} ${dim(`event queued #${(db.query("SELECT last_insert_rowid() AS id").get() as { id: number }).id} → ${to ? `@${to.slice(0, 8)}` : "bus"}`)}`);
} else if (cmd === "state") {
	// between-rounds check for a lane: canonical state + inbox + current HEAD
	const as = arg("--as") ?? die("usage: state --as <sid>");
	const st = db.query("SELECT value FROM facts WHERE key = ?").get(`lane.${as}.state`) as { value: string } | null;
	const head = db.query("SELECT value FROM facts WHERE key = 'integration.head'").get() as { value: string } | null;
	const ncur = (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(as) as { event_id: number } | null)?.event_id ?? 0;
	const pending = db.query("SELECT COUNT(*) AS n FROM events WHERE target = ? AND id > ?").get(as, ncur) as { n: number };
	console.log(
		`state=${st?.value ?? "RUNNING"}  inbox=${pending.n}  head=${head?.value ?? dim("unknown")}`,
	);
} else if (cmd === "inbox") {
	// directed events only; never advances the cursor unless --ack
	const as = arg("--as") ?? die("usage: inbox --as <sid> [--ack]");
	const ncur = (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(as) as { event_id: number } | null)?.event_id ?? 0;
	const rows = db
		.query("SELECT id, ts, source, kind, scope, payload FROM events WHERE target = ? AND id > ? ORDER BY id")
		.all(as, ncur) as Ev[];
	for (const r of rows) {
		const { sha, note, ...restP } = r.payload ? (JSON.parse(r.payload) as Record<string, string>) : {};
		const extra = Object.entries(restP)
			.map(([k, v]) => `${dim(`${k}=`)}${v}`)
			.join(" ");
		console.log(
			`  ${dim(`#${r.id}`)} ${cyan(r.kind)}${r.scope ? ` ${r.scope}` : ""}${sha ? green(`@${sha.slice(0, 8)}`) : ""}${Object.keys(restP).length ? `  ${extra}` : ""}${note ? dim(` — ${note}`) : ""}`,
		);
	}
	if (rest.includes("--ack")) {
		const latest = rows.length ? Math.max(...rows.map((r) => r.id)) : ncur;
		const c = (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(as) as { event_id: number } | null)?.event_id ?? 0;
		if (latest > c) {
			if (c) db.query("UPDATE cursors SET event_id = ? WHERE sid = ?").run(latest, as);
			else db.query("INSERT INTO cursors (sid, event_id) VALUES (?, ?)").run(as, latest);
		}
	}
	if (!rows.length) console.log(dim("(inbox empty)"));
} else if (cmd === "pause") {
	// cooperative preemption: PAUSE_REQUESTED is interrupt-class and goes out
	// immediately — the lane finishes its atomic edit, checkpoints, writes a
	// continuation capsule, marks PAUSED, then waits.
	const sid = rest[0];
	const reason = arg("--reason");
	if (!sid || !reason) die('usage: pause <sid> --reason "why" [--scope s] [--intervention "what is coming"]');
	const scope = arg("--scope");
	const intervention = arg("--intervention");
	const source = arg("--as") ?? "coordinator";
	db.query("INSERT INTO events (ts, source, kind, scope, payload, target) VALUES (?, ?, 'pause_requested', ?, ?, ?)").run(
		Date.now(),
		source,
		scope,
		JSON.stringify({ ...(reason ? { reason } : {}), ...(intervention ? { intervention } : {}) }),
		sid,
	);
	// canonical lane state: RUNNING → PAUSE_REQUESTED (→ PAUSED by the lane itself)
	db.query(
		"INSERT INTO facts (key, value, source, version, ts) VALUES ('lane.' || ? || '.state', 'PAUSE_REQUESTED', ?, 1, ?) ON CONFLICT(key) DO UPDATE SET value = 'PAUSE_REQUESTED', source = excluded.source, version = version + 1, ts = excluded.ts",
	).run(sid, source, Date.now());
	console.log(`${amber("⏸")} ${dim(`pause_requested → @${sid.slice(0, 8)}`)}`);
} else if (cmd === "paused") {
	// the LANE's own transition: PAUSE_REQUESTED → PAUSED. Requires proof of a
	// safe boundary: checkpoint SHA (--sha) AND a written capsule. A model
	// cannot skip the restart context by accident.
	const as = arg("--as") ?? die("usage: paused --as <sid> --sha <checkpoint-sha> [--step s]");
	const sha = arg("--sha") ?? die("paused requires --sha <checkpoint-sha> — no checkpoint, no pause");
	const cap = db.query("SELECT value FROM facts WHERE key = ?").get(`lane.${as}.capsule`) as { value: string } | null;
	if (!cap) die("no continuation capsule — `coord capsule set` before pausing (restart context is mandatory)");
	let capsule: { checkpoint?: string } = {};
	try {
		capsule = JSON.parse(cap.value) as { checkpoint?: string };
	} catch {}
	if (capsule.checkpoint !== sha)
		die(`capsule checkpoint (${capsule.checkpoint ?? "none"}) ≠ --sha ${sha} — write a fresh capsule for THIS checkpoint`);
	const st = db.query("SELECT value FROM facts WHERE key = ?").get(`lane.${as}.state`) as { value: string } | null;
	if (st?.value !== "PAUSE_REQUESTED") die(`lane state is ${st?.value ?? "RUNNING"}, not PAUSE_REQUESTED — nothing to acknowledge`);
	db.query("UPDATE facts SET value = 'PAUSED', source = ?, version = version + 1, ts = ? WHERE key = ?").run(
		as,
		Date.now(),
		`lane.${as}.state`,
	);
	db.query("INSERT INTO events (ts, source, kind, scope, payload, target) VALUES (?, ?, 'paused', ?, ?, ?)").run(
		Date.now(),
		as,
		arg("--scope"),
		JSON.stringify({ sha, ...(arg("--step") ? { step: arg("--step") } : {}) }),
		"coordinator",
	);
	console.log(`${amber("⏸")} ${dim(`PAUSED @${sha.slice(0, 8)} — capsule + checkpoint banked`)}`);
} else if (cmd === "resume") {
	// in-band change landed: RESUME_READY carries the delta summary; clears the
	// pause fact. Refuses when the lane never reached PAUSED — never race a
	// working lane.
	const sid = rest[0];
	const onto = arg("--onto");
	if (!sid || !onto) die("usage: resume <sid> --onto <sha> [--diff-from <pause-base>] [--note \"delta summary\"]");
	const paused = db.query("SELECT value FROM facts WHERE key = ?").get(`lane.${sid}.state`) as { value: string } | null;
	if (paused?.value !== "PAUSED")
		die(`lane @${sid.slice(0, 8)} state is ${paused?.value ?? "RUNNING"} — resume requires PAUSED (never race a working lane)`);
	const diffFrom = arg("--diff-from");
	let changed: string[] = [];
	if (diffFrom) {
		const d = Bun.spawnSync(["git", "diff", "--name-status", `${diffFrom}..${onto}`], { stdout: "pipe", stderr: "pipe" });
		changed = new TextDecoder()
			.decode(d.stdout)
			.split("\n")
			.filter((l) => l.trim())
			.slice(0, 30)
			.map((l) => l.replace(/\t/g, " "));
	}
	const source = arg("--as") ?? "coordinator";
	db.query("INSERT INTO events (ts, source, kind, scope, payload, target) VALUES (?, ?, 'resume_ready', ?, ?, ?)").run(
		Date.now(),
		source,
		arg("--scope"),
		JSON.stringify({
			onto,
			...(paused ? { pausedAt: paused.value } : {}),
			...(changed.length ? { changed } : {}),
			...(arg("--note") ? { note: arg("--note") } : {}),
		}),
		sid,
	);
	// PAUSED → RESUME_READY (the worker reconciles, then confirms via `resumed`)
	db.query(
		"INSERT INTO facts (key, value, source, version, ts) VALUES ('lane.' || ? || '.state', 'RESUME_READY', ?, 1, ?) ON CONFLICT(key) DO UPDATE SET value = 'RESUME_READY', source = excluded.source, version = version + 1, ts = excluded.ts",
	).run(sid, source, Date.now());
	console.log(`${green("↻")} ${dim(`resume_ready → @${sid.slice(0, 8)} onto ${onto.slice(0, 8)}${changed.length ? ` (${changed.length} files changed)` : ""}`)}`);
} else if (cmd === "resumed") {
	// the worker's confirmation: RESUME_READY → RUNNING (worktree reconciled,
	// targeted tests green)
	const as = arg("--as") ?? die("usage: resumed --as <sid>");
	const st = db.query("SELECT value FROM facts WHERE key = ?").get(`lane.${as}.state`) as { value: string } | null;
	if (st?.value !== "RESUME_READY") die(`lane state is ${st?.value ?? "RUNNING"} — nothing to resume-confirm`);
	db.query("UPDATE facts SET value = 'RUNNING', source = ?, version = version + 1, ts = ? WHERE key = ?").run(
		as,
		Date.now(),
		`lane.${as}.state`,
	);
	console.log(`${green("▶")} ${dim(`RUNNING — @${as.slice(0, 8)} reconciled and re-uptaken`)}`);
} else if (cmd === "capsule") {
	// continuation capsule: the minimum restart packet (checkpoint/step/next/assumptions)
	const as = arg("--as") ?? rest[0];
	if (!as || rest[0] === "get") {
		const cap = db.query("SELECT value FROM facts WHERE key = ?").get(`lane.${as ?? ""}.capsule`) as { value: string } | null;
		console.log(cap?.value ?? dim("(no capsule)"));
	} else {
		const extra: Record<string, string> = {};
		for (const t of process.argv.slice(2)) {
			const m = /^--([\w-]+)=(.+)$/.exec(t);
			if (m && !["as"].includes(m[1])) extra[m[1]] = m[2];
		}
		db.query(
			"INSERT INTO facts (key, value, source, version, ts) VALUES (?, ?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, version = version + 1, ts = excluded.ts",
		).run(`lane.${as}.capsule`, JSON.stringify({ ...extra, ts: Date.now() }), arg("--as") ?? as, Date.now());
		console.log(`${green("✓")} ${dim(`capsule stored for @${as.slice(0, 8)}`)}`);
	}
} else if (cmd === "poll") {
	const as = arg("--as");
	const scope = arg("--scope");
	const kinds = arg("--kinds")?.split(",").filter(Boolean) ?? [];
	const limit = Number(arg("--limit") ?? 50);
	const cur = as ? (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(as) as { event_id: number } | null) : null;
	const since = cur?.event_id ?? 0;
	// fetch all past the cursor, filter in TS, THEN limit — a SQL LIMIT here
	// would cut off the newest matching events; and the cursor may only advance
	// to what was actually SHOWN, or filtered consumers silently lose events.
	// A consumer with --as sees broadcasts + anything directed at it.
	let rows = as
		? (db.query("SELECT id, ts, source, kind, scope, payload FROM events WHERE id > ? AND (target IS NULL OR target = ?) ORDER BY id").all(since, as) as Ev[])
		: (db.query("SELECT id, ts, source, kind, scope, payload FROM events WHERE id > ? AND target IS NULL ORDER BY id").all(since) as Ev[]);
	if (scope) rows = rows.filter((r) => r.scope && (r.scope === scope || scopeCovers(r.scope, scope) || scopeCovers(scope, r.scope)));
	if (kinds.length) rows = rows.filter((r) => kinds.includes(r.kind));
	rows = rows.slice(0, limit);
	for (const r of rows) {
		const { sha, note, ...restP } = r.payload ? (JSON.parse(r.payload) as Record<string, string>) : {};
		const ago = Math.max(0, Math.round((Date.now() - r.ts) / 1000));
		const extra = Object.entries(restP)
			.map(([k, v]) => `${dim(`${k}=`)}${v}`)
			.join(" ");
		console.log(
			`  ${dim(`#${r.id}`)} ${dim(`${ago}s`.padStart(4))}  ${cyan(r.kind.padEnd(18))}${dim(r.source.slice(0, 8).padEnd(9))}${r.scope ? `${r.scope}  ` : ""}${sha ? green(`@${sha.slice(0, 8)}  `) : ""}${Object.keys(restP).length ? `${extra}  ` : ""}${note ? dim(`— ${note}`) : ""}`,
		);
	}
	const latest = rows.length ? Math.max(...rows.map((r) => r.id)) : since; // advance only past SHOWN events
	if (as && rows.length) {
		if (cur) db.query("UPDATE cursors SET event_id = ? WHERE sid = ?").run(latest, as);
		else db.query("INSERT INTO cursors (sid, event_id) VALUES (?, ?)").run(as, latest);
	}
	if (!rows.length) console.log(dim("(no new events)"));
	} else if (cmd === "wait") {
		// adaptive long-poll: 250ms while events flow, backing off to 2s when
		// idle; resets to fast the moment anything arrives. Near-instant local
		// coordination without a broker daemon.
		const as = arg("--as") ?? die("usage: wait --as <sid> [--scope s] [--kinds a,b] [--max-seconds 30]");
		const scope = arg("--scope");
		const kinds = arg("--kinds")?.split(",").filter(Boolean) ?? [];
		const deadline = Date.now() + Number(arg("--max-seconds") ?? 30) * 1000;
		let interval = 250;
		for (;;) {
			const cur = (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(as) as { event_id: number } | null)?.event_id ?? 0;
			let rows = db
				.query("SELECT id, ts, source, kind, scope, payload FROM events WHERE id > ? AND (target IS NULL OR target = ?) ORDER BY id")
				.all(cur, as) as Ev[];
			if (scope) rows = rows.filter((r) => r.scope && (r.scope === scope || scopeCovers(r.scope, scope) || scopeCovers(scope, r.scope)));
			if (kinds.length) rows = rows.filter((r) => kinds.includes(r.kind));
			if (rows.length) {
				for (const r of rows) {
					const { sha, note, ...restP } = r.payload ? (JSON.parse(r.payload) as Record<string, string>) : {};
					const extra = Object.entries(restP)
						.map(([k, v]) => `${dim(`${k}=`)}${v}`)
						.join(" ");
					console.log(
						`  ${dim(`#${r.id}`)} ${r.source.slice(0, 8)} ${cyan(r.kind)}${r.scope ? ` ${r.scope}` : ""}${sha ? green(`@${sha.slice(0, 8)}`) : ""}${Object.keys(restP).length ? `  ${extra}` : ""}${note ? dim(` — ${note}`) : ""}`,
					);
				}
				const shownMax = Math.max(...rows.map((r) => r.id));
				if (cur) db.query("UPDATE cursors SET event_id = ? WHERE sid = ?").run(shownMax, as);
				else db.query("INSERT INTO cursors (sid, event_id) VALUES (?, ?)").run(as, shownMax);
				process.exit(0);
			}
			if (Date.now() > deadline) {
				console.log("(timeout, no events)");
				process.exit(0);
			}
			await new Promise((r) => setTimeout(r, interval));
			interval = Math.min(interval * 2, 2000); // back off while idle; resets by activity above
		}
} else if (cmd === "fact") {
	const sub = rest[0];
	if (sub === "set") {
		const key = rest[1];
		const value = rest[2];
		if (!key || value === undefined) die("usage: fact set <key> <value> [--source s]");
		const src = arg("--source") ?? "coord";
		db.query(
			"INSERT INTO facts (key, value, source, version, ts) VALUES (?, ?, ?, 1, ?) " +
				"ON CONFLICT(key) DO UPDATE SET value = excluded.value, source = excluded.source, version = version + 1, ts = excluded.ts",
		).run(key, value, src, Date.now());
		console.log(`fact ${key} = ${value}`);
	} else if (sub === "get") {
		const r = db.query("SELECT value, version, ts FROM facts WHERE key = ?").get(rest[1] ?? "") as
			| { value: string; version: number; ts: number }
			| undefined;
		console.log(r ? `${r.value} (v${r.version})` : "(unset)");
	} else if (sub === "list") {
		const rows = db.query("SELECT key, value, version, ts FROM facts ORDER BY key").all() as {
			key: string; value: string; version: number; ts: number;
		}[];
		console.log(rows.length ? rows.map((r) => `${r.key} = ${r.value}  (v${r.version})`).join("\n") : "(no facts)");
	} else die("usage: fact set <key> <value> | fact get <key> | fact list");
} else if (cmd === "bootstrap") {
	// the session-start ritual: identity + owned work + ready pool + inbox,
	// so no session reconstructs operational state from Markdown
	const as = arg("--as") ?? die("usage: bootstrap --as <sid> [--project p] [--role r] [--parent sid] [--worktree w]");
	// project identity is always derived (projectIdentity) — no --project
	// override, it would let sessions fragment the graph by hand
	let project = projectIdentity();
	const role = arg("--role") ?? "worker";
	db.query(
		"INSERT INTO sessions (sid, project, role, parent_sid, worktree, started_at, hb, state) VALUES (?, ?, ?, ?, ?, ?, ?, 'RUNNING') ON CONFLICT(sid) DO UPDATE SET project = excluded.project, role = excluded.role, hb = excluded.hb",
	).run(as, project, role, arg("--parent"), arg("--worktree") ?? null, Date.now(), Date.now());
	const mine = db.query("SELECT id, title, state FROM work_items WHERE project = ? AND owner_sid = ? AND state NOT IN ('DONE','SUPERSEDED') ORDER BY id").all(project, as) as { id: string; title: string; state: string }[];
	const readyN = (db.query("SELECT COUNT(*) AS n FROM work_items WHERE project = ? AND state = 'READY'").get(project) as { n: number }).n;
	const ncur = (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(as) as { event_id: number } | null)?.event_id ?? 0;
	const inbox = (db.query("SELECT COUNT(*) AS n FROM events WHERE target = ? AND id > ?").get(as, ncur) as { n: number }).n;
	const head = (db.query("SELECT value FROM facts WHERE key = 'integration.head'").get() as { value: string } | null)?.value;
	const pname = project.split("/").pop()?.replace(/\.git$/, "") || project.split("/").slice(-2, -1).pop() || project;
	console.log(`SESSION ${as.slice(0, 8)}  project=${pname}  role=${role}`);
	console.log(`OWNED ${mine.length}${mine.length ? `: ${mine.map((w) => `${w.id} ${w.state}`).join(", ")}` : ""}  READY ${readyN}  INBOX ${inbox}${head ? `  head=${head.slice(0, 7)}` : ""}`);
	for (const w of mine) console.log(`  ${cyan(w.id)} ${dim(w.state)} ${w.title.slice(0, 60)}`);
} else if (cmd === "fleet") {
	// one-line fleet projection for a terminal pane (the Desktop panel
	// projection lives in subagent-statusline.ts; the CLI inline rows are
	// harness-owned and ignore it)
	const crows = db.query("SELECT sid, intent FROM claims ORDER BY sid").all() as { sid: string; intent: string | null }[];
	const lanes = [...new Set(crows.map((c) => c.sid))].sort();
	const states = db.query("SELECT key, value FROM facts WHERE key LIKE 'lane.%.state'").all() as { key: string; value: string }[];
	const byKey = new Map(states.map((s) => [s.key, s.value]));
	const names = new Map<string, string>();
	for (const c of crows) {
		if (c.intent && !names.has(c.sid)) names.set(c.sid, c.intent.length > 14 ? `${c.intent.slice(0, 13)}…` : c.intent);
	}
	const head = (db.query("SELECT value FROM facts WHERE key = 'integration.head'").get() as { value: string } | null)?.value;
	const parts = lanes.map((l) => {
		const st = byKey.get(`lane.${l.sid}.state`);
		const g =
			st === "PAUSE_REQUESTED" ? amber("◐") : st === "PAUSED" ? amber("⏸") : st === "RESUME_READY" ? cyan("↻") : st === "BLOCKED" ? red("⚠") : green("▶");
		return `${g} ${dim(names.get(l) ?? l.slice(0, 8))}`;
	});
	console.log(`${head ? `${dim(`@${head.slice(0, 7)}`)}  ` : ""}${parts.join("  ") || dim("(no claimed lanes)")}`);
} else if (cmd === "resume-session") {
	// ownership rebind for `claude -c` continuations: the runtime hands the
	// resumed session a fresh id — move ownership forward atomically so the
	// session wakes owning what it owned before (never re-derive from Markdown)
	const as = arg("--as");
	const from = arg("--from");
	if (!as || !from || as === from) die("usage: resume-session --as <new-sid> --from <old-sid>");
	const old = db.query("SELECT project, role, worktree FROM sessions WHERE sid = ?").get(from) as { project: string | null; role: string | null; worktree: string | null } | undefined;
	if (!old) die(`no known session: ${from} — nothing to rebind`);
	const proj = old.project ?? projectIdentity();
	const now = Date.now();
	let wMoved = 0;
	let cMoved = 0;
	let fMoved = 0;
	let eMoved = 0;
	db.transaction(() => {
		wMoved = db.query("UPDATE work_items SET owner_sid = ?, updated_at = ? WHERE project = ? AND owner_sid = ? AND state NOT IN ('DONE','SUPERSEDED','FAILED')").run(as, now, proj, from).changes;
		cMoved = db.query("INSERT INTO claims (sid, scope, intent, hot, ts, tp) SELECT ?, scope, intent, hot, ts, tp FROM claims WHERE sid = ? ON CONFLICT DO NOTHING").run(as, from).changes;
		db.query("DELETE FROM claims WHERE sid = ?").run(from);
		const facts = db.query("SELECT key FROM facts WHERE key LIKE ?").all(`lane.${from}.%`) as { key: string }[];
		for (const f of facts) {
			const nk = f.key.replace(`lane.${from}.`, `lane.${as}.`);
			db.query("INSERT INTO facts (key, value, source, version, ts) SELECT ?, value, source, version + 1, ? FROM facts WHERE key = ? ON CONFLICT(key) DO UPDATE SET value = excluded.value, ts = excluded.ts").run(nk, now, f.key);
			db.query("DELETE FROM facts WHERE key = ?").run(f.key);
			fMoved++;
		}
		// unconsumed directed events follow the inbox: everything past the old
		// cursor re-targets the new sid, so pending messages aren't stranded
		const oldCur = (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(from) as { event_id: number } | null)?.event_id ?? 0;
		eMoved = db.query("UPDATE events SET target = ? WHERE target = ? AND id > ?").run(as, from, oldCur).changes;
		const cur = db.query("SELECT event_id FROM cursors WHERE sid = ?").get(from) as { event_id: number } | null;
		if (cur && !db.query("SELECT 1 FROM cursors WHERE sid = ?").get(as)) db.query("INSERT INTO cursors (sid, event_id) VALUES (?, ?)").run(as, cur.event_id);
		db.query("UPDATE sessions SET state = 'CLOSED', hb = ? WHERE sid = ?").run(now, from);
		db.query(
			"INSERT INTO sessions (sid, project, role, parent_sid, worktree, started_at, hb, state) VALUES (?, ?, ?, ?, ?, ?, ?, 'RUNNING') ON CONFLICT(sid) DO UPDATE SET project = excluded.project, role = excluded.role, parent_sid = excluded.parent_sid, worktree = excluded.worktree, hb = excluded.hb, state = 'RUNNING'",
		).run(as, proj, old.role ?? "worker", from, old.worktree, now, now);
	})();
	console.log(`✓ ${from.slice(0, 8)} → ${as.slice(0, 8)}  work:${wMoved} claims:${cMoved} facts:${fMoved} events:${eMoved} (cursor carried, ${from.slice(0, 8)} CLOSED)`);
} else if (cmd === "doctor-session") {
	// rebind integrity: NO live coordination state may point at a closed
	// predecessor — everything here should be zero after resume-session
	const sid = rest[0];
	if (!sid) die("usage: doctor-session <sid>");
	const s = db.query("SELECT project, parent_sid FROM sessions WHERE sid = ?").get(sid) as { project: string | null; parent_sid: string | null } | undefined;
	if (!s) die(`no session: ${sid}`);
	const issues: string[] = [];
	const old = s.parent_sid;
	if (old) {
		const w = (db.query("SELECT COUNT(*) AS n FROM work_items WHERE project = ? AND owner_sid = ? AND state NOT IN ('DONE','SUPERSEDED','FAILED')").get(s.project, old) as { n: number }).n;
		if (w) issues.push(`${w} work items still owned by ${old.slice(0, 8)}`);
		const c = (db.query("SELECT COUNT(*) AS n FROM claims WHERE sid = ?").get(old) as { n: number }).n;
		if (c) issues.push(`${c} claims still on ${old.slice(0, 8)}`);
		const ncur = (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(sid) as { event_id: number } | null)?.event_id ?? 0;
		const e = (db.query("SELECT COUNT(*) AS n FROM events WHERE target = ? AND id > ?").get(old, ncur) as { n: number }).n;
		if (e) issues.push(`${e} unconsumed events still addressed to ${old.slice(0, 8)}`);
		const f = (db.query("SELECT COUNT(*) AS n FROM facts WHERE key LIKE ?").get(`lane.${old}.%`) as { n: number }).n;
		if (f) issues.push(`${f} lane facts still keyed ${old.slice(0, 8)}`);
	}
	console.log(issues.length ? `RESIDUE ${sid.slice(0, 8)}: ${issues.join("; ")}` : `✓ ${sid.slice(0, 8)} clean${old ? ` (lineage ${old.slice(0, 8)})` : ""}`);
} else if (cmd === "gc") {
	// retention: events + closed sessions + their cursors age out; terminal
	// work items are the ledger and are NEVER auto-deleted
	const days = Number(arg("--days") ?? 30);
	const cut = Date.now() - days * 86_400_000;
	const e = db.query("DELETE FROM events WHERE ts < ?").run(cut).changes;
	const s = db.query("DELETE FROM sessions WHERE state = 'CLOSED' AND hb < ?").run(cut).changes;
	const c = db.query("DELETE FROM cursors WHERE sid NOT IN (SELECT sid FROM sessions)").run().changes;
	const f = db.query("DELETE FROM facts WHERE key LIKE 'lane.%' AND ts < ?").run(cut).changes;
	console.log(`gc: ${e} events, ${s} closed sessions, ${c} stale cursors, ${f} lane facts pruned (>${days}d; work ledger untouched)`);
} else {
	die("unknown command — try emit | poll | wait | fact | bootstrap | state | inbox | capsule | pause | paused | resume | resumed | resume-session | doctor-session | gc | fleet");
}

function scopeCovers(a: string, b: string): boolean {
	if (a === b) return true;
	const pa = a.replace(/\/\*\*?$/, "");
	const pb = b.replace(/\/\*\*?$/, "");
	return pa !== a && (b.startsWith(`${pa}/`) || b === pa);
}
