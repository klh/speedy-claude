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
import { openGovernorDb } from "../lib/govdb.ts";

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

if (cmd === "emit") {
	const kind = rest[0];
	if (!kind) die("usage: emit <kind> [--scope s] [--sha x] [--note \"...\"] [--field=value ...] [--as sid]");
	const scope = arg("--scope");
	const sha = arg("--sha");
	const note = arg("--note");
	const source = arg("--as") ?? "unknown";
	// arbitrary --key=value passthrough: the event IS the completion report
	// (e.g. --gate=pass --artifact=stale) — one source of truth, no retelling
	const extra: Record<string, string> = {};
	for (const t of rest.slice(1)) {
		const m = /^--([\w-]+)=(.+)$/.exec(t);
		if (m && !["scope", "sha", "note", "as"].includes(m[1])) extra[m[1]] = m[2];
	}
	const payload = JSON.stringify({ ...(sha ? { sha } : {}), ...(note ? { note } : {}), ...extra });
	db.query("INSERT INTO events (ts, source, kind, scope, payload) VALUES (?, ?, ?, ?, ?)").run(
		Date.now(),
		source,
		kind,
		scope,
		payload,
	);
	console.log(`${green("✓")} ${dim(`event queued #${(db.query("SELECT last_insert_rowid() AS id").get() as { id: number }).id}`)}`);
} else if (cmd === "poll") {
	const as = arg("--as");
	const scope = arg("--scope");
	const kinds = arg("--kinds")?.split(",").filter(Boolean) ?? [];
	const limit = Number(arg("--limit") ?? 50);
	const cur = as ? (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(as) as { event_id: number } | null) : null;
	const since = cur?.event_id ?? 0;
	// fetch all past the cursor, filter in TS, THEN limit — a SQL LIMIT here
	// would cut off the newest matching events; and the cursor may only advance
	// to what was actually SHOWN, or filtered consumers silently lose events
	let rows = db.query("SELECT id, ts, source, kind, scope, payload FROM events WHERE id > ? ORDER BY id").all(since) as Ev[];
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
			let rows = db.query("SELECT id, ts, source, kind, scope, payload FROM events WHERE id > ? ORDER BY id").all(cur) as Ev[];
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
} else {
	die("unknown command — try emit | poll | fact");
}

function scopeCovers(a: string, b: string): boolean {
	if (a === b) return true;
	const pa = a.replace(/\/\*\*?$/, "");
	const pb = b.replace(/\/\*\*?$/, "");
	return pa !== a && (b.startsWith(`${pa}/`) || b === pa);
}
