#!/usr/bin/env bun
// claude-fast — menial LLM inference, local-first with remote fallback.
// Bun/TS only (replaces bash version). ~5ms overhead.
// Usage: bun claude-fast.ts <prompt> [--model local|remote]
import { spawnSync } from "node:child_process";

const SWARM_ALIVE = await (async () => {
  try {
    const r = await fetch("http://localhost:4000/health/liveliness", {
      signal: AbortSignal.timeout(1000),
    });
    return r.ok;
  } catch { return false; }
})();

const prompt = process.argv.slice(2).filter(a => !a.startsWith("--")).join(" ");
if (!prompt) {
  console.error("Usage: bun claude-fast.ts <prompt>");
  process.exit(1);
}

if (SWARM_ALIVE) {
  const r = spawnSync("claude", ["-p", prompt], {
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: "http://localhost:4000",
      ANTHROPIC_AUTH_TOKEN: "local-swarm",
    },
    encoding: "utf8",
  });
  process.stdout.write(r.stdout);
} else {
  process.stderr.write("claude-fast: local swarm down — falling back to REMOTE\n");
  const r = spawnSync("claude", ["-p", prompt], { encoding: "utf8" });
  process.stdout.write(r.stdout);
}
