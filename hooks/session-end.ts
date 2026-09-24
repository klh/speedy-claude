// hooks/session-end.ts — SessionEnd: mark the session CLOSED in the control
// plane. Deliberately does NOT release owned work — a closed session may be
// resumed (coord resume-session); work stays with the owner until rebind or
// `work orphaned` → `work reclaim`.
import { openGovernorDb } from "./lib/govdb.ts";

const input = JSON.parse(await new Response(Bun.stdin.stream()).text()) as { session_id?: string };
if (input.session_id) {
	openGovernorDb()
		.query("UPDATE sessions SET state = 'CLOSED', hb = ? WHERE sid = ?")
		.run(Date.now(), input.session_id);
}
process.exit(0);
