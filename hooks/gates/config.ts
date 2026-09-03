// hooks/gates/config.ts — PreToolUse(Edit|Write): the control-plane guard.
// ASK on writes into the agent's own config (hooks/settings/skills/agents/
// launchd/shell-rc): interactive work proceeds via visible approvals;
// headless runs cannot answer prompts, so unattended persistence is dead.
import { ask, allow, type HookInput } from "../lib/hookio.ts";

const HOME = process.env.HOME ?? "";

export function configGate(hook: HookInput): never {
  if (!["Edit", "Write", "NotebookEdit"].includes(hook.tool_name ?? "")) allow();
  let F = hook.tool_input?.file_path ?? hook.tool_input?.notebook_path ?? "";
  if (!F) allow();

  if (F.startsWith("~")) F = HOME + F.slice(1);
  F = F.replace(/["']/g, "");
  const P = F.startsWith(HOME) ? "$HOME" + F.slice(HOME.length) : F;

  const PROTECTED = [
    /^\$HOME\/\.claude\/(hooks|skills|skills-available|agents|commands|mcp-servers|plugins)(\/|$)/,
    /^\$HOME\/\.claude\/settings(\.local)?\.json$/,
    /^\$HOME\/\.claude\/(CLAUDE|AGENTS)\.md$/,
    /^\$HOME\/\.agents\//,
    /^\$HOME\/\.z(shrc|profile|env)$/,
    /^\$HOME\/Library\/LaunchAgents\//,
  ];

  if (PROTECTED.some((re) => re.test(P)))
    ask(`config-guard: ${P} is agent control-plane (hooks/settings/skills/agents/launchd/shell-rc). Approve only if you requested this exact change.`);

  allow();
}
