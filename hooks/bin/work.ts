// work.ts — the Work Graph: hierarchical, claimable, shatterable work items
// in governor.db, partitioned per project (repo root). Replaces TODO/ledger
// Markdown as the operational state DB — Markdown keeps architecture and
// decisions; the DB owns runtime state.
//
// project-scoping invariant (composite PK: (project, id)): NO work_items query
// identifies a row by id alone, NO work_deps query omits project. Row access
// goes through get/setState/deps, which own the project bind; the only
// exception is take's CAS, which needs the state guard in its WHERE.
//
// usage:
//   work add <title> [--scope s] [--parent <id>] [--priority n] [--desc "..."] [--by sid]
//   work list [open|ready|all] / work ready / work mine --as <sid> / work owned
//   work show <id>
//   work take <id> --as <sid>            (CAS: READY → CLAIMED; refuses taken/unmet-deps/foreign-project)
//   work release <id> [--as sid]         (CLAIMED → READY; releases the scope claim)
//   work start <id>                      (CLAIMED → RUNNING)
//   work done <id> --sha <sha>           (→ DONE + auto-releases claim + auto-rolls SHATTERED parents up)
//   work fail <id> --note "why"
//   work split <id> "t1" "t2" ... --reason independent-scopes [--keep N]
//   work block <id> --on <id2>           / work unblock <id> --on <id2>   (cycle-checked)
//   work supersede <id> --by <new-id>
//   work orphaned                        / work reclaim <id>
import { existsSync, statSync } from "node:fs";
import { Database } from "bun:sqlite";
import { openGovernorDb, projectIdentity, CAPABILITIES } from "../lib/govdb.ts";

const die = (m: string): never => {
	console.error(`work: ${m}`);
	process.exit(2);
};

const db: Database = openGovernorDb();
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name: string): string | null => {
	const i = rest.indexOf(name);
	return i >= 0 ? (rest[i + 1] ?? null) : null;
};

// --help anywhere wins before any parsing that could create state
if (!cmd || cmd === "--help" || cmd === "-h" || rest.includes("--help") || rest.includes("-h")) {
	if (cmd) {
		console.log("work — hierarchical shatterable work graph. add | list | ready | mine | owned | show | take | release | start | done | fail | supersede | split | block | unblock | orphaned | reclaim");
		process.exit(0);
	}
	console.error("usage: work <command> [args] — try `work --help`");
	process.exit(2);
}

// option-looking tokens are never content: positionals skip known flags AND
// their values, plus any other --token
const KNOWN_FLAGS = new Set(["--scope", "--parent", "--priority", "--desc", "--by", "--reason", "--keep", "--sha", "--note", "--on", "--as", "--requires"]);
const CAPS = new Set(CAPABILITIES);
const pos = (): string[] => {
	const out: string[] = [];
	for (let i = 0; i < rest.length; i++) {
		if (KNOWN_FLAGS.has(rest[i])) {
			i++;
			continue;
		}
		if (rest[i].startsWith("--")) die(`unknown option: ${rest[i]}`);
		out.push(rest[i]);
	}
	return out;
};

// project partitioning: shared identity from govdb (repo's common git dir) —
// sessions in different projects never see or steal each other's work
const PROJECT = projectIdentity();

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

const GLYPH: Record<string, [string, (s: string) => string]> = {
	READY: ["·", cyan],
	CLAIMED: ["◐", cyan],
	RUNNING: ["▶", green],
	BLOCKED: ["⚠", red],
	PAUSED: ["⏸", amber],
	DONE: ["✓", green],
	FAILED: ["✗", red],
	SUPERSEDED: ["■", dim],
	SHATTERED: ["⊞", cyan],
	ORPHANED: ["◌", amber],
};

type Item = Record<string, string | number | null>;

function get(id: string): Item {
	const r = db.query("SELECT * FROM work_items WHERE project = ? AND id = ?").get(PROJECT, id) as Item | undefined;
	if (!r) die(`no such work item in this project: ${id}`);
	return r;
}

// owner/sha semantics: undefined = keep current value, null = clear
function setState(id: string, state: string, owner?: string | null, sha?: string | null): void {
	const sets = ["state = ?", "updated_at = ?"];
	const vals: (string | number)[] = [state, Date.now()];
	if (owner !== undefined) {
		sets.push("owner_sid = ?");
		vals.push(owner);
	}
	if (sha !== undefined) {
		sets.push("result_sha = ?");
		vals.push(sha);
	}
	db.query(`UPDATE work_items SET ${sets.join(", ")} WHERE project = ? AND id = ?`).run(...vals, PROJECT, id);
}

function emit(kind: string, id: string, extra: Record<string, string> = {}, source = "work"): void {
	db.query(
		"INSERT INTO events (ts, source, kind, scope, payload, target) SELECT ?, ?, ?, scope, ?, NULL FROM work_items WHERE project = ? AND id = ?",
	).run(Date.now(), source, kind, JSON.stringify({ work: id, ...extra }), PROJECT, id);
}

function deps(id: string): { depends_on: string; state: string | null }[] {
	return db
		.query("SELECT d.depends_on, w.state FROM work_deps d LEFT JOIN work_items w ON w.id = d.depends_on AND w.project = d.project WHERE d.project = ? AND d.work_id = ?")
		.all(PROJECT, id) as { depends_on: string; state: string | null }[];
}

function depsMet(id: string): boolean {
	return deps(id).every((d) => d.state === "DONE");
}

// reaches(id, target): would a dependency edge id→target create/extend a cycle?
function reaches(id: string, target: string, seen = new Set<string>()): boolean {
	if (id === target) return true;
	if (seen.has(id)) return false;
	seen.add(id);
	for (const d of deps(id)) if (reaches(d.depends_on, target, seen)) return true;
	return false;
}

// roll-up: a SHATTERED parent auto-DONEs when no REQUIRED child remains open
function rollUp(id: string): void {
	const it = get(id);
	if (it.state !== "SHATTERED") return;
	const open = db
		.query("SELECT COUNT(*) AS n FROM work_items WHERE project = ? AND parent_id = ? AND state IN ('READY','CLAIMED','RUNNING','BLOCKED','PAUSED') AND (required IS NULL OR required = 1)")
		.get(PROJECT, id) as { n: number };
	if (open.n === 0) {
		setState(id, "DONE");
		emit("work.done", id, { auto: "all required children complete" });
		const p = it.parent_id;
		if (p) rollUp(p as string);
	}
}

function nextChildId(parent: string): string {
	// max numeric suffix, not COUNT — a deleted child must not cause a collide
	const n = (db.query("SELECT MAX(CAST(SUBSTR(id, length(?) + 2) AS INTEGER)) AS m FROM work_items WHERE project = ? AND parent_id = ?").get(parent, PROJECT, parent) as { m: number | null }).m;
	return `${parent}.${(n ?? 0) + 1}`;
}

function nextRootId(): string {
	// atomic per-project allocation: one upsert statement is the allocator, so
	// concurrent `work add` races each get a distinct id instead of one losing
	// to a UNIQUE error. Seeds from existing max, then increments.
	const tx = db.transaction(() => {
		db.query(
			"INSERT INTO work_sequences (project, next_id) SELECT ?, COALESCE(MAX(CAST(SUBSTR(id, 2) AS INTEGER)), 0) + 1 FROM work_items WHERE project = ? AND id GLOB 'W[0-9]*' AND id NOT LIKE '%.%' ON CONFLICT(project) DO UPDATE SET next_id = next_id + 1",
		).run(PROJECT, PROJECT);
		return (db.query("SELECT next_id FROM work_sequences WHERE project = ?").get(PROJECT) as { next_id: number }).next_id;
	});
	return `W${tx()}`;
}

function insertItem(id: string, parentId: string | null, title: string, scope: string | null, priority: number, by: string, why: string | null): void {
	db.query(
		"INSERT INTO work_items (id, parent_id, title, state, priority, created_by, scope, why_parallel, project, required, created_at, updated_at) VALUES (?, ?, ?, 'READY', ?, ?, ?, ?, ?, 1, ?, ?)",
	).run(id, parentId, title, priority, by, scope, why, PROJECT, Date.now(), Date.now());
}

// claim coupling: taking work auto-claims its scope; finishing releases it —
// one ownership system, not two that drift
function autoClaim(sid: string, scope: string | null): void {
	if (!scope) return;
	db.query("INSERT OR REPLACE INTO claims (sid, scope, intent, hot, ts, tp) VALUES (?, ?, 'work-graph', 0, ?, ?)").run(sid, scope, Date.now(), liveTranscript(sid) ?? "");
}
function releaseClaim(sid: string, scope: string | null, itemId?: string): void {
	// release the autoClaim (sid,scope) AND legacy/intent-scoped claims that
	// reference this item — scopeless items otherwise leak claims on DONE
	db.query("DELETE FROM claims WHERE sid = ? AND (scope = ? OR (? IS NOT NULL AND intent LIKE ? || ' %'))").run(
		sid,
		scope,
		itemId ?? null,
		itemId ?? "",
	);
}

function renderRow(r: Item): string {
	const [g, col] = GLYPH[r.state as string] ?? ["?", dim];
	const owner = r.owner_sid ? dim(String(r.owner_sid).slice(0, 6)) : "";
	const req = r.requires ? dim(` ⟨needs ${r.requires}⟩`) : "";
	return `  ${col(g)} ${cyan(String(r.id).padEnd(7))}${String(r.title).slice(0, 56)}${owner ? `  ${owner}` : ""}${req}`;
}

function liveTranscript(sid: string): string | null {
	const floor = Date.now() - 15 * 60_000;
	try {
		const glob = new Bun.Glob(`**/*${sid}*.jsonl`);
		for (const rel of glob.scanSync({ cwd: `${process.env.HOME}/.claude/projects`, onlyFiles: true })) {
			const f = `${process.env.HOME}/.claude/projects/${rel}`;
			try {
				if (existsSync(f) && statSync(f).mtimeMs > floor) return f;
			} catch {}
		}
	} catch {}
	return null;
}

if (cmd === "add") {
	const title = pos()[0];
	if (!title) die('usage: add <title> [--scope s] [--parent <id>] [--priority n] [--desc "..."] [--by sid]');
	const parent = arg("--parent");
	const scope = arg("--scope");
	const priority = Number(arg("--priority") ?? 0);
	const by = arg("--by") ?? "unknown";
	const requires = arg("--requires");
	if (requires) {
		const bad = requires.split(",").filter((c) => !CAPS.has(c.trim()));
		if (bad.length) die(`unknown capability: ${bad.join(",")} — vocabulary: ${[...CAPS].join(",")}`);
	}
	const id = parent ? nextChildId(parent) : nextRootId();
	if (parent) get(parent);
	insertItem(id, parent, title, scope, priority, by, arg("--reason"));
	if (requires)
		db.query("UPDATE work_items SET requires = ? WHERE project = ? AND id = ?").run(
			requires.split(",").map((c) => c.trim()).join(","),
			PROJECT,
			id,
		);
	emit("work.added", id, { scope: scope ?? "" });
	console.log(`${green("✓")} ${cyan(id)} ${dim("READY")} — ${title}`);
} else if (cmd === "list" || cmd === "ready") {
	const mode = cmd === "ready" ? "ready" : rest[0] ?? "open";
	let rows: Item[];
	if (mode === "ready") {
		rows = (db.query("SELECT * FROM work_items WHERE project = ? AND state = 'READY' ORDER BY priority DESC, id").all(PROJECT) as Item[]).filter((r) => depsMet(r.id as string));
	} else if (mode === "all") {
		rows = db.query("SELECT * FROM work_items WHERE project = ? ORDER BY id").all(PROJECT) as Item[];
	} else {
		rows = db.query("SELECT * FROM work_items WHERE project = ? AND state NOT IN ('DONE','SUPERSEDED') ORDER BY id").all(PROJECT) as Item[];
	}
	console.log(rows.map(renderRow).join("\n") || dim("(none)"));
} else if (cmd === "mine") {
	const as = arg("--as");
	if (!as) die("usage: mine --as <sid>");
	const rows = db.query("SELECT * FROM work_items WHERE project = ? AND owner_sid = ? AND state NOT IN ('DONE','SUPERSEDED') ORDER BY id").all(PROJECT, as) as Item[];
	console.log(rows.length ? rows.map(renderRow).join("\n") : dim("(nothing owned)"));
} else if (cmd === "owned") {
	const rows = db.query("SELECT * FROM work_items WHERE project = ? AND owner_sid IS NOT NULL AND state NOT IN ('DONE','SUPERSEDED') ORDER BY owner_sid, id").all(PROJECT) as Item[];
	console.log(rows.map(renderRow).join("\n") || dim("(nothing owned)"));
} else if (cmd === "show") {
	const id = pos()[0];
	const it = get(id ?? "");
	const [g, col] = GLYPH[it.state as string] ?? ["?", dim];
	console.log(`${col(g)} ${it.id} ${col(it.state as string)}  ${it.title}`);
	for (const k of ["scope", "owner_sid", "result_sha", "why_parallel", "requires", "description"] as const) {
		if (it[k]) console.log(`  ${dim(`${k}:`)} ${it[k]}`);
	}
	const kids = db.query("SELECT * FROM work_items WHERE project = ? AND parent_id = ? ORDER BY id").all(PROJECT, id) as Item[];
	if (kids.length) {
		console.log(dim("  children:"));
		console.log(kids.map(renderRow).join("\n"));
	}
	const d = deps(id ?? "");
	if (d.length) console.log(dim(`  depends on: ${d.map((x) => `${x.depends_on}(${x.state ?? "?"})`).join(", ")}`));
} else if (cmd === "take") {
	const id = pos()[0];
	let as = arg("--as");
	if (!id || !as) die("usage: take <id> --as <sid>");
	// truncated-sid guard: a display slice (e.g. 'visual-c') must not become
	// the owner of record — expand a unique session-sid prefix to the full sid
	const sm = db.query("SELECT sid FROM sessions WHERE sid LIKE ? || '%'").all(as) as { sid: string }[];
	if (sm.length === 1) as = sm[0].sid;
	else if (sm.length > 1) die(`ambiguous sid prefix: ${as} — use the full sid`);
	const it = get(id);
	// capability-aware dispatch (v2): requires ⊆ capabilities or refuse —
	// kills the W28/W29-class NO-SHELL dead spawn at the CLI boundary
	const caps = ((db.query("SELECT capabilities FROM sessions WHERE sid = ?").get(as) as { capabilities: string | null } | null)?.capabilities ?? "")
		.split(",")
		.filter(Boolean);
	const missing = ((it.requires as string | null) ?? "").split(",").filter(Boolean).filter((r) => !caps.includes(r));
	if (missing.length)
		die(
			`${id} requires [${missing.join(",")}] — session ${as.slice(0, 8)} advertises [${caps.join(",") || "none"}] — dispatch to a capable agent`,
		);
	if (!depsMet(id)) die(`${id} has unmet dependencies: ${deps(id).filter((d) => d.state !== "DONE").map((d) => d.depends_on).join(", ")}`);
	// compare-and-set: two lanes racing for the last READY item → exactly one wins
	const r = db.query("UPDATE work_items SET state = 'CLAIMED', owner_sid = ?, updated_at = ? WHERE project = ? AND id = ? AND state = 'READY'").run(as, Date.now(), PROJECT, id);
	if (r.changes === 0) die(`${id} was taken (or is not READY) — race lost, pick another from \`work ready\``);
	autoClaim(as, it.scope as string | null);
	emit("work.claimed", id, { by: as });
	console.log(`${green("✓")} ${cyan(id)} claimed by ${dim(as.slice(0, 8))}`);
} else if (cmd === "release") {
	const id = pos()[0];
	if (!id) die("usage: release <id> [--as sid]");
	const it = get(id);
	setState(id, "READY", null);
	releaseClaim((it.owner_sid as string) ?? "", it.scope as string | null, it.id as string);
	emit("work.released", id, { by: ((it.owner_sid as string) ?? "").slice(0, 8) });
	console.log(`${cyan("·")} ${dim(`${id} → READY`)}`);
} else if (cmd === "start") {
	const id = pos()[0];
	get(id ?? "");
	setState(id, "RUNNING");
	console.log(`${green("▶")} ${id}`);
} else if (cmd === "done") {
	const id = pos()[0];
	const sha = arg("--sha");
	if (!id) die("usage: done <id> --sha <sha>");
	const it = get(id);
	const tx = db.transaction(() => {
		setState(id, "DONE", null, sha);
		emit("work.done", id, { sha: sha ?? "" });
		releaseClaim((it.owner_sid as string) ?? "", it.scope as string | null, it.id as string);
	});
	tx();
	rollUp(id);
	const p = it.parent_id;
	if (p) rollUp(p as string);
	console.log(`${green("✓")} ${cyan(id)} DONE${sha ? ` @${sha.slice(0, 8)}` : ""}`);
} else if (cmd === "fail") {
	const id = pos()[0];
	const note = arg("--note") ?? "";
	get(id ?? "");
	setState(id, "FAILED");
	emit("work.failed", id, { note });
	console.log(`${red("✗")} ${id} FAILED${note ? dim(` — ${note}`) : ""}`);
} else if (cmd === "supersede") {
	const id = pos()[0];
	const byId = arg("--by");
	if (!id || !byId) die("usage: supersede <id> --by <new-id>");
	get(id);
	setState(id, "SUPERSEDED", null, byId);
	console.log(`${dim("■")} ${id} superseded by ${byId}`);
} else if (cmd === "block") {
	const id = pos()[0];
	const on = arg("--on");
	if (!id || !on) die("usage: block <id> --on <other-id>");
	get(on ?? "");
	if (reaches(on, id)) die(`dependency cycle: ${on} already (transitively) depends on ${id}`);
	db.query("INSERT OR REPLACE INTO work_deps (project, work_id, depends_on) VALUES (?, ?, ?)").run(PROJECT, id, on);
	console.log(`${red("⚠")} ${id} blocked on ${on}`);
} else if (cmd === "unblock") {
	const id = pos()[0];
	const on = arg("--on");
	if (!id || !on) die("usage: unblock <id> --on <id2>");
	db.query("DELETE FROM work_deps WHERE project = ? AND work_id = ? AND depends_on = ?").run(PROJECT, id, on);
	console.log(`${cyan("·")} ${id} unblocked from ${on}`);
} else if (cmd === "split") {
	// atomic shatter: parent → SHATTERED, children → READY; the splitter may
	// keep one child (--keep N, 1-based). Requires why_parallel so splits
	// answer "why is this parallel work at all".
	const id = pos()[0];
	const knownVals = new Set(["--reason", "--keep"]);
	const titles: string[] = [];
	for (let i = 1; i < rest.length; i++) {
		if (knownVals.has(rest[i])) {
			i++;
			continue;
		}
		if (rest[i].startsWith("--")) die(`unknown option: ${rest[i]}`);
		titles.push(rest[i]);
	}
	const reason = arg("--reason");
	const keep = Number(arg("--keep") ?? 0);
	if (!id || titles.length < 2 || !reason) die('usage: split <id> "title1" "title2" ... --reason independent-scopes [--keep N]');
	const it = get(id);
	if (!["READY", "CLAIMED", "RUNNING"].includes(it.state as string)) die(`${id} is ${it.state} — only READY/CLAIMED/RUNNING items can shatter`);
	const tx = db.transaction(() => {
		setState(id, "SHATTERED");
		let n = 0;
		for (const t of titles) {
			const cid = nextChildId(id);
			insertItem(cid, id, t, it.scope as string | null, Number(it.priority), it.owner_sid as string, reason);
			if (++n === keep) setState(cid, "CLAIMED", it.owner_sid as string);
		}
	});
	tx();
	emit("work.shattered", id, { children: String(titles.length), reason });
	const kids = db.query("SELECT * FROM work_items WHERE project = ? AND parent_id = ? ORDER BY id").all(PROJECT, id) as Item[];
	console.log(`${cyan("⊞")} ${cyan(id)} SHATTERED → ${titles.length} children${keep ? `, child ${keep} kept by ${dim(String(it.owner_sid ?? "").slice(0, 8))}` : ""}`);
	console.log(kids.map(renderRow).join("\n"));
} else if (cmd === "orphaned") {
	// CLAIMED/RUNNING items whose owner transcript is dead — inspect capsules
	// before reclaiming (do NOT silently return work with uncommitted state)
	const rows = db.query("SELECT * FROM work_items WHERE project = ? AND state IN ('CLAIMED','RUNNING') ORDER BY id").all(PROJECT) as Item[];
	const out = rows.filter((r) => !liveTranscript(String(r.owner_sid)));
	console.log(out.length ? out.map(renderRow).join("\n") : dim("(no orphans)"));
} else if (cmd === "reclaim") {
	const id = pos()[0];
	const it = get(id ?? "");
	if (!["CLAIMED", "RUNNING", "ORPHANED"].includes(it.state as string)) die(`${id} is ${it.state} — only CLAIMED/RUNNING/ORPHANED can be reclaimed`);
	setState(id, "READY", null);
	releaseClaim((it.owner_sid as string) ?? "", it.scope as string | null, it.id as string);
	emit("work.released", id, { by: ((it.owner_sid as string) ?? "").slice(0, 8) });
	console.log(`${cyan("·")} ${id} reclaimed → READY`);
} else {
	die("unknown command — try add | list | ready | mine | owned | show | take | release | start | done | fail | supersede | split | block | unblock | orphaned | reclaim");
}
