// hooks/lib/approvals.ts — the ONE definition of the signed-approval format,
// shared by the minter (approve-skill script) and the gate reader. If this
// format changes, change it HERE only.
//
// File format (~/.claude-insights/.approvals/<epoch-ts>.approval):
//   src=<source-ref>
//   ts=<epoch-seconds>
//   sig=hmac-sha256("<src>|<ts>", secret)
// Secret: ~/.claude/.skill-review-secret (0600, 32-byte hex)
// Policy: single-use (consumed on match), 24h expiry, source-bound.
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, readdirSync } from "node:fs";

const DIR = `${process.env.HOME}/.claude-insights/.approvals`;
const SECRET_FILE = `${process.env.HOME}/.claude/.skill-review-secret`;
const EXPIRY_S = 86400;

export function verifyAndConsume(matchSource: string): boolean {
  if (!existsSync(DIR) || !existsSync(SECRET_FILE)) return false;
  const secret = readFileSync(SECRET_FILE, "utf8").trim();
  const now = Date.now() / 1000;
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".approval")) continue;
    const content = readFileSync(`${DIR}/${f}`, "utf8");
    const src = /^src=(.*)$/m.exec(content)?.[1] ?? "";
    const ts = Number(/^ts=(.*)$/m.exec(content)?.[1] ?? 0);
    const sig = /^sig=(.*)$/m.exec(content)?.[1] ?? "";
    if (now - ts > EXPIRY_S) { try { unlinkSync(`${DIR}/${f}`); } catch {} continue; }
    if (sig !== createHmac("sha256", secret).update(`${src}|${ts}`).digest("hex")) continue;
    // Bind: the approval's source must match the install target.
    // Exact match, or the source-ref appears as a substantial substring of a
    // command word (not a trivial token that matches anything).
    if (src === matchSource || (matchSource.length > 8 && (src.includes(matchSource) || matchSource.includes(src)))) {
      try { unlinkSync(`${DIR}/${f}`); } catch {} // consume (single-use)
      return true;
    }
  }
  return false;
}

/** Find the most likely "source ref" token in an install command — the
 *  org/repo or org/repo@ref argument. Heuristic: longest non-flag word
 *  containing a slash that isn't a path into the skills dirs. */
export function extractSourceRef(cmdWords: string[]): string {
  const SKILLS_PATH = /\.claude\/skills|\.agents\/skills/;
  const candidates = cmdWords.filter((w) => w.includes("/") && !w.startsWith("-") && !SKILLS_PATH.test(w));
  return candidates.sort((a, b) => b.length - a.length)[0] ?? "";
}
