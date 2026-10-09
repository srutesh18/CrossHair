import "server-only";
import { AIError, extractJson, type AIProvider } from "./provider";

/**
 * Groq adapter (OpenAI-compatible chat completions, JSON mode).
 *
 * The key is read from the server environment only and is never logged or
 * returned. This is the swap point: another chat provider only needs a new
 * file with the same AIProvider shape.
 */
const BASE_URL = "https://api.groq.com/openai/v1";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

type ReasoningEffort = "low" | "medium" | "high";
function reasoningEffort(): ReasoningEffort | undefined {
  const v = process.env.GROQ_REASONING_EFFORT;
  if (v === "low" || v === "medium" || v === "high") return v;
  // Only the gpt-oss family accepts reasoning_effort levels.
  return MODEL.startsWith("openai/gpt-oss") ? "medium" : undefined;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  error?: { message?: string };
}

export function createGroqProvider(): AIProvider {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AIError("GROQ_API_KEY is not set. Add it to .env.local (server-side only).");
  }
  const effort = reasoningEffort();

  return {
    name: `groq:${MODEL}`,
    async complete({ system, user, signal }) {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          response_format: { type: "json_object" },
          max_completion_tokens: 8192,
          ...(effort ? { reasoning_effort: effort } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal,
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        throw new AIError("GROQ_API_KEY was rejected by Groq. Create a new key at console.groq.com.");
      }
      if (res.status === 429) {
        throw new AIError("Groq rate limit reached. Try again shortly.");
      }
      if (!res.ok) {
        // The body can echo request details; keep only the status.
        throw new AIError(`Groq returned ${res.status}`);
      }

      const payload = (await res.json()) as ChatCompletion;
      const choice = payload.choices?.[0];
      if (choice?.finish_reason === "length") {
        throw new AIError("Groq reply was cut off before it finished.");
      }
      const text = choice?.message?.content;
      if (!text) throw new AIError("Groq returned no text.");
      return extractJson(text);
    },
  };
}
