// router-shim — multi-model local LLM router (the specialist swarm).
// Port 4000 (Anthropic API format). Routes to the best specialist per request.
// Architecture: Router (0.6B) → classify → best specialist → respond.
//
// Specialists (all local MLX, all resident):
//   :8901  Qwen3-4B-4bit        (extraction, classification, menial)
//   :8902  Qwen2.5-Coder-7B     (code generation, refactoring, review)
//   :8903  Qwen3-8B-4bit        (reasoning, analysis, general chat)
//
// Remote fallback: z.ai glm-5.3 for tasks needing >32k context or highest quality.

const ROUTER_PORT = 8900;      // parakeet (ultra-fast classifier)
const PORTS = {
  extract: 8901,               // Qwen3-4B
  code: 8902,                  // Qwen2.5-Coder-7B
  reason: 8903,                // Qwen3-8B
};

// Simple keyword-based router (no LLM needed — deterministic, 0ms)
// The router model is for complex cases; this handles the obvious ones.
function routeByHeuristics(messages: any[]): string {
  const text = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ').toLowerCase();

  // Code signals
  if (/\b(function|class|interface|type |const |let |var |import |export |def |public |private |async |await|return|=>|\.ts|\.tsx|\.js|\.py|\.cs|typescript|javascript|python|csharp|refactor|debug|compile|lint|api|endpoint|component|hook|docker|kubernetes)\b/.test(text)) {
    return 'code';
  }

  // Extraction/classification signals
  if (/\b(classify|categorize|extract|label|tag|summarize|parse|format|convert|transform|sort|filter|group)\b/.test(text)) {
    return 'extract';
  }

  // Reasoning signals (default for longer/complex prompts)
  if (text.length > 200 || /\b(explain|analyze|compare|evaluate|design|architect|strategy|why|how|what if|pros and cons|trade-?off)\b/.test(text)) {
    return 'reason';
  }

  // Default: extract (fastest, handles short menial tasks)
  return text.length < 50 ? 'extract' : 'reason';
}

const ROUTING_LOG = `${process.env.HOME}/.claude-insights/swarm-routing.log`;
function logRouting(entry: { category: string; model: string; duration_ms: number; prompt: string; port: number }) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
    prompt: entry.prompt.slice(0, 80),
  });
  try { Bun.appendFileSync(ROUTING_LOG, line + "\n"); } catch {}
}

const server = Bun.serve({
  port: 4000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health/liveliness") {
      return Response.json({ status: "alive" });
    }

    if (req.method !== "POST" || url.pathname !== "/v1/messages") {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    let body: any;
    try { body = await req.json(); } catch {
      return Response.json({ error: "bad json" }, { status: 400 });
    }

    // Route to the best specialist
    const startTime = Date.now();
    const category = routeByHeuristics(body.messages ?? []);
    const port = PORTS[category as keyof typeof PORTS] ?? 8901;
    const model = port === 8901 ? "mlx-community/Qwen2.5-Coder-32B-Instruct-4bit"
                 : port === 8903 ? "mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit"
                 : "mlx-community/Qwen3-4B-Instruct-2507-4bit";
    const promptText = (body.messages ?? [])
      .map((m: any) => typeof m.content === "string" ? m.content : "")
      .join(" ").slice(0, 80);

    // Build OpenAI-format request for the specialist
    const messages = (body.messages ?? []).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content
        : Array.isArray(m.content) ? m.content.map((b: any) => b.text ?? "").join("")
        : "",
    }));

    // Inject /no_think for Qwen3 models (disable thinking overhead)
    if (!messages.some(m => m.role === "system")) {
      messages.unshift({ role: "system", content: "/no_think" });
    } else {
      messages[0].content += " /no_think";
    }

    try {
      const r = await fetch(`http://localhost:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: Math.min(body.max_tokens ?? 1024, 4096),
          temperature: body.temperature ?? 0.7,
          stream: false,
        }),
      });
      const j = await r.json();
      const msg = j.choices?.[0]?.message ?? {};
      let text = (msg.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim()
        || (msg.reasoning_content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      if (!r.ok || !text) {
        throw new Error(j.error?.message ?? `specialist ${category} returned empty`);
      }

      // Log the routing decision
      logRouting({ category, model, duration_ms: Date.now() - startTime, prompt: promptText, port });

      // Return in Anthropic format
      return Response.json({
        id: `msg_local_${category}_${Date.now()}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0 },
        _routing: { category, port, model },
      });
    } catch (e: any) {
      return Response.json(
        { type: "error", error: { type: "api_error", message: `router: ${e.message}` } },
        { status: 502 }
      );
    }
  },
});
console.log("router-shim on :4000 → specialists {extract:8901, code:8902, reason:8903}");
