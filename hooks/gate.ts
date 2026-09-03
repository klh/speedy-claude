#!/usr/bin/env bun
// ~/.claude/hooks/gate.ts — THE single hook entrypoint.
// Every hook registration is `bun gate.ts <event>`; this file owns stdin,
// dispatch, and nothing else. Gate logic lives in gates/*.ts, contracts in
// lib/hookio.ts, execution in lib/run.ts. One pattern everywhere.
//
//   bun gate.ts pre-bash    PreToolUse  (Bash: secrets/edit/skill/tool gates)
//   bun gate.ts pre-files   PreToolUse  (Edit|Write: config-guard)
//   bun gate.ts post-files  PostToolUse (Edit|Write: syntax gate + md-format)
//   bun gate.ts stop        Stop        (claim-done gate)
//   bun gate.ts session     SessionStart (pointer + insights surfacing)
import { readHook } from "./lib/hookio.ts";
import { bashGate } from "./gates/bash.ts";
import { configGate } from "./gates/config.ts";
import { filesGate } from "./gates/files.ts";
import { stopGate } from "./gates/stop.ts";

const hook = await readHook();
const event = process.argv[2] ?? "";

switch (event) {
  case "pre-bash": bashGate(hook);
  case "pre-files": configGate(hook);
  case "post-files": filesGate(hook);
  case "stop": stopGate(hook);
  case "session": {
    const { existsSync, statSync } = await import("node:fs");
    const home = process.env.HOME ?? "";
    let msg =
      "Skills: use klh-dispatch to route, klh-cli-speed-tools for shell work, klh-systematic-debugging before any fix. Parked skills live in ~/.claude/skills-available/ (see its README).";
    const pending = `${home}/.claude-insights/PENDING.md`;
    if (existsSync(pending) && statSync(pending).size > 0)
      msg += "\nNEW INSIGHTS PENDING: ~/.claude-insights/PENDING.md is non-empty — read it, apply or decline its prescriptions, then clear the file.";
    const { context } = await import("./lib/hookio.ts");
    context(msg, "SessionStart");
  }
  default:
    process.stdout.write("{}");
    process.exit(0);
}
