// hooks/lib/hookio.ts — the ONE definition of hook input/output contracts.
// Every gate imports from here; no gate builds its own JSON or exit codes.
export type HookInput = {
  tool_name?: string;
  tool_input?: { command?: string; file_path?: string; notebook_path?: string; old_string?: string; new_string?: string };
  cwd?: string;
  stop_hook_active?: boolean;
  hook_event_name?: string;
};

export async function readHook(): Promise<HookInput> {
  try {
    return JSON.parse(await new Response(Bun.stdin).text());
  } catch {
    return {};
  }
}

export function allow(): never {
  process.stdout.write("{}");
  process.exit(0);
}
export function deny(reason: string): never {
  out({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
}
export function ask(reason: string): never {
  out({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } });
}
export function nudge(message: string): never {
  out({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: message } });
}
export function context(message: string, event = "SessionStart"): never {
  out({ hookSpecificOutput: { hookEventName: event, additionalContext: message } });
}
export function feedback(message: string): never {
  // PostToolUse / Stop: exit 2 feeds stderr back to the agent (non-blocking,
  // the tool already ran) — the ONE definition of the feedback channel.
  process.stderr.write(message + "\n");
  process.exit(2);
}

function out(obj: unknown): never {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}
