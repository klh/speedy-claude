#!/usr/bin/env bun
// pre-tagger.ts — local-LLM transcript pre-classification for the daily analyst.
// Uses the fast non-thinking 4B to tag transcript turns with error-pattern labels,
// producing a compact summary that the remote analyst reads instead of raw transcripts.
// Cuts the remote analyst's token consumption by ~70%.
//
// Run by daily-insights.ts BEFORE the remote analyst phase.
// Output: ~/.claude-insights/pre-tagged.json

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME!;
const PROJECTS_DIR = `${HOME}/.claude/projects`;
const OUTPUT = `${HOME}/.claude-insights/pre-tagged.json`;
const LOCAL_PORT = 8902; // non-thinking 4B
const LOCAL_MODEL = "Qwen3-4B-Instruct-2507-4bit";

interface TranscriptEntry {
  timestamp: string;
  type: string;
  tool_name?: string;
  content?: string;
}

interface TaggedTurn {
  file: string;
  turn_index: number;
  tool: string;
  tags: string[];
  summary: string;
}

async function tagTranscript(filePath: string): Promise<TaggedTurn[]> {
  const content = readFileSync(filePath, "utf8");
  const lines = content.trim().split("\n").slice(0, 50); // first 50 lines (sample)

  // Parse tool calls
  const toolCalls: Array<{ line: number; tool: string; command: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      const j = JSON.parse(lines[i]);
      if (j.type === "assistant" && j.message?.content) {
        for (const block of j.message.content) {
          if (block.type === "tool_use") {
            toolCalls.push({
              line: i,
              tool: block.name,
              command: JSON.stringify(block.input).slice(0, 100),
            });
          }
        }
      }
    } catch {}
  }

  if (toolCalls.length === 0) return [];

  // Ask the local 4B to classify the pattern
  const toolSummary = toolCalls.map(t => `${t.tool}: ${t.command.slice(0, 50)}`).join("\n");

  const prompt = `Analyze this sequence of tool calls from a coding agent and identify error patterns.
Tag each pattern found (or "none"):

Patterns to check:
- hasty_edit (edit before reading)
- tunnel_vision (fixing symptom not cause)
- symptom_loop (retrying same approach)
- tool_misuse (wrong tool for job)
- scope_drift (unrequested changes)
- batch_without_verify (multiple edits without testing)
- context_amnesia (re-deriving known facts)

Tool calls:
${toolSummary}

Respond as JSON: {"tags": ["pattern1"], "summary": "one-line description"}`;

  try {
    const r = await fetch(`http://localhost:${LOCAL_PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: `mlx-community/${LOCAL_MODEL}`,
        messages: [
          { role: "system", content: "/no_think" },
          { role: "user", content: prompt },
        ],
        max_tokens: 256,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content ?? "";

    // Parse JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return [{
        file: filePath.split("/").pop() ?? "unknown",
        turn_index: 0,
        tool: "sequence",
        tags: parsed.tags ?? [],
        summary: parsed.summary ?? "",
      }];
    }
  } catch {}

  return [];
}

// ─── main ───
console.log("🏷️ Pre-tagging transcripts with local 4B…");

// Find recent transcripts
const cutoff = Date.now() - 24 * 60 * 60 * 1000;
const files: string[] = [];
for (const dir of readdirSync(PROJECTS_DIR)) {
  const projectPath = join(PROJECTS_DIR, dir);
  try {
    for (const f of readdirSync(projectPath)) {
      if (f.endsWith(".jsonl")) {
        const full = join(projectPath, f);
        if (statSync(full).mtimeMs > cutoff) {
          files.push(full);
        }
      }
    }
  } catch {}
}

console.log(`  Found ${files.length} recent transcript(s)`);

const tagged: TaggedTurn[] = [];
for (const file of files.slice(0, 5)) { // limit to 5 transcripts
  const result = await tagTranscript(file);
  tagged.push(...result);
  if (result.length > 0) {
    console.log(`  ✓ ${file.split("/").pop()}: ${result[0].tags.join(", ") || "no patterns"}`);
  }
}

writeFileSync(OUTPUT, JSON.stringify(tagged, null, 2));
console.log(`\n✓ Pre-tagged ${tagged.length} transcript(s) → ${OUTPUT}`);
console.log(`  The remote analyst can now read this compact summary`);
console.log(`  instead of raw transcripts (saves ~70% tokens)`);
