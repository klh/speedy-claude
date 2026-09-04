#!/usr/bin/env bun
// swarm.ts — unified LLM specialist swarm manager (replaces all bash scripts).
// Bun/TS only. No shell. Types everywhere.
//
// Usage:
//   bun swarm.ts start       — start all specialists + router
//   bun swarm.ts stop        — stop everything
//   bun swarm.ts status      — show running specialists
//   bun swarm.ts download    — download all specialist models
//   bun swarm.ts restart     — stop + start

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";

const HOME = process.env.HOME!;
const MLX_PYTHON = `${HOME}/.local/share/uv/tools/mlx-lm/bin/python`;
const LOG_DIR = `${HOME}/.claude-insights`;
const ROUTER = `${HOME}/.claude/local-llm/router-shim.ts`;

// ─── typed model registry ───
interface Specialist {
  port: number;
  model: string;
  label: string;
  ram_gb: number;
  tier: "resident" | "ondemand";
  flags?: string[];
}

const SPECIALISTS: Specialist[] = [
  { port: 8901, model: "mlx-community/Qwen2.5-Coder-32B-Instruct-4bit", label: "⚡ code", ram_gb: 10, tier: "resident" },
  { port: 8902, model: "mlx-community/Qwen3-4B-Instruct-2507-4bit", label: "🏠 extract", ram_gb: 2, tier: "resident", flags: ["--chat-template-args", '{"enable_thinking":false}'] },
  { port: 8903, model: "mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit", label: "🧠 reason", ram_gb: 14, tier: "resident" },
  { port: 8904, model: "mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ", label: "🔢 embed", ram_gb: 0.3, tier: "resident" },
  { port: 8905, model: "mlx-community/Qwen3-Reranker-0.6B-4bit", label: "🔄 rerank", ram_gb: 0.3, tier: "resident" },
  { port: 8906, model: "mlx-community/Qwen3.5-9B-MLX-4bit", label: "🌐 danish/general", ram_gb: 5.6, tier: "ondemand" },
];

const DOWNLOAD_MODELS = [
  ...SPECIALISTS.map(s => s.model),
  "mlx-community/translategemma-4b-it-4bit",
];

// ─── helpers ───
const isUp = async (port: number): Promise<boolean> => {
  try {
    const r = await fetch(`http://localhost:${port}/v1/models`, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch { return false; }
};

const getModel = async (port: number): Promise<string> => {
  try {
    const r = await fetch(`http://localhost:${port}/v1/models`, { signal: AbortSignal.timeout(1000) });
    const j = await r.json();
    return j.data?.[0]?.id ?? "?";
  } catch { return "down"; }
};

const killPort = (port: number): void => {
  try { execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: "pipe" }); } catch {}
};

const startSpecialist = async (s: Specialist): Promise<boolean> => {
  if (await isUp(s.port)) {
    console.log(`  ✓ :${s.port} ${s.label} (already running)`);
    return true;
  }
  mkdirSync(LOG_DIR, { recursive: true });
  const args = [
    "-m", "mlx_lm.server",
    "--port", String(s.port),
    "--model", s.model,
    "--prompt-cache-size", "10",
    "--prompt-cache-bytes", "4GB",
    ...(s.flags ?? []),
  ];
  const proc = spawn(MLX_PYTHON, args, {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${HOME}/.local/bin:/opt/homebrew/bin:/usr/bin:/bin` },
  });
  const log = `${LOG_DIR}/mlx-${s.port}.log`;
  proc.stdout?.on("data", (d) => appendFileSync(log, d));
  proc.stderr?.on("data", (d) => appendFileSync(log, d));
  proc.unref();

  // wait for ready
  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (await isUp(s.port)) {
      console.log(`  ✓ :${s.port} ${s.label} (${s.ram_gb}GB)`);
      return true;
    }
  }
  console.log(`  ✗ :${s.port} ${s.label} — not ready after 90s`);
  return false;
};

// ─── commands ───
async function cmdStart(): Promise<void> {
  console.log("🚀 Starting specialist swarm…\n");
  const resident = SPECIALISTS.filter(s => s.tier === "resident");
  for (const s of resident) {
    await startSpecialist(s);
  }
  // router
  if (!(await isUp(4000))) {
    console.log("  → :4000 router-shim");
    const proc = spawn("bun", [ROUTER], {
      detached: true, stdio: ["ignore", "pipe", "pipe"],
    });
    const log = `${LOG_DIR}/mlx-router.log`;
    proc.stdout?.on("data", (d) => appendFileSync(log, d));
    proc.stderr?.on("data", (d) => appendFileSync(log, d));
    proc.unref();
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log("\n  Swarm ready. Use: bun ~/.local/bin/claude-fast.ts <prompt>");
}

async function cmdStop(): Promise<void> {
  console.log("🛑 Stopping swarm…");
  killPort(4000);
  for (const s of SPECIALISTS) killPort(s.port);
  console.log("  All stopped.");
}

async function cmdStatus(): Promise<void> {
  console.log("📊 Swarm status:\n");
  let total_ram = 0;
  for (const s of SPECIALISTS) {
    const up = await isUp(s.port);
    const model = up ? await getModel(s.port) : "down";
    const tier = s.tier === "resident" ? "" : " (on demand)";
    if (up) total_ram += s.ram_gb;
    console.log(`  ${up ? "✓" : "✗"} :${s.port}  ${s.label.padEnd(15)} ${model.replace("mlx-community/", "")}${tier}`);
  }
  const routerUp = await isUp(4000);
  console.log(`  ${routerUp ? "✓" : "✗"} :4000  router-ship (Anthropic API)`);
  console.log(`\n  RAM in use: ~${total_ram.toFixed(1)}GB / 128GB`);
}

async function cmdDownload(): Promise<void> {
  console.log(`📥 Downloading ${DOWNLOAD_MODELS.length} models (~61GB total)…\n`);
  const procs = DOWNLOAD_MODELS.map(model => {
    const name = model.split("/")[1];
    console.log(`  → ${name}…`);
    return spawn(MLX_PYTHON, ["-c",
      `from huggingface_hub import snapshot_download; snapshot_download("${model}")`,
    ], { stdio: "pipe" });
  });
  await Promise.all(procs.map(p => new Promise(resolve => p.on("exit", resolve))));
  console.log("\n✓ All downloads complete");
}

// ─── dispatch ───
const cmd = process.argv[2] ?? "status";
switch (cmd) {
  case "start":   await cmdStart(); break;
  case "stop":    await cmdStop(); break;
  case "status":  await cmdStatus(); break;
  case "restart": await cmdStop(); await new Promise(r => setTimeout(r, 2000)); await cmdStart(); break;
  case "download": await cmdDownload(); break;
  default:
    console.log(`Usage: bun swarm.ts {start|stop|status|restart|download}\n`);
    console.log(`Specialists:`);
    for (const s of SPECIALISTS) {
      console.log(`  :${s.port}  ${s.label}  (${s.ram_gb}GB, ${s.tier})`);
    }
    console.log(`  :4000  router (Anthropic API entrypoint)`);
}
