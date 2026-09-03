#!/usr/bin/env bun
// ~/.claude/statusline.ts — TS port of statusLine.sh (2026-09-03).
// JSON.parse replaces the jq/IFS/read pipeline (the empty-field-shift bug
// class is structurally impossible); git runs with argument arrays against
// the payload's own cwd; output is template literals, not printf %b escape
// soup. LC_ALL irrelevant — no shell number formatting.
import { spawnSync } from "node:child_process";

type Payload = {
  model?: { id?: string; display_name?: string };
  workspace?: { current_dir?: string; repo?: { owner?: string; name?: string } };
  cwd?: string;
  cost?: {
    total_lines_added?: number; total_lines_removed?: number;
    total_api_duration_ms?: number; total_duration_ms?: number; total_cost_usd?: number;
  };
  context_window?: { used_percentage?: number; context_window_size?: number };
  effort?: { level?: string };
};

let p: Payload = {};
try { p = JSON.parse(await new Response(Bun.stdin).text()); } catch { /* minimal render below */ }

const R = "\x1b[0m";
const c = (code: string, s: string | number) => `\x1b[${code}m${s}${R}`;
const bw = (s: string | number) => c("1;37", s), by = (s: string | number) => c("1;33", s);
const bb = (s: string | number) => c("1;34", s), bg = (s: string | number) => c("1;32", s);
const br = (s: string | number) => c("1;31", s), bk = (s: string | number) => c("1;30", s);
const gr = (s: string | number) => c("0;32", s), pu = (s: string | number) => c("0;35", s);

const MODEL_ID = p.model?.id ?? "";
const MODEL_NAME = p.model?.display_name ?? "unknown";
const DIR = p.workspace?.current_dir ?? p.cwd ?? "";
const HOME = process.env.HOME ?? "";
const COLS = Number(process.env.COLUMNS ?? 0);
const narrow = COLS > 0 && COLS < 110;
const SEP = "  ";

// ---- location ----
const OWNER = p.workspace?.repo?.owner ?? "", NAME = p.workspace?.repo?.name ?? "";
let LOC: string;
if (OWNER && NAME) {
  const root = git(DIR, "rev-parse", "--show-toplevel");
  let rel = root && DIR.startsWith(root) ? DIR.slice(root.length).replace(/^\//, "") : "";
  if (rel) { if (narrow) rel = `…/${rel.split("/").pop()}`; LOC = `${bk(OWNER + "/")}${by(NAME)}${bk("/" + rel)}`; }
  else LOC = `${bk(OWNER + "/")}${by(NAME)}`;
} else {
  let P = DIR.startsWith(HOME) ? "~" + DIR.slice(HOME.length) : DIR;
  if (narrow) P = `…/${P.split("/").pop()}`;
  LOC = by(P);
}

function git(cwd: string, ...args: string[]): string | null {
  if (!cwd) return null;
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// ---- model + effort ----
const MC = /opus|glm-5\.2/.test(MODEL_ID) ? bg : /haiku/.test(MODEL_ID) ? by : /sonnet|glm-5\.1/.test(MODEL_ID) ? bb : bw;
const ICON = MODEL_ID.startsWith("claude-") ? "🤖" : "⚡";
const EFFORT = p.effort?.level ?? "";
const EC = ["max", "xhigh"].includes(EFFORT) ? "1;31" : EFFORT === "high" ? "1;33" : EFFORT === "medium" ? "0;32" : EFFORT === "low" ? "1;30" : "";
const ETAG = EC ? ` ${bk("·")}${c(EC, EFFORT)}` : "";

// ---- git part ----
let GIT = "";
const st = DIR ? git(DIR, "status", "-b", "--porcelain") : null;
if (st !== null) {
  const lines = st.split("\n");
  const L1 = lines[0] ?? "";
  let BR = L1.replace(/^## /, "").split("...")[0].split(" ")[0];
  if (!BR || BR === "HEAD") BR = git(DIR, "rev-parse", "--short", "HEAD") ?? "";
  if (narrow && BR.length > 16) BR = `…${BR.slice(-15)}`;
  const ahead = L1.match(/ahead (\d+)/)?.[1], behind = L1.match(/behind (\d+)/)?.[1];
  const dirty = lines.length > 1 ? br("✱") : "";
  const ab = `${ahead ? ` ${bg("↑" + ahead)}` : ""}${behind ? ` ${br("↓" + behind)}` : ""}`;
  if (BR) GIT = `${SEP} ${bb(BR)}${dirty}${ab}`;
}

// ---- changes (each side gated — no "+120 -0") ----
const A = p.cost?.total_lines_added ?? 0, RM = p.cost?.total_lines_removed ?? 0;
const CHG = A > 0 || RM > 0 ? `${SEP}${A > 0 ? bg("+" + A) + " " : ""}${RM > 0 ? br("-" + RM) : ""}` : "";

// ---- context bar ----
const PCT = Math.round(p.context_window?.used_percentage ?? 0);
const CTX_SIZE = p.context_window?.context_window_size ?? 0;
const CC = PCT >= 80 ? "\x1b[0;31m" : PCT >= 50 ? "\x1b[0;33m" : "\x1b[0;32m";
const filled = Math.min(5, Math.floor(PCT / 20));
const bar = "█".repeat(filled) + "░".repeat(5 - filled);
const TAG = CTX_SIZE >= 1_000_000 ? `${CC}∞${R}` : "";
const CTX = `${SEP} ${!narrow ? `${CC}${bar}${R} ` : ""}${CC}${PCT}%${R}${TAG}`;

// ---- durations + cost ----
const API_DUR = Math.round((p.cost?.total_api_duration_ms ?? 0) / 1000);
const DUR = Math.round((p.cost?.total_duration_ms ?? 0) / 1000);
const COST = (p.cost?.total_cost_usd ?? 0).toFixed(3);
const tail = narrow ? "" : `${SEP} ${gr(API_DUR)}/${pu(DUR)}s${SEP}${gr(COST)}`;

process.stdout.write(`${R}${ICON} [ ${MC(MODEL_NAME)}${R}${ETAG} ]  ${LOC}${GIT}${CHG}${CTX}${tail} ${ICON}\n`);
