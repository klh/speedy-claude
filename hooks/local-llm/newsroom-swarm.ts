// newsroom-swarm — tag-routing LLM client for the ai-newsroom project.
// Maps each pipeline stage (cluster/research/verify/script) to the best
// local specialist in the MLX swarm. Drop into src/agents/llm.ts.
//
// Usage in newsroom:
//   NEWSROOM_LLM=swarm pnpm newsroom
//
// Or import directly:
//   import { createSwarmLlm } from "./agents/newsroom-swarm";
//   const llm = createSwarmLlm();

import OpenAI from "openai";
import { z } from "zod";
import type { LlmClient, LlmTag, LlmUsage } from "./llm";
import { extractJson } from "./llm";

const JSON_INSTRUCTION =
  "\n\nRespond with ONE valid JSON object only. No markdown fences, no commentary, no trailing text.";

// Tag → specialist mapping (verified against running swarm 2026-09-04)
const SWARM_ROUTES: Record<LlmTag, { port: number; model: string; rationale: string }> = {
  cluster: {
    port: 8902, model: "mlx-community/Qwen3-4B-Instruct-2507-4bit",
    rationale: "non-thinking 4B — fast classification, ~100 TPS",
  },
  research: {
    port: 8902, model: "mlx-community/Qwen3-4B-Instruct-2507-4bit",
    rationale: "4B handles structured research output; use 8903 for deep analysis",
  },
  verify: {
    port: 8902, model: "mlx-community/Qwen3-4B-Instruct-2507-4bit",
    rationale: "fast claim↔source classification — non-thinking is ideal",
  },
  script: {
    port: 8902, model: "mlx-community/Qwen3-4B-Instruct-2507-4bit",
    rationale: "Danish generation; upgrade to Qwen3.5-9B (:8906) for highest quality",
  },
};

export function createSwarmLlm(): LlmClient {
  const clients = new Map<string, OpenAI>();
  const usage: LlmUsage = { requests: 0, retries: 0 };

  function getClient(tag: LlmTag): OpenAI {
    if (!clients.has(tag)) {
      const route = SWARM_ROUTES[tag];
      clients.set(tag, new OpenAI({
        baseURL: `http://localhost:${route.port}/v1`,
        apiKey: "local",
      }));
    }
    return clients.get(tag)!;
  }

  return {
    provider: "swarm",
    async completeJson<T>({ tag, system, user, schema, maxRetries = 2 }) {
      const route = SWARM_ROUTES[tag];
      const client = getClient(tag);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        usage.requests++;
        try {
          const response = await client.chat.completions.create({
            model: route.model,
            temperature: 0.1,
            messages: [
              { role: "system", content: system + JSON_INSTRUCTION + " /no_think" },
              { role: "user", content: user },
            ],
          });
          const text = response.choices[0]?.message?.content ?? "";
          const parsed = extractJson(text);
          return schema.parse(parsed);
        } catch (err) {
          if (attempt === maxRetries) {
            throw new Error(
              `swarm LLM call '${tag}' (→ :${route.port} ${route.rationale}) failed after ${maxRetries + 1} attempts: ${err}`,
            );
          }
          usage.retries++;
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        }
      }
      throw new Error("unreachable");
    },
    usage: () => ({ ...usage }),
  };
}
