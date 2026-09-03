# Tooling Landscape — 2026-09 Research Digest

Four research streams (2026-09-03): dependency audit of our 36 tools, LLM-editing
tool landscape, post-edit verification speed benchmarks (measured on this
machine, hyperfine, 10 runs), and agent-persona effectiveness patterns.
Everything below fed a concrete change; "adopted" marks what's in this repo.

## 1. Post-edit syntax gates — measured, per language

| Language      | Gate                                                     | Measured  | Adopted                                                         |
| ------------- | -------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| JSON          | `jq empty f`                                             | 3.2ms     | ✅ (jsonc → biome lint)                                         |
| Shell         | `bash -n f`                                              | 2.4ms     | ✅ (+ shellcheck 21ms as lint, not gate)                        |
| TS/TSX/JSX/JS | `esbuild f --outfile=/dev/null`                          | **6.8ms** | ✅ tier 1 (parse-only, TS-native)                               |
| TS types      | project `tsc --noEmit` (tsc 7 native: 58ms single file)  | 58ms      | ✅ tier 2, resolution errors filtered                           |
| Python        | `ruff check --no-cache f`                                | **9.6ms** | ✅ (replaced `python3 ast.parse` 22.5ms)                        |
| YAML          | `yq e '.' f >/dev/null`                                  | 6.3ms     | ✅                                                              |
| TOML          | `taplo check f`                                          | 9.1ms     | ✅                                                              |
| CSS           | `biome lint f` (NOT `biome check` — fails on formatting) | 9.5ms     | ✅                                                              |
| C#            | Roslyn `csc.dll @rsp`                                    | 212ms     | noted (rsp per-TFM; `dotnet format` 2.42s is unusable per-edit) |
| SQL           | `sqlglot.parse`                                          | 74ms      | noted (sqlfluff false-positives on style — linter, not gate)    |

Key findings: `node --check` rejects valid TS (JS only). swc has no parse-only
CLI. `deno check` 268ms. tsc 7 native type-checks a lone file in 58ms and
follows relative imports — no error filtering needed except path aliases.

## 2. Editing tools landscape

- **Adopted: ast-grep** (+ its official agent-skill, now in `skills/`) — AST
  find/replace; strings/comments untouched. The structural layer sd/ambr can't provide.
- **`npx codemod` / `npx codemod ai`** (codemod.com, very active) — orchestration
  over ast-grep with test-verified transforms + JSSG semantic engine; try for
  large multi-step migrations. Not installed (on-demand via npx).
- **GritQL** — resumed maintenance; richer conditional rewrites than ast-grep
  patterns (`where` predicates, embedded languages). Watch, not installed.
- **codex-apply-patch** — standalone V4A patch CLI (OpenAI's format). Interesting
  escalation path for multi-hunk patches; third-party binary mirror — evaluate
  before adopting.
- **Skipped**: comby (no release since 2022), fastmod (redundant with sd),
  jscodeshift (codemod.com supersedes), semgrep rewrite (YAML-rule friction),
  fast-apply LLMs (network/API dependency for a deterministic job).
- Insight: keep the primary edit path Claude-native (models are trained on
  their own Edit schema); escalate to codemods/V4A only for multi-file work.

## 3. Dependency audit (36 tools → 33)

Dropped: `sad` (dormant 19mo, redundant with sd+amber), `diskus` (redundant
with dust), `git-standup` (no release since 2020). Watch-list: `mkcert`
("done, not dead" per maintainer), `aria2` (glacial release cadence, still
unique). Everything else active in 2026 — including former staleness worries
tokei (v14 revived), xcp, doggo. `scc` is the higher-activity alternative to
tokei if complexity metrics are ever wanted.

## 4. Persona effectiveness patterns (evidence-based)

Adopted across all 8 personas:

- **`model:` pinning** — subagents inherit the session model by default;
  unpinned personas silently run on the expensive model. haiku for
  drafting/lookup (growth-marketer), sonnet for everyday (reviewer, tester,
  designer, devops, outreach), opus for deep reasoning (security-auditor,
  llm-performance-analyst).
- **`tools:` restriction** — read-only lists for reviewer personas stop the
  reviewer from "fixing" what it flags (a classic wasted-turn generator).
- **`maxTurns:`** — hard cost cap per persona.
- **Trigger-phrase descriptions** ("Use when…", "Use PROACTIVELY…") — routing
  lives in the description; it's the only part loaded every session.

Evidence notes: token usage alone explained 80% of multi-agent performance
variance (Anthropic); structured output schemas lift adherence <40%→~100%
(OpenAI); verify-only subagents lifted task success ~58%→~80% (arXiv 2608.02645);
persona framing is a style lever, not an accuracy lever (arXiv 2311.10054) —
so bodies stay lean: role, method, output contract, verify, one example.

## 5. Hook & automation patterns

- Deterministic hook > CLAUDE.md instruction ("a hook decides; a rule asks
  nicely" — community consensus 2026).
- Claude Code hooks support `"async": true` / `"asyncRewake": true` + explicit
  `"timeout"` — fast gates sync, heavy lint (qlty/tsc/shellcheck) async-ready.
- `watchexec -p -d 200 -e ts,tsx` sidecar = format+gate on every write,
  independent of any hook system.
- Git-stage safety with agents: `stagelint` (three-way merge, `--unstaged`)
  over lint-staged's stash model.
- The daily performance-review loop: launchd `com.klh.claude-insights` runs a
  headless `claude -p` analyst at 06:43 with no session open; findings land in
  `~/.claude/insights/` and surface at the next session start.
