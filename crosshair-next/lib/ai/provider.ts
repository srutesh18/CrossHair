/**
 * The swap point. A provider does exactly one thing: take a system + user
 * prompt and return a JSON object. All schema validation, retries, timeouts
 * and prompt construction live in lib/ai.ts, so swapping providers never
 * touches business logic.
 */
export interface AIProvider {
  readonly name: string;
  /** Must resolve to parsed JSON, or throw. */
  complete(args: {
    system: string;
    user: string;
    signal: AbortSignal;
  }): Promise<unknown>;
}

export class AIError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = "AIError";
  }
}

/** Pull the first JSON object out of a text reply, tolerating fences or prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    // fall through to brace scanning
  }
  const start = candidate.indexOf("{");
  if (start === -1) throw new AIError(`No JSON in reply: ${candidate.slice(0, 200)}`);
  let depth = 0;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1)) as unknown;
        } catch (err) {
          throw new AIError("Unparseable JSON in reply", err);
        }
      }
    }
  }
  throw new AIError(`Unbalanced JSON in reply: ${candidate.slice(0, 200)}`);
}
