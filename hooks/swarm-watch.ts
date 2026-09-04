#!/usr/bin/env bun
// swarm-watch — LLM routing visibility (Bun/TS, no shell arg soup).
// Usage: bun swarm-watch.ts [--last N] [--summary]
import { readFileSync, existsSync, watchFile } from "node:fs";

const LOG = `${process.env.HOME}/.claude-insights/swarm-routing.log`;
const R = "\x1b[0m", DIM = "\x1b[2m";
const ICONS: Record<string, string> = {
  extract: "🏠", code: "⚡", reason: "🧠", remote: "☁️",
  embed: "🔢", rerank: "🔄", translate: "🌐",
};

interface Route {
  ts: string; category: string; model: string;
  duration_ms: number; prompt: string; port: number;
}

function readEntries(): Route[] {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf8").trim().split("\n")
    .filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as Route[];
}

function fmt(r: Route): string {
  const icon = ICONS[r.category] ?? "❓";
  const dur = r.duration_ms < 500 ? `\x1b[32m${r.duration_ms}ms${R}` : `\x1b[33m${r.duration_ms}ms${R}`;
  const age = Math.round((Date.now() - new Date(r.ts).getTime()) / 1000);
  return `  ${icon} ${r.category.padEnd(9)} ${dur}  ${DIM}${r.prompt.slice(0, 55)}${R}`;
}

// parse args (trivial in TS)
const args = process.argv.slice(2);
if (args.includes("--summary")) {
  const entries = readEntries();
  console.log(`📊 Swarm routing summary:`);
  console.log(`  Total: ${entries.length}`);
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  for (const [cat, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ICONS[cat] ?? "❓"} ${cat}: ${n}`);
  }
  if (entries.length > 0) {
    console.log(`\n  Recent:`);
    entries.slice(-5).forEach(e => console.log(fmt(e)));
  }
} else if (args.includes("--last")) {
  const n = Number(args[args.indexOf("--last") + 1] ?? 10);
  readEntries().slice(-n).forEach(e => console.log(fmt(e)));
} else {
  // live watch
  console.log(`👀 Watching swarm routing (Ctrl+C to stop)…\n`);
  const show = () => {
    const entries = readEntries();
    entries.slice(-3).forEach(e => console.log(fmt(e)));
  };
  show();
  watchFile(LOG, { interval: 1000 }, () => {
    console.clear();
    console.log(`👀 Swarm routing (live)…\n`);
    show();
  });
}
