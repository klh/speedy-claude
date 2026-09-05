#!/usr/bin/env bun
// router-swarm.ts — self-aware specialist swarm with dynamic handoff.
// Each model knows what the others are good at, can evaluate mid-task
// whether to hand off, and can request work back. The router orchestrates.
//
// Architecture:
//   Request → Router → Specialist A (evaluates task)
//                        ↓ if handoff signal
//                    Specialist B (continues with context from A)
//                        ↓ if handoff back
//                    Specialist A or C (verification/follow-up)
//                        ↓
//                    Final response → client
//
// The handoff protocol is JSON in the response:
//   {"handoff": {"to": "reason", "reason": "...", "context": "..."}}
//
// Port :4000, Anthropic API format.

import { appendFileSync } from "node:fs";

const LOG = `${process.env.HOME}/.claude-insights/swarm-routing.log`;
function log(entry: Record<string, unknown>) {
  try {
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch {}
}

// ─── specialist registry (shared awareness) ───
interface SpecialistInfo {
  key: string;
  port: number;         // preferred port (overridden by discovery)
  model: string;        // preferred model (overridden by discovery)
  label: string;
  strengths: string;
  speed: string;
}

const SPECIALISTS: SpecialistInfo[] = [
  { key: "extract", port: 8902, model: "mlx-community/Qwen3-4B-Instruct-2507-4bit", label: "🏠 extract", strengths: "fast classification, entity extraction, JSON output, yes/no, sorting, filtering, summarization", speed: "~100 TPS (fastest)" },
  { key: "code", port: 8903, model: "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit", label: "⚡ code", strengths: "TypeScript/JavaScript, refactoring, debugging, code review, API design", speed: "~25 TPS" },
  { key: "reason", port: 8903, model: "mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit", label: "🧠 reason", strengths: "deep analysis, architectural reasoning, multi-step logic, evaluation, Danish text", speed: "~15 TPS (highest quality)" },
  { key: "remote", port: 0, model: "z.ai-glm-5.3", label: "☁️ remote", strengths: "frontier reasoning, long context (1M), complex code, creative writing", speed: "~200 TPS (costs money)" },
];

// ─── dynamic model discovery ───
// MLX server port assignments are unreliable — the model that loads on :8901
// isn't necessarily the one we asked for. The router queries all ports at
// startup (and periodically) to build a runtime model-to-port mapping.
const SCAN_PORTS = [8901, 8902, 8903, 8904, 8905, 8906];
let discoveredModels = new Map<number, string>(); // port → actual model id

async function discoverModels(): Promise<void> {
  discoveredModels.clear();
  for (const port of SCAN_PORTS) {
    try {
      const r = await fetch(`http://localhost:${port}/v1/models`, {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        const j = await r.json();
        const model = j.data?.[0]?.id;
        if (model) discoveredModels.set(port, model);
      }
    } catch {}
  }
  console.log(`[discovery] found ${discoveredModels.size} specialists:`);
  for (const [port, model] of discoveredModels) {
    console.log(`  :${port} → ${model.replace("mlx-community/", "")}`);
  }
}

// Find the port that actually has a model matching the pattern
function findPortForModel(pattern: string): number | null {
  for (const [port, model] of discoveredModels) {
    if (model.includes(pattern)) return port;
  }
  return null;
}

// Resolve a specialist's actual port via discovery (fallback to config)
function resolvePort(specialist: SpecialistInfo): number {
  if (specialist.key === "remote") return 0;

  // Try to find by model pattern
  const patterns: Record<string, string[]> = {
    extract: ["Instruct-2507", "Qwen3-4B-Instruct"],  // non-thinking 4B
    code: ["Coder-7B", "Coder-0.5B", "Qwen2.5-Coder", "Qwen3-Coder-30B"],
    reason: ["Claude", "27B", "Qwen3.5-27B"],
  };

  const patternsForKey = patterns[specialist.key];
  if (patternsForKey) {
    for (const p of patternsForKey) {
      const port = findPortForModel(p);
      if (port !== null) return port;
    }
  }

  // Fallback: use configured port
  return specialist.port;
}

// Build the awareness prompt that's injected into every specialist call
function buildAwarenessPrompt(currentKey: string): string {
  const others = SPECIALISTS.filter(s => s.key !== currentKey);
  const lines = others.map(s =>
    `- ${s.key} (${s.label}): ${s.strengths}. Speed: ${s.speed}.`
  ).join("\n");

  return `You are part of a specialist swarm. You are: ${currentKey}.

Other available specialists you can hand off to:
${lines}

HANDOFF PROTOCOL:
If you determine that another specialist would handle this task significantly better,
include this JSON at the START of your response (before any other content):

{"handoff": {"to": "<specialist-key>", "reason": "<one sentence why>", "context": "<key findings or partial work so far>"}}

Rules:
- Only hand off if the difference is significant (not just marginal preference)
- Include enough context that the receiving specialist doesn't start from zero
- If you can handle it adequately, just respond normally — no handoff needed
- You may receive a handoff FROM another specialist (their context will be in the prompt)
- If receiving a handoff and you complete the task, just respond normally

Example handoff:
{"handoff": {"to": "reason", "reason": "This requires multi-step architectural analysis beyond classification", "context": "Identified 3 conflicting requirements in the input"}}`;
}

// ─── handoff parsing ───
interface HandoffSignal {
  to: string;
  reason: string;
  context: string;
}

function parseHandoff(text: string): { handoff?: HandoffSignal; cleanResponse: string } {
  // Look for the handoff JSON at the start of the response
  const match = text.match(/^\s*\{["\s]*handoff["\s]*:\s*\{[\s\S]*?\}\s*\}/);
  if (!match) return { cleanResponse: text };

  try {
    const parsed = JSON.parse(match[0]);
    if (parsed.handoff?.to && SPECIALISTS.some(s => s.key === parsed.handoff.to)) {
      return {
        handoff: parsed.handoff,
        cleanResponse: text.slice(match[0].length).trim(),
      };
    }
  } catch {}
  return { cleanResponse: text };
}

// ─── specialist call with awareness ───
async function callSpecialist(
  specialist: SpecialistInfo,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  extraContext?: string
): Promise<{ text: string; handoff?: HandoffSignal }> {
  // Inject awareness into system prompt
  const awareness = buildAwarenessPrompt(specialist.key);
  const systemContent = extraContext
    ? `${awareness}\n\nCONTEXT FROM PREVIOUS SPECIALIST:\n${extraContext}`
    : awareness;

  const fullMessages = [
    { role: "system", content: `${systemContent} /no_think` },
    ...messages,
  ];

  const r = await fetch(`http://localhost:${specialist.port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: specialist.model,
      messages: fullMessages,
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const j = await r.json();
  const msg = j.choices?.[0]?.message ?? {};
  let text = (msg.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim()
    || (msg.reasoning_content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  const { handoff, cleanResponse } = parseHandoff(text);
  return { text: cleanResponse, handoff };
}

// ─── remote call (for handoff to "remote") ───
async function callRemote(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  extraContext?: string
): Promise<{ text: string }> {
  const token = JSON.parse(
    await Bun.file(`${process.env.HOME}/.claude/settings.json`).text()
  ).env.ANTHROPIC_AUTH_TOKEN;

  const systemContent = extraContext
    ? `CONTEXT FROM LOCAL SPECIALIST:\n${extraContext}`
    : "You are a frontier reasoning model.";

  const r = await fetch("https://api.z.ai/api/anthropic/v1/messages", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "glm-5.3[1m]",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemContent },
        ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const j = await r.json();
  return { text: j.content?.[0]?.text ?? "" };
}

// ─── complexity scoring for initial routing (with discovery) ───
function routeInitial(text: string): SpecialistInfo {
  if (/\b(function|class|type\s|const\s|import\s|export\s|typescript|javascript|refactor|debug|compile|api|component|hook)\b/i.test(text)) {
    const s = SPECIALISTS.find(s => s.key === "code")!;
    s.port = resolvePort(s); // dynamic discovery
    s.model = discoveredModels.get(s.port) ?? s.model;
    return s;
  }
  if (text.length > 200 || /\b(analyze|explain|compare|evaluate|design|architect|strategy|why|trade.?off|danish|dansk)\b/i.test(text)) {
    const s = SPECIALISTS.find(s => s.key === "reason")!;
    s.port = resolvePort(s);
    s.model = discoveredModels.get(s.port) ?? s.model;
    return s;
  }
  const s = SPECIALISTS.find(s => s.key === "extract")!;
  s.port = resolvePort(s);
  s.model = discoveredModels.get(s.port) ?? s.model;
  return s;
}

// ─── main router server ───
const MAX_HANDOFFS = 3; // prevent infinite loops

const server = Bun.serve({
  port: 4000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health/liveliness") {
      return Response.json({
        status: "alive",
        router: "swarm-aware+discovery",
        specialists: SPECIALISTS.map(s => ({
          key: s.key,
          label: s.label,
          port: resolvePort(s),
          actualModel: discoveredModels.get(resolvePort(s)) ?? s.model,
        })),
      });
    }

    if (req.method === "GET" && url.pathname === "/discover") {
      await discoverModels();
      return Response.json({
        discovered: Object.fromEntries(discoveredModels),
        ports_scanned: SCAN_PORTS,
      });
    }

    if (req.method !== "POST" || url.pathname !== "/v1/messages") {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    let body: any;
    try { body = await req.json(); } catch {
      return Response.json({ error: "bad json" }, { status: 400 });
    }

    const startTime = Date.now();
    const messages = (body.messages ?? []).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content
        : Array.isArray(m.content) ? m.content.map((b: any) => b.text ?? "").join("")
        : "",
    }));
    const userText = messages.filter(m => m.role === "user").map(m => m.content).join(" ");
    const maxTokens = Math.min(body.max_tokens ?? 1024, 4096);

    // Initial routing by complexity
    let current = routeInitial(userText);
    let context: string | undefined;
    let finalText = "";
    const handoffChain: Array<{ from: string; to: string; reason: string }> = [];

    // Process with handoff chain
    for (let hop = 0; hop < MAX_HANDOFFS; hop++) {
      let result: { text: string; handoff?: HandoffSignal };

      if (current.key === "remote") {
        const r = await callRemote(messages, maxTokens, context);
        result = { text: r.text };
      } else {
        result = await callSpecialist(current, messages, maxTokens, context);
      }

      if (result.handoff) {
        const target = SPECIALISTS.find(s => s.key === result.handoff!.to);
        if (!target) break;

        handoffChain.push({
          from: current.key,
          to: target.key,
          reason: result.handoff.reason,
        });

        // Accumulate context
        const prevOutput = result.text || result.handoff.context;
        context = context
          ? `${context}\n\n[${current.key} → ${target.key}]: ${prevOutput}`
          : `[${current.key} → ${target.key}]: ${prevOutput}`;

        current = target;
        continue; // next hop
      }

      // No handoff — we have the final answer
      finalText = result.text;
      break;
    }

    if (!finalText) {
      finalText = "All specialists exhausted their handoff chain without a final answer.";
    }

    const duration = Date.now() - startTime;

    // Log the full chain
    log({
      category: handoffChain.length > 0 ? "handoff-chain" : current.key,
      model: current.model,
      duration_ms: duration,
      prompt: userText.slice(0, 80),
      port: current.port,
      handoffs: handoffChain,
      hops: handoffChain.length,
    });

    return Response.json({
      id: `msg_swarm_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "text", text: finalText }],
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
      _routing: {
        initial: handoffChain[0]?.from ?? current.key,
        final: current.key,
        handoffs: handoffChain,
        hops: handoffChain.length,
        duration_ms: duration,
      },
    });
  },
});

console.log(`router-swarm (self-aware + discovery) on :4000`);
console.log(`  Specialists know about each other and can hand off mid-task`);
console.log(`  Dynamic model discovery: queries ports to find what's ACTUALLY running`);
console.log(`  Max handoff chain: ${MAX_HANDOFFS}`);
console.log(`  Protocol: {"handoff": {"to": "...", "reason": "...", "context": "..."}}`);

// Run discovery on startup
discoverModels().then(() => {
  // Re-discover every 5 minutes (models may swap)
  setInterval(() => discoverModels(), 5 * 60 * 1000);
});
