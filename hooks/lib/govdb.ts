// hooks/lib/govdb.ts — shared governor registry DB (SQLite, WAL).
// One connection shape for every writer (governor gate, files gate; the
// standalone claim CLI keeps its own copy) + one-time JSON→SQL migrations so
// gates never read two sources of truth. busy_timeout is set BEFORE
// journal_mode: under contention the connection waits instead of throwing;
// WAL is persistent once set and verified on open.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync } from "node:fs";
import { resolve } from "node:path";

const REG = `${process.env.HOME}/.cache/claude-governor`;

// one project identity for the whole control plane: realpath of the repo's
// COMMON git dir — every worktree of one repo shares one Work Graph, and
// work.ts / coord.ts bootstrap / a future consult layer can never disagree
export function projectIdentity(): string {
	try {
		const r = Bun.spawnSync(["git", "-C", process.cwd(), "rev-parse", "--git-common-dir"], { stdout: "pipe", stderr: "pipe" });
		if (r.exitCode === 0) {
			const dir = new TextDecoder().decode(r.stdout).trim();
			if (dir) return realpathSync(resolve(process.cwd(), dir));
		}
	} catch {}
	return realpathSync(process.cwd());
}

// capability vocabulary for capability-aware dispatch (schema v2):
// work_items.requires ⊆ sessions.capabilities or work take refuses
export const CAPABILITIES = ["shell", "fs", "git", "build", "mcp", "vision", "browser", "network"];

export function openGovernorDb(): Database {
	mkdirSync(REG, { recursive: true });
	const db = new Database(`${REG}/governor.db`, { create: true });
	db.run("PRAGMA busy_timeout=2000");
	try {
		db.run("PRAGMA journal_mode=WAL");
	} catch {
		const mode = (db.query("PRAGMA journal_mode").get() as { journal_mode?: string })?.journal_mode;
		if (mode?.toLowerCase() !== "wal") throw new Error(`governor.db WAL unavailable (got: ${mode ?? "unknown"})`);
	}
	db.run("PRAGMA synchronous=NORMAL");
	db.run("PRAGMA foreign_keys=ON"); // composite FKs guard work_deps against cross-project/orphan edges
	// schema versioning via PRAGMA user_version: baseline 1 = composite-PK work
	// graph. Future migrations must be explicit steps (v1→v2), never inferred.
	const uv = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
	if (uv < 1) db.run("PRAGMA user_version = 1");
	db.run(
		"CREATE TABLE IF NOT EXISTS claims (sid TEXT NOT NULL, scope TEXT NOT NULL, intent TEXT, hot INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL, tp TEXT, PRIMARY KEY (sid, scope))",
	);
	db.run(
		"CREATE TABLE IF NOT EXISTS locks (path TEXT PRIMARY KEY, sid TEXT NOT NULL, tool TEXT, ts INTEGER NOT NULL, tp TEXT, hash TEXT, seen TEXT)",
	);
	// event bus (coord.ts): append-only events, per-agent cursors, canonical facts.
	// target = directed inbox (null = broadcast); added by migration on older DBs.
	db.run(
		"CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, scope TEXT, payload TEXT, target TEXT)",
	);
	const evCols = (db.query("PRAGMA table_info(events)").all() as { name: string }[]).map((c) => c.name);
	if (!evCols.includes("target")) db.run("ALTER TABLE events ADD COLUMN target TEXT");
	db.run("CREATE TABLE IF NOT EXISTS cursors (sid TEXT PRIMARY KEY, event_id INTEGER NOT NULL)");
	// work graph: hierarchical, claimable, shatterable work items (bin/work.ts).
	// project = repo root realpath — partitions the graph per project so
	// sessions in different repos never see (or steal) each other's work.
	// CREATE TABLE IF NOT EXISTS cannot upgrade a live table, so pre-partitioned
	// (single-PK) tables are dropped once — safe while the graph has no
	// production rows.
	const staleWork = (name: string): boolean => {
		const row = db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as
			| { sql?: string }
			| undefined;
		return !!row?.sql && !/PRIMARY KEY\s*\(\s*project/.test(row.sql);
	};
	if (staleWork("work_deps")) db.run("DROP TABLE work_deps");
	if (staleWork("work_items")) db.run("DROP TABLE work_items");
	db.run(
		"CREATE TABLE IF NOT EXISTS work_items (project TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, title TEXT NOT NULL, description TEXT, state TEXT NOT NULL DEFAULT 'READY', priority INTEGER NOT NULL DEFAULT 0, owner_sid TEXT, created_by TEXT, scope TEXT, why_parallel TEXT, result_sha TEXT, required INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (project, id))",
	);
	db.run(
		"CREATE TABLE IF NOT EXISTS work_deps (project TEXT NOT NULL, work_id TEXT NOT NULL, depends_on TEXT NOT NULL, PRIMARY KEY (project, work_id, depends_on), FOREIGN KEY (project, work_id) REFERENCES work_items(project, id) ON DELETE CASCADE, FOREIGN KEY (project, depends_on) REFERENCES work_items(project, id) ON DELETE CASCADE)",
	);
	db.run("CREATE TABLE IF NOT EXISTS work_sequences (project TEXT PRIMARY KEY, next_id INTEGER NOT NULL)");
	// consults: quick questions between sessions — never claims, ownership, or
	// lane state. WORK = implement, CONSULT = answer, HANDOFF = take ownership.
	db.run(
		"CREATE TABLE IF NOT EXISTS consults (id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, asker_sid TEXT NOT NULL, expert_sid TEXT NOT NULL, question TEXT NOT NULL, scope TEXT, state TEXT NOT NULL DEFAULT 'OPEN', answer TEXT, created_at INTEGER NOT NULL, answered_at INTEGER)",
	);
	// session registry (coord bootstrap): who exists, where, doing what role
	db.run(
		"CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, project TEXT, role TEXT, parent_sid TEXT, worktree TEXT, started_at INTEGER NOT NULL, hb INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'RUNNING')",
	);
	// v2 — capability-aware dispatch: work declares requires (csv), sessions
	// advertise capabilities (csv); work take refuses requires ⊄ capabilities.
	// NULL on either side = legacy = no constraint. Explicit migration step.
	const sessCols = (db.query("PRAGMA table_info(sessions)").all() as { name: string }[]).map((c) => c.name);
	if (!sessCols.includes("capabilities")) db.run("ALTER TABLE sessions ADD COLUMN capabilities TEXT");
	if (!sessCols.includes("transcript_path")) db.run("ALTER TABLE sessions ADD COLUMN transcript_path TEXT");
	const wiCols = (db.query("PRAGMA table_info(work_items)").all() as { name: string }[]).map((c) => c.name);
	if (!wiCols.includes("requires")) db.run("ALTER TABLE work_items ADD COLUMN requires TEXT");
	if (uv < 2) db.run("PRAGMA user_version = 2");
	db.run(
		"CREATE TABLE IF NOT EXISTS facts (key TEXT PRIMARY KEY, value TEXT, source TEXT, version INTEGER NOT NULL DEFAULT 1, ts INTEGER NOT NULL)",
	);
	migrateJSON(db);
	return db;
}

// JSON registries → SQL, once, idempotently (whoever runs first migrates; the
// second process sees the .migrated rename and skips). INSERT OR REPLACE keeps
// double-import harmless if two gates race before either renames.
function migrateJSON(db: Database): void {
	const CJ = `${REG}/claims.json`;
	if (existsSync(CJ)) {
		try {
			const legacy = JSON.parse(readFileSync(CJ, "utf8")) as Record<
				string, { sid?: string; scopes?: string[]; intent?: string; ts?: number; tp?: string; hot?: boolean }
			>;
			const ins = db.query(
				"INSERT OR REPLACE INTO claims (sid, scope, intent, hot, ts, tp) VALUES (?, ?, ?, ?, ?, ?)",
			);
			for (const [cid, c] of Object.entries(legacy)) {
				for (const s of c?.scopes ?? []) ins.run(c?.sid ?? cid, s, c?.intent ?? null, c?.hot ? 1 : 0, c?.ts ?? Date.now(), c?.tp ?? null);
			}
			renameSync(CJ, `${CJ}.migrated`);
		} catch {}
	}
	const LJ = `${REG}/locks.json`;
	if (existsSync(LJ)) {
		try {
			const locks = JSON.parse(readFileSync(LJ, "utf8")) as Record<
				string, { sid: string; tool?: string; ts: number; tp?: string; hash?: string; seen?: string[] }
			>;
			const ins = db.query(
				"INSERT OR REPLACE INTO locks (path, sid, tool, ts, tp, hash, seen) VALUES (?, ?, ?, ?, ?, ?, ?)",
			);
			for (const [p, l] of Object.entries(locks)) {
				ins.run(p, l.sid, l.tool ?? null, l.ts ?? 0, l.tp ?? null, l.hash ?? null, l.seen ? JSON.stringify(l.seen) : null);
			}
			renameSync(LJ, `${LJ}.migrated`);
		} catch {}
	}
}
