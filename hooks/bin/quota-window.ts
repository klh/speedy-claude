#!/usr/bin/env bun
// quota-window.ts — track z.ai/GLM 5-hour quota windows from observed 429
// resets, so long lane batches get deferred away from the cliff.
// Reset timestamps are parsed out of the auto-mode classifier's 429 log and
// remembered in a state file (windows chain from each observed reset).
//
//   bun ~/.claude/bin/quota-window.ts            # status; exit 0 safe / 1 near cliff / 2 unknown
//   bun ~/.claude/bin/quota-window.ts --margin 45

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";

const STATE = `${process.env.HOME}/.cache/claude-governor/quota-window.json`;
const PROJECTS = `${process.env.HOME}/.claude/projects`;
const WINDOW_MS = 5 * 3600_000;
const MARGIN = Number(process.argv.includes("--margin") ? process.argv[process.argv.indexOf("--margin") + 1] : 45) * 60_000;

// harvest "reset at 2026-09-24 17:43:32" lines from every session's
// classifier-error log (the harness rotates them, so scan them all)
const resets: number[] = [];
try {
  for (const proj of readdirSync(PROJECTS)) {
    for (const e of readdirSync(`${PROJECTS}/${proj}`).filter(f => f.endsWith("classifier-error.txt"))) {
      const txt = readFileSync(`${PROJECTS}/${proj}/${e}`, "utf8").slice(-200_000); // tail only
      for (const m of txt.matchAll(/reset at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g)) {
        resets.push(new Date(m[1].replace(" ", "T") + "+00:00").getTime());
      }
    }
  }
} catch {}

const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) as { resets?: number[] } : {};
// manual observations survive log rotation: quota-window.ts note "reset at <time>"
const noteArg = process.argv[2] === "note" ? process.argv.slice(3).join(" ") : "";
if (noteArg) {
  const m = noteArg.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  if (m) resets.push(new Date(m[1].replace(" ", "T") + "+00:00").getTime());
}
const all = [...new Set([...(prev.resets ?? []), ...resets])].sort((a, b) => a - b);
mkdirSync(`${process.env.HOME}/.cache/claude-governor`, { recursive: true });
writeFileSync(STATE, JSON.stringify({ resets: all.slice(-20) }));

const now = Date.now();
// each observation is an EXPIRY (the 429 names when quota returns), not a start
const expiry = all.find(r => r > now);
if (!expiry) {
  console.log("quota window: UNKNOWN — no future expiry observed; a new 5-h window starts on first use and any 429 will name its end");
  process.exit(2);
}
const leftMin = Math.round((expiry - now) / 60000);
const startedMin = Math.round(WINDOW_MS / 60000) - leftMin;
console.log(`quota window: ~${leftMin} min left (expires ${new Date(expiry).toISOString()}, ~${startedMin} min into the window)`);
if (leftMin * 60_000 <= MARGIN) {
  console.log(`within ${Math.round(MARGIN / 60000)}-min margin — DEFER long batch jobs / lane restarts until after the reset`);
  process.exit(1);
}
console.log("safe to run long batches");
