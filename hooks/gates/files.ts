// hooks/gates/files.ts — PostToolUse(Edit|Write|NotebookEdit): syntax gate +
// markdown format in ONE process (they fire on the same event). Includes all
// hooks-review fixes: ext case-folded, .zsh via zsh -n, .scss off biome,
// tsconfig-aware tsc tier-2, checkers run once, TOCTOU re-verify.
import { allow, feedback, type HookInput } from "../lib/hookio.ts";
import { have, lines, run } from "../lib/run.ts";
import { existsSync, readFileSync } from "node:fs";

export function filesGate(hook: HookInput): never {
  if (!["Edit", "Write", "NotebookEdit"].includes(hook.tool_name ?? "")) allow();
  const F = hook.tool_input?.file_path ?? hook.tool_input?.notebook_path ?? "";
  if (!F) allow();

  const isMd = /\.(md|markdown)$/i.test(F);

  // ---- markdown: prettier (GFM, prose preserved) ----
  if (isMd && existsSync(F) && have("prettier")) {
    const before = Bun.hash(readFileSync(F));
    run("prettier", ["--write", "--prose-wrap", "preserve", "--log-level", "warn", F]);
    const after = Bun.hash(readFileSync(F));
    if (before !== after)
      feedback(`md-format: reformatted ${F} with prettier (GFM: table alignment, list markers, fence style). Re-read before further edits.`);
  }

  // ---- syntax gate (code files) ----
  if (existsSync(F)) syntaxGate(F, hook.tool_name!);

  allow();
}

function syntaxGate(F: string, tool: string): void {
  const stillThere = () => existsSync(F);
  const fail = (err: string) => {
    if (!stillThere()) return; // TOCTOU: file gone — nothing to report
    process.stderr.write(`SYNTAX ERROR in ${F} after ${tool}:\n${err}\nFix this now before continuing.\n`);
    process.exit(2);
  };

  const ext = (F.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "json": { const r = run("jq", ["empty", F]); if (!r.ok) fail(lines(r.out, 3)); break; }
    case "jsonc": { if (have("biome")) { const r = run("biome", ["lint", F]); if (!r.ok) fail(lines(r.out, 3)); } break; }
    case "yaml": case "yml": {
      if (have("yq")) { const r = run("yq", ["e", ".", F]); if (!r.ok) fail(`invalid YAML: ${lines(r.out, 2)}`); }
      break;
    }
    case "toml": { if (have("taplo")) { const r = run("taplo", ["check", F]); if (!r.ok) fail(`invalid TOML: ${lines(r.out, 2)}`); } break; }
    case "py": {
      if (have("ruff")) {
        const r = run("ruff", ["check", "--no-cache", F]);
        if (!r.ok) { const syn = r.out.split("\n").filter((l) => /syntax/i.test(l)).slice(0, 2).join("\n"); if (syn) fail(syn); }
      } else {
        const r = run("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())", F]);
        if (!r.ok) fail(r.out.trim().split("\n").slice(-2).join("\n"));
      }
      break;
    }
    case "sh": case "bash": case "dash": { const r = run("bash", ["-n", F]); if (!r.ok) fail(lines(r.out, 3)); break; }
    case "zsh": { const r = run("zsh", ["-n", F]); if (!r.ok) fail(lines(r.out, 3)); break; } // zsh ≠ bash
    case "ts": case "mts": case "cts": case "tsx": case "jsx": case "js": case "mjs": case "cjs": {
      if (have("esbuild")) {
        const r = run("esbuild", [F, "--outfile=/dev/null", "--log-level=error"]);
        if (!r.ok) fail(lines(r.out, 5));
      } else if (["js", "mjs", "cjs"].includes(ext)) {
        const r = run("node", ["--check", F]);
        if (!r.ok) fail(lines(r.out, 5));
      }
      if (["ts", "mts", "cts"].includes(ext)) tsTier2(F, fail);
      break;
    }
    case "css": { if (have("biome")) { const r = run("biome", ["lint", F]); if (!r.ok) fail(lines(r.out, 3)); } break; }
    case "scss": { if (have("sass")) { const r = run("sass", ["--syntax-check", F]); if (!r.ok) fail(lines(r.out, 3)); } break; } // biome: no scss
  }
}

function tsTier2(F: string, fail: (s: string) => void): void {
  let dir = F.slice(0, F.lastIndexOf("/"));
  let tsc = "";
  for (let i = 0; i < 7; i++) {
    if (existsSync(`${dir}/node_modules/.bin/tsc`)) { tsc = `${dir}/node_modules/.bin/tsc`; break; }
    const parent = dir.slice(0, dir.lastIndexOf("/"));
    if (parent === dir) break;
    dir = parent;
  }
  if (!tsc) return;
  const here = F.slice(0, F.lastIndexOf("/"));
  const proj = existsSync(`${here}/tsconfig.json`) ? here : existsSync(`${here}/../tsconfig.json`) ? `${here}/..` : null;
  const r = proj
    ? run(tsc, ["--noEmit", "-p", proj]) // project-aware: decorators/namespaces settings honored
    : run(tsc, ["--noEmit", "--skipLibCheck", "--target", "esnext", "--module", "esnext", "--moduleResolution", "bundler", "--jsx", "preserve", F]);
  if (!r.ok) {
    const real = r.out.split("\n").filter((l) => l.includes("error TS") && !/TS(2307|2304|2792|7016|6133|6192|5107|1240|1241|2503)/.test(l));
    if (real.length) fail(real.slice(0, 5).join("\n"));
  }
}
