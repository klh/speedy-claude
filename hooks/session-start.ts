// hooks/session-start.ts — SessionStart control-plane bootstrap.
// Registers the live session, rebinds a closed predecessor when the lineage
// is unambiguous (exactly one closed session in this project still owning
// active work) and source is `resume`, then injects the restart packet
// (SESSION / REBIND / OWNED / READY / INBOX / HEAD). Stdout is injected as
// session context. CLAUDE_FLEET_BOOTSTRAP=0 opts out entirely.
import { existsSync, readFileSync } from "node:fs";
import { openGovernorDb, projectIdentity, CAPABILITIES } from "./lib/govdb.ts";

type In = { session_id?: string; source?: string; transcript_path?: string };

if (process.env.CLAUDE_FLEET_BOOTSTRAP === "0") process.exit(0);

const raw = await new Response(Bun.stdin.stream()).text();
const input = JSON.parse(raw) as In;
if (!input.session_id) process.exit(0);

const sid = input.session_id;
const src = input.source ?? "startup";
const project = projectIdentity();
const now = Date.now();

function pname(p: string): string {
	const parts = p.split("/");
	const last = parts[parts.length - 1].replace(/\.git$/, "");
	return last || parts[parts.length - 2] || p;
}

const RULES =
	"RULES: Work Graph (bun ~/.claude/bin/work.ts) is authoritative — " +
	"continue OWNED before taking new; own an item (work take) before code " +
	"work; never reconstruct mutable state from Markdown; parallelizable " +
	"work gets work split. Stuck or need a colleague's context: " +
	"coord consult/who-knows (questions, never ownership). Between items: " +
	"poll coord inbox --as <sid>; if READY work matches your capabilities, " +
	"take it yourself — don't wait for dispatch; checkpoint each landed " +
	"milestone (work done --sha / capsule) so preemption stays possible. " +
	"Decisions: a decision held only in your context is invisible to the " +
	"fleet and the owner — emit it (coord emit NEED_DECISION --to " +
	"<coordinator-or-own-sid> --note \"question + options\" --as <sid>) " +
	"the moment you hold one; the fleet board surfaces it for the human.";

// top-level sessions are full agent runtimes — advertise the complete
// capability set so capability-gated work stays takeable by them (lanes
// inherit their caps from the parent via coord bootstrap --parent)
const CAPS = CAPABILITIES.join(",");
const UPSERT =
	"INSERT INTO sessions (sid, project, role, parent_sid, worktree, started_at, hb, state, capabilities, transcript_path) " +
	"VALUES (?, ?, 'worker', NULL, NULL, ?, ?, 'RUNNING', ?, ?) " +
	"ON CONFLICT(sid) DO UPDATE SET project = excluded.project, hb = excluded.hb, state = 'RUNNING', capabilities = COALESCE(excluded.capabilities, sessions.capabilities), transcript_path = COALESCE(excluded.transcript_path, sessions.transcript_path)";

const DEAD_SQL =
	"SELECT s.sid FROM sessions s WHERE s.project = ? AND s.state = 'CLOSED' " +
	"AND EXISTS(SELECT 1 FROM work_items w WHERE w.owner_sid = s.sid " +
	"AND w.project = s.project AND w.state NOT IN ('DONE','SUPERSEDED','FAILED'))";

const OWNED_SQL =
	"SELECT id, title, state FROM work_items " +
	"WHERE project = ? AND owner_sid = ? " +
	"AND state NOT IN ('DONE','SUPERSEDED','FAILED') ORDER BY id";

const db = openGovernorDb();
db.query(UPSERT).run(sid, project, now, now, CAPS, input.transcript_path ?? null);
const out = [`SESSION ${sid.slice(0, 8)}  project=${pname(project)}`];

// lineage: only `resume` may rebind — startup/clear/compact never touch
// ownership. 0 closed owners → fresh start; 1 → deterministic rebind;
// >1 → escalate, never guess.
const dead = src === "resume" ? (db.query(DEAD_SQL).all(project) as { sid: string }[]) : [];
if (dead.length === 1 && dead[0].sid !== sid) {
	const p = Bun.spawnSync(["bun", `${process.env.HOME}/.claude/bin/coord.ts`, "resume-session", "--as", sid, "--from", dead[0].sid], {
		stdout: "pipe",
	});
	out.push(`REBIND ${new TextDecoder().decode(p.stdout).trim()}`);
} else if (dead.length > 1) {
	const ids = dead.map((d) => d.sid.slice(0, 8)).join(", ");
	out.push(`LINEAGE AMBIGUOUS: ${ids} — resolve with coord resume-session`);
}

const mine = db.query(OWNED_SQL).all(project, sid) as { id: string; title: string; state: string }[];
const readyN = (db.query("SELECT COUNT(*) AS n FROM work_items WHERE project = ? AND state = 'READY'").get(project) as { n: number }).n;
const cur = db.query("SELECT event_id FROM cursors WHERE sid = ?").get(sid) as { event_id: number } | null;
const inbox = (db.query("SELECT COUNT(*) AS n FROM events WHERE target = ? AND id > ?").get(sid, cur?.event_id ?? 0) as { n: number }).n;
const head = (db.query("SELECT value FROM facts WHERE key = 'integration.head'").get() as { value: string } | null)?.value;

if (mine.length || inbox > 0 || readyN > 0 || head) {
	const owned = mine.map((w) => `${w.id}[${w.state}] ${w.title.slice(0, 40)}`).join(", ");
	out.push(`OWNED ${mine.length}${owned ? `: ${owned}` : ""}  READY ${readyN}  INBOX ${inbox}${head ? `  head=${head.slice(0, 7)}` : ""}`);
	out.push(RULES);
}

// legacy-ledger notice: known operational-ledger names, unmarked = old habit
// may still treat them as live. One terse line, first match only. Deterministic
// filename check only — no content classification, no auto-migration.
const LEDGERS = ["MASTER-TASK-LEDGER.md", "TODO.md", "TASKS.md", "BACKLOG.md", "PROGRESS.md", "STATUS.md", "ROADMAP.md"];
outer: for (const dir of [".", "docs", "docs/design"]) {
	for (const name of LEDGERS) {
		const p = `${process.cwd()}/${dir === "." ? "" : `${dir}/`}${name}`;
		try {
			if (!existsSync(p) || readFileSync(p, "utf8").includes("HISTORICAL / DESIGN RECORD")) continue;
			out.push(`LEGACY LEDGER ${dir === "." ? "" : `${dir}/`}${name} — operational state belongs in the Work Graph (register items, add the HISTORICAL banner); never append progress there`);
			break outer;
		} catch {}
	}
}
console.log(out.join("\n"));
