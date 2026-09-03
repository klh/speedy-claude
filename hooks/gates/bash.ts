// hooks/gates/bash.ts — PreToolUse(Bash): secrets + edit-enforce +
// skill-install + tool-enforce, over the shell-quote AST.
// Review pass 2026-09-03: hoisted constants, deferred EVERY computation,
// extracted shared redirect-target logic, single denyInstall helper,
// approvals moved to lib/approvals.ts (fixes the trivial-token bind bug).
import { parse } from "shell-quote";
import { allow, deny, nudge, type HookInput } from "../lib/hookio.ts";
import { have, run } from "../lib/run.ts";
import { verifyAndConsume, extractSourceRef } from "../lib/approvals.ts";
import { resolve } from "node:path";

// ---- module-scope constants (allocated once, not per call) ----
const WRAPPERS = new Set(["sudo", "nice", "env", "command", "nohup", "time"]);
const SKILLS_PATH = /\.claude\/skills|\.agents\/skills/;
const TOOL_MAP: Record<string, string> = {
  ls: "eza -la (or eza --tree)", find: "fd", grep: "rg", cat: "bat",
  sed: "sd", du: "dust", diff: "difft", ps: "procs", curl: "xh",
};

type Op = { op: string };
type Cmd = { cmd: string };
type Tok = string | Op | Cmd;

const isOp = (t: Tok, ...ops: string[]) => typeof t === "object" && "op" in t && ops.includes((t as Op).op);

function segments(toks: Tok[]): Tok[][] {
  const segs: Tok[][] = [[]];
  for (const t of toks) {
    if (isOp(t, ";", "&", "|", "&&", "||", "(", ")")) segs.push([]);
    else segs[segs.length - 1].push(t);
  }
  return segs.filter((s) => s.length > 0);
}
const words = (seg: Tok[]): string[] =>
  seg.map((t) => (typeof t === "string" ? t : "op" in t ? `<op:${t.op}>` : "<sub>"));

function verb(w: string[]): string {
  let i = 0;
  while (i < w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i])) i++;
  while (i < w.length && WRAPPERS.has(w[i])) i++;
  return w[i] ?? "";
}

const throwaway = (p: string) =>
  p.startsWith("/tmp/") || p.startsWith("/private/tmp/") || p.startsWith("/dev/") || p.includes("$TMPDIR");

/** Shared: find the redirect-target word after any '>' op, if the target is
 *  a real path (not throwaway). Returns "" when no actionable redirect. */
function redirectTarget(w: string[]): string {
  const idx = w.findIndex((a) => a.startsWith("<op:>"));
  if (idx === -1 || !w[idx + 1]) return "";
  return throwaway(w[idx + 1]) ? "" : w[idx + 1];
}

/** Shared: single-point deny for the skill-install gate. */
const denyInstall = (how: string): never =>
  deny(`skill-install-gate: ${how} blocked. Run the skill-security-review skill on the exact source; on PASS run: approve-skill <source> — then retry this command.`);

export function bashGate(hook: HookInput): never {
  const CMD = hook.tool_input?.command ?? "";
  const CWD = hook.cwd ?? process.env.HOME ?? "/";
  if (hook.tool_name !== "Bash" || !CMD) allow();

  const toks = parse(CMD) as Tok[];
  const SEGS = segments(toks).map((s) => words(s));

  // ---- secrets (git commit / push) ----
  if (have("gitleaks")) {
    let isCommit = false, isPush = false, repoDir = CWD;
    for (const w of SEGS) {
      if (verb(w) !== "git") continue;
      if (w.includes("--no-verify"))
        deny("secrets-gate: --no-verify in an agent command is denied by policy. If you are the USER, run the git command in your own terminal.");
      if (w.includes("commit")) isCommit = true;
      if (w.includes("push")) isPush = true;
      const c = w.indexOf("-C");
      if (c !== -1 && w[c + 1]) repoDir = w[c + 1].startsWith("/") ? w[c + 1] : resolve(repoDir, w[c + 1]);
      const gd = w.find((a) => a.startsWith("--git-dir="));
      if (gd) repoDir = gd.slice("--git-dir=".length);
    }
    if ((isCommit || isPush) && run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoDir }).ok) {
      if (isCommit && !run("gitleaks", ["protect", "--staged", "--redact", "--no-banner"], { cwd: repoDir }).ok)
        deny("gitleaks found secrets in STAGED content. Remove the secret (rotate if real). --no-verify is not available to agents.");
      if (isPush && !run("gitleaks", ["git", ".", "--redact", "--no-banner"], { cwd: repoDir }).ok)
        deny("gitleaks found secrets in commit history headed for the remote. Rotate the credential and rewrite/purge history. --no-verify is not available to agents.");
    }
  }

  // ---- edit-enforce ----
  for (const w of SEGS) {
    const v = verb(w);
    if (v === "cat") {
      const t = redirectTarget(w);
      if (t) deny(`edit-enforce: shell file-write via cat → ${t}. Use Write (new/whole file) or Edit (unique anchor) — prompt-free, diffed, syntax-checked.`);
    }
    if (v === "sed" || v === "perl") {
      const args = w.slice(w.indexOf(v) + 1);
      if (args.some((a) => a === "-i" || a.startsWith("-i") || a === "--in-place"))
        deny("edit-enforce: sed -i / perl -i in-place edit. Use Edit (surgical) or sd (bulk replace).");
    }
    if (["python3", "python", "node", "bun", "deno"].includes(v) && w.some((a) => a === "<op:<" || a === "<op:<<"))
      nudge("edit-enforce: inline interpreter heredoc — if it mutates files, switch to Edit/Write (context-anchored + syntax-checked). Pure compute: ignore.");
    if (v === "echo" || v === "printf") {
      const t = redirectTarget(w);
      if (t) nudge(`edit-enforce: generating file content via ${v} redirect → ${t} — prefer the Write tool. Command-output capture is fine.`);
    }
  }

  // ---- skill-install (signed approvals; format in lib/approvals.ts) ----
  {
    const installs: string[] = []; // how-descriptions for detected installs
    for (const w of SEGS) {
      const v = verb(w);
      const rest = w.slice(w.indexOf(v) + 1);
      if (["npx", "bunx", "pnpm", "yarn"].includes(v)) {
        const s = rest.indexOf("skills");
        if (s !== -1 && rest[s + 1] === "add") installs.push("third-party skill install");
      }
      if (v === "git" && rest[0] === "clone" && SKILLS_PATH.test(rest[rest.length - 1] ?? ""))
        installs.push("clone into a skills dir");
      if (["cp", "mv", "rsync", "ditto", "tar"].includes(v) && w.some((a) => SKILLS_PATH.test(a)))
        installs.push("install into skills dir");
      if (v === "claude" && rest.some((a) => ["plugin", "mcp"].includes(a)) && rest.some((a) => ["install", "add"].includes(a)))
        installs.push("third-party plugin/MCP install");
    }
    if (installs.length > 0) {
      const src = extractSourceRef(SEGS.flat());
      if (!verifyAndConsume(src)) denyInstall(installs.join(", "));
    }
  }

  // ---- tool-enforce (advisory) ----
  const v0 = verb(SEGS[0] ?? []);
  if (v0 in TOOL_MAP) nudge(`speedy-claude nudge: prefer the fast tool — ${v0} → ${TOOL_MAP[v0]} (see CLAUDE.md / klh-cli-speed-tools skill)`);

  allow();
}
