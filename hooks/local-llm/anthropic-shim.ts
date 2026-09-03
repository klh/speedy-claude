#!/usr/bin/env bun
// ~/.claude/local-llm/anthropic-shim.ts — minimal Anthropic↔OpenAI shim for
// LOCAL models (replaces the litellm experimental bridge, which hard-routes
// through the OpenAI Responses API). Translates POST /v1/messages to the
// MLX server's /v1/chat/completions. ~90 lines, no framework, no deps.
//   bun anthropic-shim.ts            # serves :4000, backend :8901
const PORT = Number(process.env.SHIM_PORT ?? 4000);
const BACKEND = process.env.MLX_BASE ?? "http://localhost:8901";

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && (url.pathname === "/health/liveliness" || url.pathname === "/v1/models")) {
      const r = await fetch(`${BACKEND}/v1/models`).then((r) => r.json()).catch(() => ({ data: [] }));
      return Response.json(r.data ? { data: r.data } : { status: "alive" });
    }
    if (req.method !== "POST" || url.pathname !== "/v1/messages")
      return Response.json({ error: "not found" }, { status: 404 });

    let body: any;
    try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }

    const messages = (body.messages ?? []).map((m: any) => {
      const content = typeof m.content === "string" ? m.content
        : Array.isArray(m.content) ? m.content.map((b: any) => b.text ?? "").join("")
        : "";
      return { role: m.role === "assistant" ? "assistant" : "user", content };
    });

    let text = "";
    let stop = "";
    try {
      const r = await fetch(`${BACKEND}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: body.model?.replace(/\[1m\]$/, "") === "glm-5.2" || body.model?.startsWith("glm-")
            ? Bun.env.MLX_MODEL ?? "mlx-community/Qwen3-4B-4bit"
            : body.model,
          messages,
          max_tokens: Math.min(body.max_tokens ?? 1024, 4096),
          temperature: body.temperature ?? 0.7,
          stream: false,
          chat_template_kwargs: { enable_thinking: false },
        }),
      });
      const j: any = await r.json();
      const msg = j.choices?.[0]?.message ?? {};
      text = (msg.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim()
        || (msg.reasoning_content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      stop = j.choices?.[0]?.finish_reason === "length" ? "max_tokens" : "end_turn";
      if (!r.ok || !text) throw new Error(j.error?.message ?? `backend ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    } catch (e: any) {
      return Response.json(
        { type: "error", error: { type: "api_error", message: `shim: ${e.message}` } },
        { status: 502 }
      );
    }

    // Anthropic response shape (what claude -p consumes)
    return Response.json({
      id: `msg_local_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "text", text }],
      stop_reason: stop,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  },
});
console.log(`anthropic-shim on :${PORT} → ${BACKEND}`);
