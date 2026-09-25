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

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function ago(ts: number | null | undefined): number {
	return ts ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : -1;
}

function label(sid: string, role: string): string {
	const rows = db.query("SELECT intent FROM claims WHERE sid = ? AND intent IS NOT NULL ORDER BY ts DESC LIMIT 4").all(sid) as { intent: string | null }[];
	const c = rows.find((r) => r.intent && !String(r.intent).startsWith("restored by monitor"));
	if (c?.intent) return String(c.intent).slice(0, 24);
	if (role === "coordinator") return "coordinator";
	return sid.slice(0, 8);
}

function sessions(): unknown[] {
	return db
		.query("SELECT sid, role, state, parent_sid, project, hb FROM sessions ORDER BY state, sid")
		.all()
		.map((s: any) => ({
			sid: s.sid,
			label: label(s.sid, s.role),
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
			.query("SELECT id, state, owner_sid, title, priority, result_sha, requires, updated_at FROM work_items WHERE project = ? ORDER BY priority DESC, id")
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
			requires: w.requires,
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

function needsMap(): Record<string, { id: number; tsAgo: number; source: string; note: string }[]> {
	const out: Record<string, { id: number; tsAgo: number; source: string; note: string }[]> = {};
	// every distinct NEED% target surfaces — including alias targets with no
	// sessions row (dead-letter inboxes are exactly where decisions pile up)
	const targets = db.query("SELECT DISTINCT target AS sid FROM events WHERE kind LIKE 'NEED%' AND target IS NOT NULL").all() as { sid: string }[];
	for (const { sid } of targets) {
		const cur = (db.query("SELECT event_id FROM cursors WHERE sid = ?").get(sid) as { event_id: number } | null)?.event_id ?? 0;
		for (const e of db
			.query("SELECT id, ts, source, payload FROM events WHERE target = ? AND id > ? AND kind LIKE 'NEED%' AND id NOT IN (SELECT CAST(substr(key, 11) AS INTEGER) FROM facts WHERE key LIKE 'board.ack.%') ORDER BY id")
			.all(sid, cur) as any[]) {
			let note = "";
			try {
				const p = e.payload ? JSON.parse(e.payload) : {};
				note = String(p.note ?? p.question ?? e.payload ?? "");
			} catch {
				note = String(e.payload ?? "");
			}
			(out[sid] ??= []).push({ id: e.id, tsAgo: ago(e.ts), source: e.source, note });
		}
	}
	return out;
}

function payload(): unknown {
	const ss = sessions();
	const labels: Record<string, string> = {};
	for (const s of ss as any[]) labels[s.sid] = s.label;
	for (const c of db.query("SELECT DISTINCT sid FROM claims").all() as { sid: string }[]) {
		if (!labels[c.sid]) labels[c.sid] = label(c.sid, "worker");
	}
	return {
		ts: Date.now(),
		sessions: ss,
		labels,
		projects: board(),
		claims: claims(),
		events: events(),
		needs: needsMap(),
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
* { box-sizing: border-box; }
body { background:#141413; color:#e8e6e1; font:13px/1.4 ui-monospace,Menlo,monospace; margin:0; padding:16px 20px 20px; }
header { display:flex; align-items:baseline; gap:16px; margin-bottom:20px; }
header .mark { font-size:13px; font-weight:600; letter-spacing:.08em; }
header .right { margin-left:auto; display:flex; align-items:center; gap:12px; }
#stamp { font-size:11px; color:#8a8781; font-variant-numeric:tabular-nums; }
#blockedn { color:#af2f12; font-size:11px; font-variant-numeric:tabular-nums; }
#needsn { color:#af2f12; font-size:11px; font-weight:600; cursor:pointer; text-decoration:underline; text-underline-offset:2px; }
.card.need { border-color:#af2f12; box-shadow:0 0 0 1px #af2f12; cursor:pointer; }
.card.need .m { color:#c96a4f; }
#needsPanel { display:none; position:fixed; top:64px; right:20px; width:min(520px,90vw); background:#1c1b19; border:1px solid #af2f12; border-radius:2px; padding:14px 16px; z-index:10; max-height:70vh; overflow:auto; }
#needsPanel h2 { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:#af2f12; margin:0 0 10px; display:flex; justify-content:space-between; }
#needsPanel h2 span { cursor:pointer; color:#8a8781; }
#needsPanel .q { margin-bottom:12px; }
#needsPanel .q .who { font-size:11px; color:#8a8781; margin-bottom:2px; }
#needsPanel .q .txt { font-size:12px; margin-bottom:4px; word-break:break-word; }
#needsPanel .q .ans { display:flex; gap:6px; }
#needsPanel .q .ans input { flex:1; background:#141413; color:#e8e6e1; border:1px solid rgba(255,255,255,.12); border-radius:2px; padding:4px 8px; font:11px ui-monospace,Menlo,monospace; }
#needsPanel .q .ans button { background:#141413; color:#d8900f; border:1px solid #d8900f; border-radius:2px; padding:4px 10px; font:10px ui-monospace,Menlo,monospace; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; }
#needsPanel .q .ans button:disabled { opacity:.5; cursor:default; }
#needsPanel .dismiss { color:#8a8781; cursor:pointer; text-decoration:underline; text-underline-offset:2px; }
.rq { color:#c96a4f; }
select { background:#1c1b19; color:#e8e6e1; border:1px solid rgba(255,255,255,.12); border-radius:2px; padding:3px 8px; font:11px ui-monospace,Menlo,monospace; max-width:380px; }
#wrap { display:flex; gap:24px; align-items:flex-start; }
#board { flex:1; display:grid; grid-template-columns:repeat(3,minmax(240px,1fr)); gap:12px; align-content:start; overflow-x:auto; }
.col { min-width:0; }
.col h2 { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:#8a8781; margin:0 0 8px; }
.card { background:#1c1b19; border:1px solid rgba(255,255,255,.12); border-radius:2px; padding:10px 12px; margin-bottom:8px; }
.card:hover { border-color:rgba(255,255,255,.24); background:#25231f; }
.card.mine { border-left:2px solid #d8900f; }
.card.gated { opacity:.6; }
.card .id { font-weight:600; font-size:13px; }
.card .t { font-weight:500; word-break:break-word; }
.card .m { color:#8a8781; font-size:10px; font-variant-numeric:tabular-nums; margin-top:4px; }
.pill { display:inline-block; font-size:10px; text-transform:uppercase; letter-spacing:.06em; background:transparent; border:1px solid; border-radius:2px; padding:1px 6px; margin-left:6px; vertical-align:1px; }
.pill.run { color:#d8900f; border-color:#d8900f; }
.pill.done { color:#5c7a35; border-color:#5c7a35; }
.pill.block { color:#af2f12; border-color:#af2f12; }
.card.flash { animation: tint .3s; }
@keyframes tint { from { background:#2a2822; } to { background:#1c1b19; } }
#rail { width:28%; min-width:260px; display:flex; flex-direction:column; gap:24px; }
.feed { border:1px solid rgba(255,255,255,.12); border-radius:2px; padding:10px 12px; font-size:11px; }
.feed h2 { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:#8a8781; margin:0 0 8px; }
.feed .r { display:flex; gap:8px; padding:2px 0; }
.feed .r .ts { width:44px; flex:none; text-align:right; color:#8a8781; font-variant-numeric:tabular-nums; }
.feed .r.hot { border-left:2px solid #af2f12; background:#221f1c; padding-left:8px; }
.feed b { font-weight:500; }
</style></head><body>
<header>
  <span class="mark">FLEET BOARD</span>
  <div class="right">
    <span id="stamp"></span>
    <span id="blockedn"></span>
    <span id="needsn"></span>
    <select id="sess"><option value="">— all —</option></select>
  </div>
</header>
<div id="wrap">
  <div id="board"></div>
  <div id="rail">
    <div class="feed"><h2>Claims</h2><div id="claims"></div></div>
    <div class="feed"><h2>Event tail</h2><div id="events"></div></div>
  </div>
</div>
<div id="needsPanel"><h2>NEEDS YOUR ANSWER <span id="nClose">&times; close</span></h2><div id="nList"></div></div>
<script>
var sel = document.getElementById('sess');
var sessLoaded = false;
var prev = {};
var lastData = null;
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function pill(state){
  if (state==='CLAIMED'||state==='RUNNING') return '<span class="pill run">' + state.toLowerCase() + '</span>';
  if (state==='DONE') return '<span class="pill done">done</span>';
  if (state==='BLOCKED'||state==='PAUSED'||state==='FAILED') return '<span class="pill block">' + state.toLowerCase() + '</span>';
  return '';
}
function card(w, focus, L, N){
  var key = w.id+'|'+w.state+'|'+(w.owner||'')+'|'+(w.sha||'');
  var changed = prev[w.id] !== undefined && prev[w.id] !== key;
  prev[w.id] = key;
  var mine = focus && w.owner === focus;
  var gated = (w.blocked && w.state==='READY') || w.state==='BLOCKED' || w.state==='PAUSED';
  var needsIt = w.owner && N[w.owner] && N[w.owner].length;
  var cls = 'card' + (mine?' mine':'') + (changed?' flash':'') + (gated?' gated':'') + (needsIt?' need':'');
  var m = esc(w.owner ? (L[w.owner] || w.owner.slice(0,10)) : 'unclaimed') + ' · ' + (w.updatedAgo>=0 ? w.updatedAgo+'s' : '');
  if (w.sha) m += ' · @' + esc(String(w.sha).slice(0,7));
  if (w.requires) m += ' · <span class="rq">needs ' + esc(String(w.requires)) + '</span>';
  return '<div class="' + cls + '"' + (needsIt ? ' onclick="openNeeds(\'' + w.owner + '\')"' : '') + '><span class="id">' + esc(w.id) + '</span>' + pill(w.state) + '<div class="t">' + esc(w.title).slice(0,90) + '</div><div class="m">' + m + '</div></div>';
}
function render(d) {
  lastData = d;
  if (!sessLoaded) {
    for (var i = 0; i < d.sessions.length; i++) {
      var s = d.sessions[i];
      var o = document.createElement('option');
      var flagged = d.needs && d.needs[s.sid] && d.needs[s.sid].length;
      o.value = s.sid; o.textContent = s.label + ' · ' + s.role + ' · ' + s.state + (flagged ? '  ⚑ NEEDS ANSWER' : '');
      sel.appendChild(o);
    }
    sessLoaded = true;
  }
  var focus = sel.value;
  var focusProj = focus ? (d.sessions.find(function(s){return s.sid === focus;}) || {}).project : null;
  var proj = d.projects;
  if (focusProj) proj = d.projects.filter(function(p){return p.project === focusProj;});
  var cols = [['01 / TODO','todo'],['02 / IN-FLIGHT','inflight'],['03 / DONE','done']];
  var html = '';
  var blocked = 0;
  for (var c = 0; c < cols.length; c++) {
    html += '<div class="col"><h2>' + cols[c][0] + '</h2>';
    for (var p = 0; p < proj.length; p++) {
      var list = proj[p][cols[c][1]].concat(cols[c][1] === 'todo' ? proj[p].gated : []);
      blocked += proj[p].gated.length;
      if (proj.length > 1) html += '<div class="m">' + esc(proj[p].name) + '</div>';
      for (var k = 0; k < list.length; k++) html += card(list[k], focus, d.labels, d.needs || {});
    }
    html += '</div>';
  }
  document.getElementById('board').innerHTML = html;
  document.getElementById('stamp').textContent = 'updated ' + Math.max(0, Math.round((Date.now() - d.ts)/1000)) + 's ago';
  document.getElementById('blockedn').textContent = blocked ? blocked + ' blocked' : '';
  var nN = 0; for (var s2 in (d.needs||{})) nN += d.needs[s2].length;
  var nn = document.getElementById('needsn');
  nn.textContent = nN ? nN + ' need your answer' : '';
  nn.onclick = function(){ openNeeds(null); };
  var cl = '';
  for (var i = 0; i < d.claims.length; i++) {
    var x = d.claims[i];
    cl += '<div class="r' + (x.hot ? ' hot' : '') + '"><span class="ts">' + x.tsAgo + 's</span><span><b>' + esc(d.labels[x.sid] || x.sid.slice(0,10)) + '</b> ' + esc(x.scope) + (x.intent ? ' — ' + esc(x.intent).slice(0,44) : '') + '</span></div>';
  }
  document.getElementById('claims').innerHTML = cl;
  var ev = '';
  for (var j = d.events.length - 1; j >= 0; j--) {
    var e = d.events[j];
    ev += '<div class="r"><span class="ts">' + e.tsAgo + 's</span><span>#' + e.id + ' <b>' + esc(e.kind) + '</b> ' + esc(e.source).slice(0,12) + (e.target ? ' → ' + esc(e.target).slice(0,10) : '') + (e.note ? ' — ' + esc(e.note).slice(0,56) : '') + '</span></div>';
  }
  document.getElementById('events').innerHTML = ev;
}
function openNeeds(sid) {
  var d = lastData; if (!d) return;
  var needs = d.needs || {};
  var rows = '';
  for (var s in needs) {
    if (sid && s !== sid) continue;
    for (var i = 0; i < needs[s].length; i++) {
      var n = needs[s][i];
      rows += '<div class="q"><div class="who">' + esc(d.labels[s] || s.slice(0,10)) + ' · asked · ' + n.tsAgo + 's ago · event #' + n.id + ' · <span class="dismiss" onclick="ackEv(' + n.id + ', this)">dismiss</span></div><div class="txt">' + esc(n.note || '(no note)') + '</div><div class="ans"><input placeholder="type your answer…" data-to="' + esc(n.source) + '"><button onclick="sendAns(this, \'' + n.source + '\', ' + n.id + ')">send</button></div></div>';
    }
  }
  document.getElementById('nList').innerHTML = rows || '<div class="q"><div class="txt">nothing waiting</div></div>';
  document.getElementById('needsPanel').style.display = 'block';
}
function sendAns(btn, to, forEvent) {
  var inp = btn.parentNode.querySelector('input');
  var note = inp.value.trim();
  if (!note) { inp.placeholder = 'type an answer first'; return; }
  btn.disabled = true; btn.textContent = '…';
  fetch('/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: to, note: note, forEvent: forEvent }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      btn.textContent = d.ok ? '✓ sent' : '✗ failed';
      if (d.ok) { inp.value = ''; inp.disabled = true; inp.placeholder = 'sent → ' + (d.to || to); }
      else { btn.disabled = false; btn.title = d.output || d.error || ''; inp.placeholder = (d.output || d.error || 'failed').slice(0, 60); }
      setTimeout(tick, 300);
    })
    .catch(function(){ btn.textContent = '✗ failed'; btn.disabled = false; });
}
function ackEv(id, el) {
  fetch('/api/ack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id }) })
    .then(function(){ if (el) { var q = el.closest('.q'); if (q) q.style.opacity = '.35'; } setTimeout(tick, 300); });
}
document.getElementById('nClose').onclick = function(){ document.getElementById('needsPanel').style.display = 'none'; };
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') document.getElementById('needsPanel').style.display = 'none'; });
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
	async fetch(req) {
		const url = new URL(req.url);
		if (url.pathname === "/api/data") {
			const sid = url.searchParams.get("session") ?? "";
			return json(sid ? payloadFor(sid) : payload());
		}
		if (req.method === "POST" && url.pathname === "/api/answer") {
			// the board's single write: relay a human answer into the event bus
			const body = (await req.json().catch(() => null)) as { to?: string; note?: string; forEvent?: number } | null;
			let to = String(body?.to ?? "");
			const note = String(body?.note ?? "").trim().slice(0, 2000);
			const forEvent = Number(body?.forEvent ?? 0);
			if (!to || !note) return json({ ok: false, error: "missing target or note" }, 400);
			// accept full sids, unique prefixes, or live bus aliases (an identity
			// that has emitted before — e.g. a coordinator's chosen --as name)
			const exact = db.query("SELECT sid FROM sessions WHERE sid = ?").get(to) as { sid: string } | null;
			if (exact) to = exact.sid;
			else {
				const cands = db.query("SELECT sid FROM sessions WHERE sid LIKE ? || '%'").all(to) as { sid: string }[];
				if (cands.length === 1) to = cands[0]!.sid;
				else {
					const alias = !!db.query("SELECT 1 AS x FROM events WHERE source = ? LIMIT 1").get(to);
					if (!alias) return json({ ok: false, error: cands.length > 1 ? "ambiguous sid: " + to : "unknown target session: " + to }, 400);
				}
			}
			const p = Bun.spawnSync(
				["bun", process.env.HOME + "/.claude/bin/coord.ts", "emit", "ANSWER", "--to", to, "--note", note, "--as", "fleet-board"],
				{ stdout: "pipe", stderr: "pipe" },
			);
			const out = (p.stdout.toString() + " " + p.stderr.toString()).trim();
			if (p.exitCode === 0 && forEvent)
				db.query("INSERT OR REPLACE INTO facts (key, value, source, version, ts) VALUES (?, '1', 'fleet-board', 1, ?)").run(
					"board.ack." + forEvent,
					Date.now(),
				);
			return json({ ok: p.exitCode === 0, output: out.slice(0, 400), to }, p.exitCode === 0 ? 200 : 500);
		}
		if (req.method === "POST" && url.pathname === "/api/ack") {
			// dismiss a question answered out-of-band
			const body = (await req.json().catch(() => null)) as { id?: number } | null;
			const id = Number(body?.id ?? 0);
			if (!id) return json({ ok: false, error: "missing event id" }, 400);
			db.query("INSERT OR REPLACE INTO facts (key, value, source, version, ts) VALUES (?, '1', 'fleet-board', 1, ?)").run(
				"board.ack." + id,
				Date.now(),
			);
			return json({ ok: true });
		}
		if (url.pathname === "/")
			return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
		return new Response("not found", { status: 404 });
	},
});
console.log(`fleet board → http://127.0.0.1:${PORT}  (governor.db, 1s poll; write endpoint: POST /api/answer)`);
