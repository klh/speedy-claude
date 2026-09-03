#!/usr/bin/env bun
// ~/.claude/hooks/bash-gate.ts — the single PreToolUse(Bash) dispatcher.
// Replaces secrets-gate.sh + edit-enforce.sh + skill-install-gate.sh +
// tool-enforce.sh: ONE process, ONE parse. Architecture (user-directed,
// 2026-09-03): shell-quote parses tool_input.command into an AST — quoting
// tricks, env prefixes, separators, and redirects are STRUCTURAL, so gate
// logic is typed functions over tokens, not regex against shell text.
// External tools (gitleaks) launch with argument arrays — no shell re-parse.

import { parse, type Token } from "shell-quote";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

type Op = { op: string };
type Cmd = { cmd: string };
type Tok = string | Op | Cmd;

const input = await new Response(Bun.stdin).text();
let hook: { tool_name?: string; tool_input?: { command?: string }; cwd?: string } = {};
try {
  hook = JSON.parse(input);
} catch {
  process.exit(0);
}
const CMD = hook.tool_input?.command ?? "";
const CWD = hook.cwd ?? process.env.HOME ?? "/";
if (hook.tool_name !== "Bash" || !CMD) allow();

const deny = (reason: string) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
};
const nudge = (message: string) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: message },
    })
  );
  process.exit(0);
};
function allow(): never {
  process.stdout.write("{}");
  process.exit(0);
}

// ---------- AST helpers ----------
const isOp = (t: Tok, ...ops: string[]): t is Op => typeof t === "object" && "op" in t && ops.includes((t as Op).op);

/** Split token stream into command segments on ; & | && || ( ) */
function segments(toks: Tok[]): Tok[][] {
  const segs: Tok[][] = [[]];
  for (const t of toks) {
    if (isOp(t, ";", "&", "|", "&&", "||", "(", ")")) segs.push([]);
    else segs[segs.length - 1].push(t);
  }
  return segs.filter((s) => s.length > 0);
}

/** Words of a segment as strings; $(...) / ${...} become "<sub>" markers. */
function words(seg: Tok[]): string[] {
  return seg.map((t) => {
    if (typeof t === "string") return t;
    if ("op" in t) return `<op:${t.op}>`;
    return `<sub>`; // command/param substitution — unknown but present
  });
}

/** Strip leading VAR=value assignments (env prefixes). */
function stripEnv(w: string[]): string[] {
  let i = 0;
  while (i < w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i])) i++;
  return w.slice(i);
}

/** First meaningful token of a segment as the "verb" (sudo/nice/env stripped). */
function verb(w: string[]): string {
  const noEnv = stripEnv(w);
  while (noEnv.length && ["sudo", "nice", "env", "command", "nohup", "time"].includes(noEnv[0])) noEnv.shift();
  return noEnv[0] ?? "";
}

const isThrowawayPath = (p: string) =>
  p.startsWith("/tmp/") || p.startsWith("/private/tmp/") || p.startsWith("/dev/") || p.includes("$TMPDIR");

const allWords = (toks: Tok[]): string[] => words(toks);
const EVERY = allWords(parse(CMD) as Tok[]); // every word, for whole-command checks
const SEGS = segments(parse(CMD) as Tok[]).map((s) => stripEnv(words(s)));

// ---------- GATE 1: secrets (git commit / push) ----------
if (existsSync("/opt/homebrew/bin/gitleaks") || existsSync("/usr/local/bin/gitleaks")) {
  let isCommit = false,
    isPush = false,
    repoDir = CWD;
  for (const w of SEGS) {
    if (verb(w) !== "git") continue;
    // bare --no-verify flag (exact token) — agent policy deny
    if (w.includes("--no-verify"))
      deny(
        "secrets-gate: --no-verify in an agent command is denied by policy. If you are the USER, run the git command in your own terminal."
      );
    if (w.includes("commit")) isCommit = true;
    if (w.includes("push")) isPush = true;
    const c = w.indexOf("-C");
    if (c !== -1 && w[c + 1]) repoDir = w[c + 1].startsWith("/") ? w[c + 1] : resolve(repoDir, w[c + 1]);
    const gd = w.find((a) => a.startsWith("--git-dir="));
    if (gd) repoDir = gd.slice("--git-dir=".length);
  }
  if (isCommit || isPush) {
    const r = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoDir, encoding: "utf8" });
    if (r.status === 0) {
      if (isCommit) {
        const g = spawnSync("gitleaks", ["protect", "--staged", "--redact", "--no-banner"], { cwd: repoDir });
        if (g.status !== 0)
          deny(
            "gitleaks found secrets in STAGED content. Remove the secret (rotate if real). --no-verify is not available to agents."
          );
      }
      if (isPush) {
        const g = spawnSync("gitleaks", ["git", ".", "--redact", "--no-banner"], { cwd: repoDir });
        if (g.status !== 0)
          deny(
            "gitleaks found secrets in commit history headed for the remote. Rotate the credential and rewrite/purge history. --no-verify is not available to agents."
          );
      }
    }
  }
}

// ---------- GATE 2: edit-enforce (shell file-writes) ----------
for (const w of SEGS) {
  const v = verb(w);
  // cat writing to a file: `cat > f` / `cat >> f` (redirect op between cat and target)
  if (v === "cat") {
    const gt = w.findIndex((a) => a === "<op:>>" || a === "<op:>>>" || a === "<op:>>=>");
    const gt2 = w.findIndex((a) => a.startsWith("<op:>"));
    const idx = gt !== -1 ? gt : gt2;
    if (idx !== -1 && w[idx + 1] && !isThrowawayPath(w[idx + 1]))
      deny(
        `config/edit-enforce: shell file-write via cat → ${w[idx + 1]}. Use Write (new/whole file) or Edit (unique anchor) — prompt-free, diffed, syntax-checked.`
      );
  }
  // in-place mutation via sed -i / perl -i* (verb-level, any position after verb)
  if (v === "sed" || v === "perl") {
    const args = w.slice(w.indexOf(v) + 1);
    if (args.some((a) => a === "-i" || a.startsWith("-i") || a === "--in-place"))
      deny("edit-enforce: sed -i / perl -i in-place edit. Use Edit (surgical) or sd (bulk replace).");
  }
  // interpreter heredoc mutators + echo/printf file generation: nudge (advisory)
  if (["python3", "python", "node", "bun", "deno"].includes(v) && w.some((a) => a === "<op:<" || a === "<op:<<"))
    nudge("edit-enforce: inline interpreter heredoc — if it mutates files, switch to Edit/Write (context-anchored + syntax-checked). Pure compute: ignore.");
  if (["echo", "printf"].includes(v)) {
    const idx = w.findIndex((a) => a.startsWith("<op:>"));
    if (idx !== -1 && w[idx + 1] && !isThrowawayPath(w[idx + 1]))
      nudge("edit-enforce: generating file content via echo/printf redirect — prefer the Write tool. Command-output capture is fine.");
  }
}

// ---------- GATE 3: skill-install ----------
{
  const reviewed = EVERY.includes("--security-reviewed");
  if (!reviewed) {
    for (const w of SEGS) {
      const v = verb(w);
      const i = w.indexOf(v);
      const rest = w.slice(i + 1);
      // npx [-flags] skills add ...
      if (["npx", "bunx", "pnpm", "yarn"].includes(v)) {
        const s = rest.indexOf("skills");
        if (s !== -1 && rest[s + 1] === "add")
          deny(
            "skill-install-gate: third-party skill install blocked. Run the skill-security-review skill on the exact source; on PASS re-run with --security-reviewed."
          );
      }
      if (["git"].includes(v) && rest[0] === "clone") {
        const target = rest[rest.length - 1];
        if (/\.claude\/skills|\.agents\/skills/.test(target))
          deny("skill-install-gate: clone into a skills dir blocked. Run skill-security-review on the source; on PASS re-run with --security-reviewed.");
      }
      if (["cp", "mv", "rsync", "ditto"].includes(v) && w.some((a) => /\.claude\/skills|\.agents\/skills/.test(a)))
        deny("skill-install-gate: install into skills dir blocked. Run skill-security-review first; on PASS re-run with --security-reviewed.");
      if (v === "tar" && w.some((a) => /\.claude\/skills/.test(a)))
        deny("skill-install-gate: tar extract into skills dir blocked. skill-security-review first; on PASS add --security-reviewed.");
      if (v === "claude") {
        const sub = rest.find((a) => ["plugin", "mcp"].includes(a));
        const act = rest.find((a) => ["install", "add"].includes(a));
        if (sub && act)
          deny("skill-install-gate: third-party plugin/MCP install blocked. skill-security-review on the source first; on PASS re-run with --security-reviewed.");
      }
    }
  }
}

// ---------- GATE 4: tool-enforce (advisory fast-tool nudges) ----------
{
  const MAP: Record<string, string> = {
    ls: "eza -la (or eza --tree)",
    find: "fd",
    grep: "rg",
    cat: "bat",
    sed: "sd",
    du: "dust",
    diff: "difft",
    ps: "procs",
    curl: "xh",
  };
  const v = verb(SEGS[0] ?? []);
  if (v in MAP) nudge(`speedy-claude nudge: prefer the fast tool — ${v} → ${MAP[v]} (see CLAUDE.md / klh-cli-speed-tools skill)`);
}

allow();
