#!/usr/bin/env bun
// router-shim.ts — LLM specialist swarm router with complexity-based routing.
// Anthropic API format on :4000. Routes to best specialist per request.
// Upgraded from keyword heuristics to 7-dimension complexity scoring
// (LiteLLM Auto Router pattern, adapted for our Bun/TS stack).
import { appendFileSync } from "node:fs";

const ROUTING_LOG = `${process.env.HOME}/.claude-insights/swarm-routing.log`;
function logRouting(entry: { category: string; model: string; duration_ms: number; prompt: string; port: number; complexity: number; dimensions: Record<string, number> }) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
    prompt: entry.prompt.slice(0, 80),
  });
  try { appendFileSync(ROUTING_LOG, line + "\n"); } catch {}
}

// ─── 7-dimension complexity scoring (LiteLLM Auto Router pattern) ───
interface ComplexityScore {
  total: number;        // 0..1 (higher = more complex)
  tier: "SIMPLE" | "MEDIUM" | "COMPLEX" | "VERY_COMPLEX";
  dimensions: Record<string, number>;
}

const CODE_PATTERNS = /\b(function|class|interface|type\s|const\s|let\s|var\s|import\s|export\s|def\s|public\s|private\s|async\s|await|return|=>|\.ts|\.tsx|\.js|\.py|\.cs|typescript|javascript|python|csharp|refactor|debug|compile|lint|api|endpoint|component|hook|docker|kubernetes|algorithm|implement|optimize)\b/i;
const REASONING_MARKERS = /\b(analyze|explain|compare|evaluate|design|architect|strategy|why|how\s+does|what\s+if|pros\s+and\s+cons|trade.?off|implications|consequences|root\s+cause|derive|prove|justify|critique)\b/i;
const TECHNICAL_TERMS = /\b(distributed|concurrency|latency|throughput|scalab|migration|protocol|authentication|encryption|database|schema|middleware|microservice|monolith|event.?driven|state\s+machine|compiler|runtime|garbage\s+collection)\b/i;
const SIMPLE_INDICATORS = /^(reply|respond|list|name|give\s+me|tell\s+me|what\s+is|who\s+is|when\s+is|where\s+is|how\s+many|convert|translate|summarize\s+this|format\s+this|sort\s+this)\b/i;
const MULTI_STEP = /\b(first.*then|step\s+\d|also\s+after|additionally|furthermore|meanwhile|subsequently|before\s+that|after\s+that|next\s+you|finally)\b/i;
const QUESTION_DEPTH = /\b(underlying|fundamental|philosophical|theoretical|abstract|conceptual|architectural|systemic|holistic|nuanced|paradox|dilemma|emergence)\b/i;

function scoreComplexity(text: string): ComplexityScore {
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).length;

  const dimensions: Record<string, number> = {
    tokenCount: Math.min(words / 200, 1),                    // 200+ words = max
    codePresence: CODE_PATTERNS.test(text) ? 0.8 : 0,
    reasoningMarkers: (lower.match(new RegExp(REASONING_MARKERS.source, "gi")) ?? []).length * 0.25,
    technicalTerms: (lower.match(new RegExp(TECHNICAL_TERMS.source, "gi")) ?? []).length * 0.2,
    simpleIndicators: SIMPLE_INDICATORS.test(text.trim()) ? -0.3 : 0,  // NEGATIVE weight
    multiStep: MULTI_STEP.test(lower) ? 0.3 : 0,
    questionComplexity: QUESTION_DEPTH.test(lower) ? 0.4 : 0,
  };

  // clamp each to 0..1
  for (const k of Object.keys(dimensions)) {
    dimensions[k] = Math.max(0, Math.min(1, dimensions[k]));
  }

  // weighted sum (LiteLLM-style tunable weights)
  const weights: Record<string, number> = {
    tokenCount: 0.15,
    codePresence: 0.25,
    reasoningMarkers: 0.25,
    technicalTerms: 0.10,
    simpleIndicators: 0.10,  // negative weight pulls toward SIMPLE
    multiStep: 0.05,
    questionComplexity: 0.10,
  };

  let total = 0;
  for (const [dim, weight] of Object.entries(weights)) {
    total += dimensions[dim] * weight;
  }
  total = Math.max(0, Math.min(1, total));

  // code tasks always route to coder regardless of complexity
  if (dimensions.codePresence > 0.5) {
    return { total, tier: "MEDIUM", dimensions };
  }

  // tier mapping (tuned thresholds)
  let tier: ComplexityScore["tier"];
  if (total < TIER_THRESHOLDS.SIMPLE) tier = "SIMPLE";
  else if (total < TIER_THRESHOLDS.MEDIUM) tier = "MEDIUM";
  else if (total < TIER_THRESHOLDS.COMPLEX) tier = "COMPLEX";
  else tier = "VERY_COMPLEX";

  return { total, tier, dimensions };
}

// ─── tier → specialist mapping (matches ACTUAL running ports) ───
// :8901 is unreliable (MLX server port quirk) — route through :8903 for code+reasoning
// ─── tier → specialist mapping (matches ACTUAL running ports) ───
// NOTE: 27B Claude-distilled is high-quality but slow (~15s+ for generation).
// For interactive speed, route everything through the fast 4B unless the
// task genuinely needs the 27B's reasoning. The tier info is preserved in
// _routing for analytics even when the port is the same.
const TIER_ROUTES: Record<string, { port: number; model: string; category: string }> = {
  SIMPLE:       { port: 8902, model: "mlx-community/Qwen3-4B-Instruct-2507-4bit", category: "extract" },
  MEDIUM:       { port: 8902, model: "mlx-community/Qwen3-4B-Instruct-2507-4bit", category: "code" },
  COMPLEX:      { port: 8902, model: "mlx-community/Qwen3-4B-Instruct-2507-4bit", category: "reason" },
  VERY_COMPLEX: { port: 8903, model: "mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit", category: "deep-reason" },
};

// Lower thresholds (were too conservative — 0.221 scored as SIMPLE)
const TIER_THRESHOLDS = { SIMPLE: 0.15, MEDIUM: 0.35, COMPLEX: 0.60 };

// ─── Anthropic↔OpenAI shim ───
const server = Bun.serve({
  port: 4000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health/liveliness") {
      return Response.json({ status: "alive", router: "complexity-v2" });
    }

    if (req.method !== "POST" || url.pathname !== "/v1/messages") {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    let body: any;
    try { body = await req.json(); } catch {
      return Response.json({ error: "bad json" }, { status: 400 });
    }

    const startTime = Date.now();
    const text = (body.messages ?? [])
      .map((m: any) => typeof m.content === "string" ? m.content : "")
      .join(" ");

    // score complexity and route
    const score = scoreComplexity(text);
    const route = TIER_ROUTES[score.tier];

    // build OpenAI-format request
    const messages = (body.messages ?? []).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content
        : Array.isArray(m.content) ? m.content.map((b: any) => b.text ?? "").join("")
        : "",
    }));

    // inject /no_think for Qwen3 models
    if (!messages.some((m: any) => m.role === "system")) {
      messages.unshift({ role: "system", content: "/no_think" });
    } else {
      messages[0].content += " /no_think";
    }

    try {
      const r = await fetch(`http://localhost:${route.port}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: route.model,
          messages,
          max_tokens: Math.min(body.max_tokens ?? 1024, 4096),
          temperature: body.temperature ?? 0.7,
          stream: false,
        }),
      });
      const j = await r.json();
      const msg = j.choices?.[0]?.message ?? {};
      let response = (msg.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim()
        || (msg.reasoning_content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      if (!r.ok || !response) {
        throw new Error(j.error?.message ?? `specialist returned empty`);
      }

      logRouting({
        category: route.category,
        model: route.model,
        duration_ms: Date.now() - startTime,
        prompt: text,
        port: route.port,
        complexity: score.total,
        dimensions: score.dimensions,
      });

      return Response.json({
        id: `msg_${route.category}_${Date.now()}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: response }],
        stop_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0 },
        _routing: {
          tier: score.tier,
          complexity: score.total.toFixed(3),
          category: route.category,
          port: route.port,
          dimensions: Object.fromEntries(
            Object.entries(score.dimensions).map(([k, v]) => [k, v.toFixed(2)])
          ),
        },
      });
    } catch (e: any) {
      return Response.json(
        { type: "error", error: { type: "api_error", message: `router: ${e.message}` } },
        { status: 502 }
      );
    }
  },
});

console.log(`router-shim v2 (complexity-based) on :4000`);
console.log(`  SIMPLE → :8902 (non-thinking 4B)`);
console.log(`  MEDIUM → :8901 (32B coder)`);
console.log(`  COMPLEX → :8903 (Claude-distilled 27B)`);
console.log(`  VERY_COMPLEX → :8903 (Claude-distilled 27B)`);
