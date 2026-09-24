// claim.ts — claim registry CLI. Coordination state must never be model-authored
// as a whole document (a hand-written claims.json once garbled — fabricated keys,
// swapped scope). The model emits ONE short command; this tool validates the
// session id against live transcripts and persists via SQLite (WAL), which
// arbitrates concurrent writers without hand-rolled locks.
//
// usage:
//   bun ~/.claude/bin/claim.ts add <sid> <scope...> [--intent "..."]
//   bun ~/.claude/bin/claim.ts release <sid> [--scope <scope>]
//   bun ~/.claude/bin/claim.ts hot '<scope>'     / cool '<scope>'     (scope fan-out)
//   bun ~/.claude/bin/claim.ts hot --claim <sid> / cool --claim <sid> (exact)
//   bun ~/.claude/bin/claim.ts doctor
//   bun ~/.claude/bin/claim.ts list [--json]
//
// Scopes are dir prefixes or exact paths ("src/auth", "src/api/user.ts").
// A trailing /** or /* is accepted and stripped — prefer the bare prefix so
// shells never see glob characters to expand. Relative scopes are worktree-
// portable: the governor matches them as path-segment suffixes.
import { Database } from "bun:sqlite";
import { openGovernorDb } from "../lib/govdb.ts";
import { existsSync, readdirSync, statSync } from "node:fs";

const PROJECTS = `${process.env.HOME}/.claude/projects`;
const TTL = 15 * 60_000;

interface Row {
	sid: string;
	scope: string;
	intent: string | null;
	hot: number;
	ts: number;
	tp: string | null;
}

const die = (m: string): never => {
	console.error(`claim: ${m}`);
	process.exit(2);
};

// output polish — quiet ANSI, disabled when piped or NO_COLOR
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint =
	(code: string) =>
	(s: string): string =>
		tty ? `\x1b[${code}m${s}\x1b[0m` : s;
const dim = paint("2");
const cyan = paint("36");
const amber = paint("33");

// one shared connection shape with the gates — WAL/schema/bootstrap fixes live
// in ONE module (hooks/lib/govdb.ts), not per-tool copies
const db: Database = openGovernorDb();

// Runtime-side validation: a claim target must be a REAL live session —
// fabricated ids are rejected here, not discovered by the governor later.
// Layout-agnostic: main sessions live at <proj>/<sid>.jsonl, subagents at
// <proj>/<parent-session>/subagents/agent-<id>.jsonl — a glob over both
// beats hardcoding the harness's directory shape.
function liveTranscript(sid: string): string | null {
	const floor = Date.now() - TTL;
	try {
		const glob = new Bun.Glob(`**/*${sid}*.jsonl`);
		for (const rel of glob.scanSync({ cwd: PROJECTS, onlyFiles: true })) {
			const f = `${PROJECTS}/${rel}`;
			try {
				if (existsSync(f) && statSync(f).mtimeMs > floor) return f;
			} catch {}
		}
	} catch {}
	return null;
}

function scopeMatch(a: string, b: string): boolean {
	if (a === b) return true;
	const pa = a.replace(/\/\*\*?$/, "");
	return pa !== a && (b.startsWith(`${pa}/`) || b === pa);
}

const normalizeScope = (s: string): string => s.replace(/\/\*\*?$/, "");
const all = (): Row[] => db.query("SELECT sid, scope, intent, hot, ts, tp FROM claims").all() as Row[];

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "add") {
	const sid = rest[0];
	const scopes: string[] = [];
	let intent = "";
	for (let i = 1; i < rest.length; i++) {
		if (rest[i] === "--intent") intent = rest[++i] ?? "";
		else scopes.push(normalizeScope(rest[i]));
	}
	if (!sid || !scopes.length) die('usage: add <sid> <scope...> [--intent "..."]');
	const tp = liveTranscript(sid);
	if (!tp) die(`no live transcript for ${sid} — refusing to claim for a fabricated/dead session`);
	const cur = db.query("SELECT intent FROM claims WHERE sid = ? LIMIT 1").get(sid) as { intent: string | null } | null;
	const keepIntent = intent || cur?.intent || "";
	const up = db.query("INSERT INTO claims (sid, scope, intent, hot, ts, tp) VALUES (?, ?, ?, COALESCE((SELECT hot FROM claims WHERE sid = ? AND scope = ?), 0), ?, ?) ON CONFLICT(sid, scope) DO UPDATE SET intent = excluded.intent, ts = excluded.ts, tp = excluded.tp");
	for (const s of scopes) up.run(sid, s, keepIntent, sid, s, Date.now(), tp);
	console.log(`claimed ${scopes.join(", ")} → ${sid.slice(0, 8)}`);
} else if (cmd === "release") {
	const sid = rest[0];
	const scopeIdx = rest.indexOf("--scope");
	const only = scopeIdx >= 0 ? normalizeScope(rest[scopeIdx + 1] ?? "") : null;
	if (!sid) die("usage: release <sid> [--scope <scope>]");
	if (only) {
		const rows = all().filter((r) => r.sid === sid && (scopeMatch(r.scope, only) || scopeMatch(only, r.scope)));
		const del = db.query("DELETE FROM claims WHERE sid = ? AND scope = ?");
		for (const r of rows) del.run(r.sid, r.scope);
	} else {
		db.query("DELETE FROM claims WHERE sid = ?").run(sid);
	}
	console.log(`released ${only ?? "all"} for ${sid.slice(0, 8)}`);
} else if (cmd === "hot" || cmd === "cool") {
	const claimIdx = rest.indexOf("--claim");
	const target = claimIdx >= 0 ? rest[claimIdx + 1] : rest[0];
	if (!target) die(`usage: ${cmd} '<scope>' | ${cmd} --claim <sid>`);
	const rows = claimIdx >= 0 ? all().filter((r) => r.sid === target) : all().filter((r) => scopeMatch(r.scope, target));
	const upd = db.query("UPDATE claims SET hot = ? WHERE sid = ? AND scope = ?");
	for (const r of rows) upd.run(cmd === "hot" ? 1 : 0, r.sid, r.scope);
	console.log(`${cmd}: ${rows.length} claim(s) updated`);
} else if (cmd === "doctor") {
	const rows = all();
	const del = db.query("DELETE FROM claims WHERE sid = ? AND scope = ?");
	const removed: string[] = [];
	for (const r of rows) {
		const dead = Date.now() - r.ts > TTL && !liveTranscript(r.sid);
		if (dead) {
			del.run(r.sid, r.scope);
			removed.push(`${r.sid.slice(0, 8)}  ${r.scope} (dead/expired)`);
		}
	}
	console.log(removed.length ? `removed:\n  ${removed.join("\n  ")}` : "registry clean");
} else if (cmd === "list") {
	const rows = all();
	if (rest.includes("--json")) {
		console.log(JSON.stringify(rows, null, 1));
		process.exit(0);
	}
	const bySid = new Map<string, { scopes: string[]; intent: string | null; hot: number; ts: number }>();
	for (const r of rows) {
		const cur = bySid.get(r.sid) ?? { scopes: [], intent: r.intent, hot: 0, ts: r.ts };
		cur.scopes.push(r.scope);
		cur.hot = cur.hot || r.hot;
		bySid.set(r.sid, cur);
	}
	const out = [...bySid.entries()].map(([sid, c]) =>
		`  ${dim(sid.slice(0, 8))}  ${c.hot ? amber("HOT ") : dim("soft")}  ${cyan(c.scopes.join(" "))}${c.intent ? dim(`  — ${c.intent}`) : ""}`,
	);
	console.log(out.length ? out.join("\n") : dim("(no claims)"));
} else {
	die(`unknown command "${cmd}" — try add | release | hot | cool | doctor | list`);
}
