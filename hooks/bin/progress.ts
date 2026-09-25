#!/usr/bin/env bun
// ~/.claude/bin/progress.ts — agent progress-bar protocol (2026-09-18).
//
// Any agent or chat interface reports long-task progress to
// /tmp/agent-progress/<id>.json; the statusline (and any UI) aggregates
// every entry written within TTL_MS. Entries are per-TASK (not per-session)
// so parallel lanes don't collide; a reboot clears /tmp, so cleanup is
// automatic — stale entries die via TTL regardless.
//
//   bun ~/.claude/bin/progress.ts set <id> <done> <total> [label] [etaSeconds]
//   bun ~/.claude/bin/progress.ts clear <id>
//   bun ~/.claude/bin/progress.ts list
//
// <id>: [a-z0-9-]{1,40} (unsanitized ids are rejected). Label is capped at
// 60 chars — it renders verbatim in the statusline.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "/tmp/agent-progress";
const TTL_MS = 15 * 60_000;

interface Entry {
  at: number;
  done: number;
  total: number;
  label?: string;
  etaSeconds?: number;
}

const idOf = (raw: string): string => {
  if (!/^[a-z0-9-]{1,40}$/.test(raw)) {
    throw new Error(`id must match [a-z0-9-]{1,40}, got '${raw}'`);
  }
  return raw;
};

const num = (raw: string, flag: string): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${flag} must be a number, got '${raw}'`);
  return n;
};

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  mkdirSync(DIR, { recursive: true });

  if (cmd === "set") {
    const [rawId, rawDone, rawTotal, label, eta] = rest;
    if (!rawId || rawDone === undefined || rawTotal === undefined) {
      throw new Error("usage: progress.ts set <id> <done> <total> [label] [etaSeconds]");
    }
    const entry: Entry = {
      at: Date.now(),
      done: Math.max(0, num(rawDone, "done")),
      total: Math.max(0, num(rawTotal, "total")),
    };
    if (label) entry.label = label.slice(0, 60);
    if (eta !== undefined && eta !== "") entry.etaSeconds = Math.max(0, num(eta, "eta"));
    writeFileSync(join(DIR, idOf(rawId) + ".json"), `${JSON.stringify(entry)}\n`);
    return;
  }

  if (cmd === "clear") {
    const [rawId] = rest;
    if (!rawId) throw new Error("usage: progress.ts clear <id>");
    rmSync(join(DIR, idOf(rawId) + ".json"), { force: true });
    return;
  }

  if (cmd === "list" || cmd === undefined) {
    for (const file of readdirSync(DIR).sort()) {
      try {
        const e = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Entry;
        if (Date.now() - e.at > TTL_MS) continue;
        console.log(file.replace(/\.json$/, ""), e.done + "/" + e.total, e.label ?? "", e.etaSeconds ? `~${Math.round(e.etaSeconds / 60)}m` : "");
      } catch {
        // corrupt/foreign entry — skip, never fail the listing
      }
    }
    return;
  }

  throw new Error(`unknown command '${cmd}' (set|clear|list)`);
}

main();
