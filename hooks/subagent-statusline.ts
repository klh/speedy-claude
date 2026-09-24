#!/usr/bin/env bun
// subagent-statusline.ts — renders agent-panel rows as a PROJECTION of the
// coordination plane (governor.db), so the panel is semantically identical to
// lane state: ▶ run · ⏸ pause_requested/paused · ⚠ blocked · ✓ done.
// Contract: row context JSON on stdin → { id, content } on stdout.
// Fail-open: any error exits silently and the harness renders its default row.
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Row = {
	id?: string;
	sessionId?: string;
	session_id?: string;
	agentId?: string;
	description?: string;
	task?: string;
	agentType?: string;
};

const R = "\x1b[0m";
const c = (code: string, s: string) => `\x1b[${code}m${s}${R}`;
const dim = (s: string) => c("2", s);
const amber = (s: string) => c("1;33", s);
const cyan = (s: string) => c("36", s);
const red = (s: string) => c("1;31", s);
const green = (s: string) => c("32", s);

try {
	const row = JSON.parse(await new Response(Bun.stdin).text()) as Row;
	const sid = row.sessionId ?? row.session_id ?? row.agentId ?? row.id ?? "";
	let line = row.description ?? row.task ?? "";
	const t = row.agentType ? `${dim(row.agentType)} ` : "";

	try {
		const db = new Database(`${process.env.HOME}/.cache/claude-governor/governor.db`);
		// layout-agnostic lane matching: a row may carry the sid under any key,
		// so match against the RAW row text over known lane ids
		const laneSids = [
			...(db.query("SELECT DISTINCT sid FROM claims").all() as { sid: string }[]),
			...(db.query("SELECT key FROM facts WHERE key LIKE 'lane.%.state'").all() as { key: string }[]).map((k) =>
				k.key.replace(/^lane\./, "").replace(/\.state$/, ""),
			),
		];
		const raw = JSON.stringify(row);
		const laneSid = laneSids.find((s) => s && raw.includes(s));
		const st = laneSid ? (db.query("SELECT value FROM facts WHERE key = ?").get(`lane.${laneSid}.state`) as { value: string } | null) : null;
		const claimed = laneSid ? 1 : 0;
		const cap = laneSid ? (db.query("SELECT value FROM facts WHERE key = ?").get(`lane.${laneSid}.capsule`) as { value: string } | null) : null;
		// payload capture (capped) — lets us fix key mappings against reality
		try {
			const log = "/tmp/subagent-rows.jsonl";
			const prev = existsSync(log) ? readFileSync(log, "utf8").split("\n").slice(-200) : [];
			prev.push(JSON.stringify(row));
			writeFileSync(log, prev.filter(Boolean).join("\n") + "\n");
		} catch {}
		db.close();
		const glyph: Record<string, [string, (s: string) => string]> = {
			PAUSE_REQUESTED: ["⏸", amber],
			PAUSED: ["⏸", amber],
			RESUME_READY: ["↻", cyan],
			RUNNING: ["▶", green],
		};
		if (st?.value && glyph[st.value]) {
			const [g, col] = glyph[st.value];
			const label = st.value === "PAUSE_REQUESTED" ? "PAUSE_REQUESTED" : st.value === "RESUME_READY" ? "RESUME_READY" : st.value;
			line = `${col(g)} ${t}${col(label)}${cap && st.value === "PAUSED" ? dim(" · capsule banked") : ""}`;
		} else if (claimed.n > 0) {
			line = `${green("▶")} ${t}${line}`;
		} else if (line) {
			line = `${dim("◌")} ${t}${dim(line)}`;
		}
	} catch {
		// control plane unavailable — pass the plain row through
	}
	process.stdout.write(JSON.stringify({ id: row.id, content: line }));
} catch {
	// unparsable stdin — exit non-zero, harness falls back to its default row
	process.exit(1);
}
