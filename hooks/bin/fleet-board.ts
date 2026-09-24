// fleet-board.ts — live control-plane dashboard. Read-only: serves a page
// that polls governor.db every second (WAL allows concurrent readers).
// Start from anywhere:  bun ~/.claude/bin/fleet-board.ts [--port 7799]
// then open http://127.0.0.1:<port> — dropdown lists every known session;
// focusing a session shows its project's TODO / IN-FLIGHT / DONE board,
// its claims, inbox, lane state, and the event tail.
import { openGovernorDb } from "../lib/govdb.ts";

const db = openGovernorDb();
const PORT = Number(process.argv[process.argv.indexOf("--port") + 1] ?? 7799) || 7799;

const esc = (s: unknown): string =>
	String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));

function json(data: unknown): Response {
	return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
}

function ago(ts: number | null | undefined): number {
	return ts ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : -1;
}

function sessions(): unknown[] {
	return db
		.query("SELECT sid, role, state, parent_sid, project, hb FROM sessions ORDER BY state, sid")
		.all()
		.map((s: any) => ({
			sid: s.sid,
			role: s.role,
			state: s.state,
			parent: s.parent_sid,
			project: s.project,
			hbAgo: ago(s.hb),
		}));
}

function board(): Record<string, unknown>[] {
	const projects = db
		.query("SELECT DISTINCT project FROM work_items WHERE state NOT IN ('DONE','SUPERSEDED') OR state = 'DONE'")
		.all() as { project: string }[];
	return projects.map(({ project }) => {
		const items = db
			.query("SELECT id, state, owner_sid, title, priority, result_sha, updated_at FROM work_items WHERE project = ? ORDER BY priority DESC, id")
			.all(project) as any[];
		const doneIds = new Set(items.filter((w) => w.state === "DONE").map((w) => w.id));
		const blocked = new Set(
			db
				.query("SELECT work_id FROM work_deps WHERE project = ? AND depends_on NOT IN (SELECT id FROM work_items WHERE project = ? AND state = 'DONE')")
				.all(project, project)
				.map((r: any) => r.work_id),
		);
		const shape = (w: any) => ({
			id: w.id,
			state: w.state,
			owner: w.owner_sid,
			title: w.title,
			sha: w.result_sha,
			blocked: blocked.has(w.id),
			updatedAgo: ago(w.updated_at),
		});
		return {
			project,
			name: project.split("/").pop()?.replace(/\.git$/, "") || project.split("/").slice(-2, -1).pop() || project,
			todo: items.filter((w) => w.state === "READY" && !blocked.has(w.id)).map(shape),
			gated: items.filter((w) => (w.state === "READY" && blocked.has(w.id)) || w.state === "BLOCKED" || w.state === "PAUSED").map(shape),
			inflight: items.filter((w) => w.state === "CLAIMED" || w.state === "RUNNING").map(shape),
			done: items.filter((w) => w.state === "DONE").slice(-30).reverse().map(shape),
			other: items.filter((w) => w.state === "FAILED" || w.state === "SUPERSEDED" || w.state === "ORPHANED" || w.state === "SHATTERED").map(shape),
		};
	});
}

function claims(): unknown[] {
	return db
		.query("SELECT sid, scope, intent, hot, ts FROM claims ORDER BY sid, scope")
		.all()
		.map((c: any) => ({ sid: c.sid, scope: c.scope, intent: c.intent, hot: !!c.hot, tsAgo: ago(c.ts) }));
}

function events(): unknown[] {
	return db
		.query("SELECT id, ts, source, kind, scope, payload, target FROM events ORDER BY id DESC LIMIT 25")
		.all()
		.map((e: any) => {
			let note = "";
			try {
				note = e.payload ? Object.entries(JSON.parse(e.payload)).map(([k, v]) => k + "=" + String(v).slice(0, 40)).join(" ") : "";
			} catch {
				note = "(malformed)";
			}
			return { id: e.id, tsAgo: ago(e.ts), source: e.source, kind: e.kind, scope: e.scope, target: e.target, note };
		});
}

function laneFacts(sid: string): Record<string, unknown> {
	const rows = db.query("SELECT key, value FROM facts WHERE key = ? OR key = ?").all("lane." + sid + ".state", "lane." + sid + ".capsule") as any[];
	const out: Record<string, unknown> = {};
	for (const r of rows) out[r.key.split(".").pop()!] = r.value;
	return out;
}

function inbox(sid: string): unknown[] {
	const cur = (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(sid) as { event_id: number } | null)?.event_id ?? 0;
	return db
		.query("SELECT id, ts, source, kind, payload FROM events WHERE target = ? AND id > ? ORDER BY id")
		.all(sid, cur)
		.map((e: any) => ({ id: e.id, tsAgo: ago(e.ts), source: e.source, kind: e.kind, note: e.payload }));
}

function payload(): unknown {
	return {
		ts: Date.now(),
		sessions: sessions(),
		projects: board(),
		claims: claims(),
		events: events(),
	};
}

function payloadFor(sid: string): unknown {
	const base = payload() as any;
	const s = base.sessions.find((x: any) => x.sid === sid);
	return {
		...base,
		focus: sid,
		focusProject: s?.project ?? null,
		inbox: inbox(sid),
		lane: laneFacts(sid),
	};
}

const HTML = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><title>FLEET BOARD</title>
<style>
:root { color-scheme: dark; }
body { background:#0d1117; color:#c9d1d9; font:13px/1.45 ui-monospace,Menlo,monospace; margin:14px; }
h1 { font-size:15px; letter-spacing:.08em; margin:0 0 10px; color:#58a6ff; }
select { background:#161b22; color:#c9d1d9; border:1px solid #30363d; border-radius:6px; padding:4px 8px; font:inherit; max-width:420px; }
#health { margin:8px 0; }
#health .ok { color:#3fb950; }
#health .warn { color:#f0883e; }
.grid { display:grid; grid-template-columns:repeat(3,minmax(260px,1fr)); gap:12px; margin-top:10px; }
.col h2 { font-size:12px; color:#8b949e; margin:0 0 6px; letter-spacing:.1em; }
.card { background:#161b22; border:1px solid #30363d; border-radius:6px; padding:6px 8px; margin-bottom:6px; }
.card .id { color:#58a6ff; font-weight:600; }
.card .t { color:#c9d1d9; word-break:break-word; }
.card .m { color:#8b949e; font-size:11px; margin-top:2px; }
.card.mine { border-color:#1f6feb; }
.card.gated { opacity:.65; }
.card.sha { color:#3fb950; }
.row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
.feed { background:#161b22; border:1px solid #30363d; border-radius:6px; padding:6px 8px; font-size:12px; }
.feed div { padding:1px 0; color:#8b949e; }
.feed b { color:#c9d1d9; }
.pill { border:1px solid #30363d; border-radius:10px; padding:0 6px; font-size:11px; color:#8b949e; }
.hot { color:#f0883e; border-color:#f0883e; }
</style></head><body>
<h1>FLEET BOARD <span id="meta" class="pill"></span> <select id="sess"><option value="">— all sessions —</option></select></h1>
<div id="health" class="ok">…</div>
<div class="grid" id="board"></div>
<div class="row2">
  <div class="feed" id="claims"><b>CLAIMS</b><br></div>
  <div class="feed" id="events"><b>EVENT TAIL</b><br></div>
</div>
<script>
var sel = document.getElementById('sess');
var sessLoaded = false;
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function card(w, focus) {
  var mine = focus && w.owner === focus;
  var cls = 'card' + (mine ? ' mine' : '') + (w.blocked && w.state === 'READY' ? ' gated' : '');
  var m = [w.state, w.owner ? w.owner.slice(0,10) : '', w.updatedAgo >= 0 ? w.updatedAgo + 's' : ''].filter(Boolean).join(' · ');
  if (w.sha) m += ' @' + String(w.sha).slice(0,7);
  return '<div class="' + cls + '"><span class="id">' + esc(w.id) + '</span> <span class="t">' + esc(w.title).slice(0,90) + '</span><div class="m">' + esc(m) + '</div></div>';
}
function render(d) {
  if (!sessLoaded) {
    for (var i = 0; i < d.sessions.length; i++) {
      var s = d.sessions[i];
      var o = document.createElement('option');
      o.value = s.sid; o.textContent = s.sid.slice(0,10) + ' · ' + s.role + ' · ' + s.state;
      sel.appendChild(o);
    }
    sessLoaded = true;
  }
  if (sel.value && !d.sessions.some(function(s){return s.sid === sel.value;}) && sel.value.charAt(0) !== 'p') { /* keep */ }
  var focus = sel.value;
  var focusProj = focus ? (d.sessions.find(function(s){return s.sid === focus;}) || {}).project : null;
  var proj = d.projects;
  if (focusProj) proj = d.projects.filter(function(p){return p.project === focusProj;});
  var cols = [['TODO','todo'],['IN-FLIGHT','inflight'],['DONE','done']];
  var html = '';
  for (var c = 0; c < cols.length; c++) {
    html += '<div class="col"><h2>' + cols[c][0] + '</h2>';
    for (var p = 0; p < proj.length; p++) {
      var list = proj[p][cols[c][1]];
      if (proj.length > 1) html += '<div class="m">' + esc(proj[p].name) + '</div>';
      for (var k = 0; k < list.length; k++) html += card(list[k], focus);
    }
    html += '</div>';
  }
  document.getElementById('board').innerHTML = html;
  var h = '';
  h += '<span class="ok">health ok</span> · sessions ' + d.sessions.length + ' · poll 1s · ' + new Date(d.ts).toLocaleTimeString();
  document.getElementById('health').innerHTML = h;
  var cl = '<b>CLAIMS</b><br>';
  for (var i = 0; i < d.claims.length; i++) {
    var x = d.claims[i];
    cl += '<div>' + (x.hot ? '<span class="pill hot">HOT</span> ' : '') + '<b>' + esc(x.sid.slice(0,10)) + '</b> ' + esc(x.scope) + (x.intent ? ' — ' + esc(x.intent).slice(0,50) : '') + '</div>';
  }
  document.getElementById('claims').innerHTML = cl;
  var ev = '<b>EVENT TAIL</b><br>';
  for (var j = d.events.length - 1; j >= 0; j--) {
    var e = d.events[j];
    ev += '<div>#' + e.id + ' ' + e.tsAgo + 's <b>' + esc(e.kind) + '</b> ' + esc(e.source).slice(0,12) + (e.target ? ' → ' + esc(e.target).slice(0,10) : '') + (e.note ? ' — ' + esc(e.note).slice(0,60) : '') + '</div>';
  }
  document.getElementById('events').innerHTML = ev;
  document.getElementById('meta').textContent = focus ? 'focus ' + focus.slice(0,10) : 'all projects';
}
function tick() {
  fetch('/api/data?session=' + encodeURIComponent(sel.value)).then(function(r){return r.json();}).then(render).catch(function(){});
}
setInterval(tick, 1000);
sel.addEventListener('change', tick);
tick();
</script></body></html>`;

Bun.serve({
	port: PORT,
	hostname: "127.0.0.1",
	fetch(req) {
		const url = new URL(req.url);
		if (url.pathname === "/api/data") {
			const sid = url.searchParams.get("session") ?? "";
			return json(sid ? payloadFor(sid) : payload());
		}
		if (url.pathname === "/") return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
		return new Response("not found", { status: 404 });
	},
});
console.log(`fleet board → http://127.0.0.1:${PORT}  (governor.db, read-only, poll 1s)`);
