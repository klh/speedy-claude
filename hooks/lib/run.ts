// hooks/lib/run.ts — the ONE way gates execute things: argument arrays,
// output captured on the FIRST run (never re-run for messages), PATH lookups
// cached. No shell strings anywhere downstream.
import { spawnSync } from "node:child_process";

export type RunResult = { ok: boolean; status: number | null; out: string };

const cache = new Map<string, boolean>();

export function have(bin: string): boolean {
  if (!cache.has(bin)) {
    cache.set(bin, spawnSync("command", ["-v", bin], { shell: true }).status === 0);
  }
  return cache.get(bin)!;
}

export function run(cmd: string, args: string[], opts: { cwd?: string } = {}): RunResult {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { ok: r.status === 0, status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

export const lines = (s: string, n: number) => s.split("\n").slice(0, n).join("\n");
