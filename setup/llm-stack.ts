#!/usr/bin/env bun
// llm-stack.ts — from-scratch local LLM fleet setup for a new Apple Silicon Mac.
//
// Idempotent: safe to re-run; every step checks before it acts.
// All external processes are spawned with argument arrays (no shell strings).
//
//   bun setup/llm-stack.ts                  # deps + models + metal smoke check
//   bun setup/llm-stack.ts --with-launchd   # + fleet plists + coordination plane
//   bun setup/llm-stack.ts --dry-run        # print commands, run nothing
//   bun setup/llm-stack.ts --skip-download  # deps only (models already present)

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DRY = process.argv.includes("--dry-run");
const SKIP_DL = process.argv.includes("--skip-download");
const WITH_LAUNCHD = process.argv.includes("--with-launchd");

const HOME = homedir();
const UV = "/opt/homebrew/bin/uv";
const BREW = "/opt/homebrew/bin/brew";
const MLX_PY = `${HOME}/.local/share/uv/tools/mlx-lm/bin/python`;
const HF_PY = "3.13"; // pin: brew python moves break uv tool symlinks otherwise

interface FleetMember {
  label: string;
  port: number;
  model: string;
  engine: "mlx_lm" | "rapid";
  flags?: string[];
}

// Mirror of the fleet table in docs/local-llm-fleet.md. Edit here to taste.
const FLEET: FleetMember[] = [
  {
    label: "code",
    port: 8901,
    model: "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit",
    engine: "rapid",
    flags: ["--enable-prefix-cache"],
  },
  {
    label: "extract",
    port: 8902,
    model: "mlx-community/Qwen3-4B-Instruct-2507-4bit",
    engine: "rapid",
    flags: ["--enable-prefix-cache"],
  },
  {
    label: "reason",
    port: 8903,
    model: "mlx-community/Qwen3.5-35B-A3B-4bit",
    engine: "rapid",
    flags: ["--reasoning", "--enable-prefix-cache"],
  },
  {
    label: "embed",
    port: 8904,
    model: "mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ",
    engine: "mlx_lm",
  },
  {
    label: "rerank",
    port: 8905,
    model: "mlx-community/Qwen3-Reranker-0.6B-4bit",
    engine: "mlx_lm",
  },
  {
    label: "general",
    port: 8906,
    model: "mlx-community/Qwen3.5-9B-MLX-4bit",
    engine: "rapid",
    flags: ["--reasoning", "--enable-prefix-cache"],
  },
];

function sh(cmd: string[]): Promise<number> {
  const printable = cmd.join(" ");
  if (DRY) {
    console.log(`  [dry] ${printable}`);
    return Promise.resolve(0);
  }
  const p = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" });
  return p.exited;
}

async function which(name: string): Promise<string | null> {
  const p = Bun.spawn(["which", name], { stdout: "pipe", stderr: "ignore" });
  const [out, code] = await Promise.all([
    new Response(p.stdout).text(),
    p.exited,
  ]);
  return code === 0 ? out.trim() : null;
}

// ─── steps ───

async function stepDeps(): Promise<void> {
  console.log("\n1) Homebrew deps (bun, uv)");
  if (!existsSync(BREW)) {
    console.error(
      "  Homebrew not found at /opt/homebrew. Install it first: https://brew.sh",
    );
    process.exit(1);
  }
  for (const [name, path] of [
    ["bun", "/opt/homebrew/bin/bun"],
    ["uv", UV],
  ] as const) {
    if (existsSync(path)) {
      console.log(`  ✓ ${name}`);
      continue;
    }
    console.log(`  → installing ${name}`);
    if ((await sh([BREW, "install", name])) !== 0) process.exit(1);
  }
}

async function stepTools(): Promise<void> {
  console.log(
    "\n2) Python tooling via uv (python pinned — see uv symlink gotcha)",
  );
  const mlxInstalled = existsSync(MLX_PY);
  if (mlxInstalled) console.log("  ✓ mlx-lm");
  else if (
    (await sh([
      UV,
      "tool",
      "install",
      "--force",
      "--python",
      HF_PY,
      "mlx-lm",
    ])) !== 0
  )
    process.exit(1);
  if (await which("rapid-mlx")) console.log("  ✓ rapid-mlx");
  else if (
    (await sh([
      UV,
      "tool",
      "install",
      "--force",
      "--python",
      HF_PY,
      "rapid-mlx",
    ])) !== 0
  )
    process.exit(1);
}

async function stepModels(): Promise<void> {
  if (SKIP_DL) {
    console.log("\n3) Models — skipped (--skip-download)");
    return;
  }
  console.log("\n3) Model downloads (parallel, ~40-60GB total)");
  const models = [...new Set(FLEET.map((f) => f.model))];
  const procs = models.map((m) => {
    console.log(`  → ${m.replace("mlx-community/", "")}`);
    return Bun.spawn(
      [
        MLX_PY,
        "-c",
        `from huggingface_hub import snapshot_download; snapshot_download("${m}")`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    ).exited;
  });
  const codes = DRY ? [] : await Promise.all(procs);
  if (codes.some((c) => c !== 0)) {
    console.error("  one or more downloads failed");
    process.exit(1);
  }
}

async function stepMetalCheck(): Promise<void> {
  if (DRY || !existsSync(MLX_PY)) return;
  console.log("\n4) Metal smoke check");
  const p = Bun.spawn(
    [MLX_PY, "-c", "import mlx.core as mx; print(mx.default_device())"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(p.stdout).text();
  await p.exited;
  console.log(`  default device: ${out.trim() || "(mlx import failed)"}`);
  console.log("  tip: raise the wired limit before long-context serving —");
  console.log(
    "  mx.metal.set_wired_limit(...) prevents paging stalls on big batches.",
  );
}

async function stepLaunchd(): Promise<void> {
  if (!WITH_LAUNCHD) return;
  console.log("\n5) launchd plists (KeepAlive) → ~/Library/LaunchAgents");
  const logDir = `${HOME}/.claude-insights`;
  if (!DRY) await Bun.$`mkdir -p ${logDir}`.quiet().catch(() => {});
  for (const f of FLEET.filter((x) => x.engine === "rapid")) {
    const label = `com.speedy-claude.llm-${f.port}`;
    const plistPath = join(HOME, "Library", "LaunchAgents", `${label}.plist`);
    const args = [
      "rapid-mlx",
      "serve",
      f.model,
      "--host",
      "127.0.0.1",
      "--port",
      String(f.port),
      ...(f.flags ?? []),
    ];
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>${args.map((a) => `<string>${a}</string>`).join("")}</array>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${logDir}/mlx-${f.port}.log</string>
  <key>StandardErrorPath</key><string>${logDir}/mlx-${f.port}.log</string>
</dict></plist>`;
    console.log(`  → ${plistPath}`);
    if (!DRY) {
      await Bun.write(plistPath, plist);
      await sh(["/bin/launchctl", "load", plistPath]);
    }
  }
  console.log(
    "  note: keep ProgramArguments absolute — launchd does not inherit your PATH.",
  );
}

// ─── coordination plane: governor.db + claim/coord CLIs + keepwarm ───
async function stepCoordination(): Promise<void> {
  console.log(
    "\n6) coordination plane (governor.db, claim/coord CLIs, keepwarm)",
  );
  const bun = "/opt/homebrew/bin/bun";
  const govdb = join(HOME, ".claude", "hooks", "lib", "govdb.ts");
  const coord = join(HOME, ".claude", "hooks", "bin", "coord.ts");
  const tplSrc = join(
    import.meta.dir,
    "..",
    "hooks",
    "launchd",
    "com.klh.llm-keepwarm.plist",
  );
  const plistPath = join(
    HOME,
    "Library",
    "LaunchAgents",
    "com.klh.llm-keepwarm.plist",
  );
  if (DRY) {
    console.log(
      "  → would bootstrap governor.db (claims/locks/events/cursors/facts)",
    );
    console.log(`  → would install + bootstrap ${plistPath}`);
    return;
  }
  // 1) control-plane DB: creates schema, runs any JSON→SQL migrations
  await sh([
    bun,
    "-e",
    `import { openGovernorDb } from "${govdb}"; openGovernorDb(); console.log("  ✓ governor.db ready");`,
  ]);
  // 2) keepwarm agent: nonce pings keep MLX weights paged in (kills the
  //    27-50s idle-page first-touch stall). Re-bootstrap of a loaded job is
  //    expected to fail with exit 5 — tolerated.
  const tpl = await Bun.file(tplSrc).text();
  await Bun.write(plistPath, tpl.replaceAll("__HOME__", HOME));
  const uid = process.getuid();
  await sh(["/bin/launchctl", "bootstrap", `gui/${uid}`, plistPath]).catch(
    () => {},
  );
  await sh([
    "/bin/launchctl",
    "kickstart",
    `gui/${uid}/com.klh.llm-keepwarm`,
  ]).catch(() => {});
  // 3) smoke: one fact write through the real path
  await sh([
    bun,
    coord,
    "fact",
    "set",
    "setup.done",
    new Date().toISOString(),
    "--source",
    "llm-stack",
  ]).catch(() => {});
  console.log(
    `  ✓ coordination plane ready — claims: hooks/bin/claim.ts, bus: hooks/bin/coord.ts`,
  );
}

// ─── run ───
console.log("Local LLM fleet setup (docs/local-llm-fleet.md)");
await stepDeps();
await stepTools();
await stepModels();
await stepMetalCheck();
await stepLaunchd();
await stepCoordination();
console.log(
  "\n✓ done. Next: start the fleet (`rapid-mlx serve …` per model or via your",
);
console.log(
  "  registry-driven swarm script) and run the 4-prompt bench to log a baseline.",
);
