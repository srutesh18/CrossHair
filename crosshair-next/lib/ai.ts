import "server-only";
import { z } from "zod";
import { AIError, type AIProvider } from "./ai/provider";
import { createGroqProvider } from "./ai/provider.groq";
import { applyCrossCheck, crossCheckRatings, typesafeEnabled, type CrossCheck } from "./ai/typesafe";
import { decideTier } from "./tier";
import type { Tier } from "./types";
import {
  AnalyzeInput,
  AnalyzeOutput,
  DraftInput,
  DraftOutput,
  RefineInput,
  RefineOutput,
  ScoreInput,
  ScoreOutput,
} from "./ai/schemas";

/** Per-attempt ceiling. Reasoning models need far more than a few seconds. */
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 60_000;

let cached: AIProvider | null = null;
function provider(): AIProvider {
  if (!cached) cached = createGroqProvider();
  return cached;
}

export function modelName(): string {
  return `groq:${process.env.GROQ_MODEL || "openai/gpt-oss-120b"}`;
}

/** One attempt with a hard timeout. */
async function attempt(system: string, user: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await provider().complete({ system, user, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the model, validate with Zod, retry once on failure.
 *
 * There is deliberately no sample-data fallback: the app shows a real error
 * rather than presenting invented leads or scores as if they were real.
 */
async function call<S extends z.ZodTypeAny>(
  schema: S,
  system: string,
  user: string,
): Promise<z.infer<S>> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i += 1) {
    try {
      const raw = await attempt(system, user);
      const parsed = schema.safeParse(raw);
      if (parsed.success) return parsed.data;
      lastErr = new AIError(`Response failed validation: ${parsed.error.message}`);
    } catch (err) {
      lastErr = err;
      // A missing or rejected key will not fix itself on retry.
      if (err instanceof Error && /API_KEY/.test(err.message)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new AIError("AI call failed");
}

const JSON_RULE =
  "Reply with ONLY one JSON object. No prose, no markdown fences. Never invent facts.";

// ---------------------------------------------------------------- analyze
export async function analyzeComplaint(raw: unknown): Promise<AnalyzeOutput> {
  const input = AnalyzeInput.parse(raw);
  const system = `You extract structured facts from a public complaint about a software product. ${JSON_RULE}`;
  const user = [
    `Lead details (may be partial): ${input.who || "(not given)"}`,
    `Public complaint: ${input.said}`,
    input.sourceName ? `Source: ${input.sourceName}` : "",
    "",
    "Extract these fields. Use an empty string when the text does not say.",
    "Do not guess a company or a person's name that is not present.",
    'JSON shape: {"name":"","role":"","company":"","competitor":"","size":"","industry":"","painType":""}',
    "competitor = the product they are unhappy with. painType = 2-4 words naming the problem.",
  ]
    .filter(Boolean)
    .join("\n");
  return call(AnalyzeOutput, system, user);
}

// ------------------------------------------------------------------ score
export interface ScoredLead {
  scores: ScoreOutput;
  tier: Tier;
  /** Typesafe AI's independent ratings, when the cross-check ran. */
  crossCheck: CrossCheck | null;
}

export async function scoreLead(raw: unknown): Promise<ScoredLead> {
  const input = ScoreInput.parse(raw);
  const system = [
    "You are the judging step of Crosshair, which decides whether a salesperson should email someone.",
    input.icp ? `Our product and ideal customer: ${input.icp}` : "",
    "Be strict and honest. A weak signal is 'fair', not 'strong'.",
    JSON_RULE,
  ]
    .filter(Boolean)
    .join("\n");
  const facts = [
    `Person: ${input.name}, ${input.role} at ${input.company}`,
    `Company size: ${input.size || "(unknown)"} | Industry: ${input.industry || "(unknown)"}`,
    `Unhappy with: ${input.competitor || "(unknown)"}`,
    `What they said publicly: ${input.said}`,
    `Recent company news: ${input.news || "(none found)"}`,
  ].join("\n");
  const user = [
    facts,
    "",
    "Rate exactly three things as strong, fair or none, each with a reason of at most 14 words:",
    "- pain: clearly unhappy with a competitor for a business reason? strong = specific and costly; fair = real but mild or vague; none = no real unhappiness.",
    "- fit: would they buy our product, judged by role, company size and industry?",
    "- trigger: does the news show something that recently changed (funding, new executive, hiring spike, launch, expansion)? strong = clear recent event; fair = mild signal or only a plan; none = no news or nothing relevant.",
    "Do NOT output a tier or a recommendation. Only the three ratings.",
    'JSON shape: {"pain":{"rating":"strong","reason":""},"fit":{"rating":"strong","reason":""},"trigger":{"rating":"strong","reason":""}}',
  ].join("\n");

  const rated = await call(ScoreOutput, system, user);

  // Independent cross-check. It can only lower a rating; if it is unavailable
  // the model's ratings stand, since a missing second opinion is not a reason
  // to invent one.
  let crossCheck: CrossCheck | null = null;
  let scores = rated;
  if (typesafeEnabled()) {
    try {
      crossCheck = await crossCheckRatings({ state: facts, icp: input.icp });
      scores = applyCrossCheck(rated, crossCheck);
    } catch (err) {
      console.warn("[crosshair] Typesafe cross-check skipped:", err instanceof Error ? err.message : err);
    }
  }
  return { scores, tier: decideTier(scores), crossCheck };
}

// ------------------------------------------------------------------ draft
export async function draftEmails(raw: unknown): Promise<DraftOutput> {
  const input = DraftInput.parse(raw);
  if (input.tier === "HOLD") {
    // Belt and braces: the caller already checks, but never draft for Hold.
    throw new AIError("Refusing to draft an email for a HOLD lead");
  }
  const docsBlock = input.docs.map((d) => `### ${d.title}\n${d.content}`).join("\n\n");
  const system = [
    `You write short, honest sales emails for ${input.productName}. Draft mode only: a human reviews every email before it goes anywhere.`,
    "You may only reference features that appear in the provided product docs. Never invent numbers, customers, case studies or features.",
    JSON_RULE,
  ].join("\n");
  const user = [
    `Person: ${input.name}, ${input.role} at ${input.company}`,
    `What they said publicly: ${input.said}`,
    `Recent company news: ${input.news || "(none)"}`,
    "",
    `Product docs (pick the ONE feature that best answers their complaint):\n${docsBlock}`,
    "",
    "Write three emails:",
    "- day0: opener, under 90 words. Name their complaint and the news naturally. End with a soft question.",
    "- day3: proof, under 60 words. Offer a short walkthrough of the same feature.",
    "- day7: close, under 50 words. Polite, leaves the door open, no pressure.",
    input.tier === "WARM"
      ? "This lead is WARM: keep every email extra soft and low pressure, with no hard ask."
      : "",
    input.unsubscribeLine ? `End each body with this exact line: ${input.unsubscribeLine}` : "",
    `Sign off as '${input.sender}, ${input.productName}'.`,
    'JSON shape: {"feature":"","day0":{"subject":"","body":""},"day3":{"subject":"","body":""},"day7":{"subject":"","body":""}}',
  ]
    .filter(Boolean)
    .join("\n");
  return call(DraftOutput, system, user);
}

// ----------------------------------------------------------------- refine
export interface RefinedDecision {
  scores: ScoreOutput;
  tier: Tier;
  changed: boolean;
  note: string;
  flaggedClaims: string[];
}

/** Second pass: confirm or correct the ratings, and flag unsupported claims. */
export async function refineDecision(raw: unknown): Promise<RefinedDecision> {
  const input = RefineInput.parse(raw);
  const docsBlock = input.docs.map((d) => `### ${d.title}\n${d.content}`).join("\n\n");
  const system = [
    "You are a reviewer checking another model's work on a sales-lead decision.",
    "Be sceptical. Downgrade ratings that are not supported by the evidence.",
    JSON_RULE,
  ].join("\n");
  const user = [
    `Public complaint: ${input.said}`,
    `Recent company news: ${input.news || "(none)"}`,
    `First-pass ratings: ${JSON.stringify(input.scores)}`,
    `First-pass tier: ${input.proposedTier}`,
    input.drafts.length
      ? `Drafted emails:\n${input.drafts.map((d) => `Day ${d.day}: ${d.subject}\n${d.body}`).join("\n\n")}`
      : "",
    docsBlock ? `Product docs that may be cited:\n${docsBlock}` : "",
    "",
    "Do two things:",
    "1) Confirm or correct each of the three ratings, keeping a one-line reason. Do not output a tier.",
    "2) List any claim in the drafted emails that is not supported by the product docs or the complaint (invented numbers, customers, features, or promises). Empty list if all claims are supported.",
    'JSON shape: {"scores":{"pain":{"rating":"strong","reason":""},"fit":{"rating":"strong","reason":""},"trigger":{"rating":"strong","reason":""}},"changed":false,"note":"","flaggedClaims":[]}',
  ]
    .filter(Boolean)
    .join("\n");

  const out = await call(RefineOutput, system, user);
  // The tier is always recomputed from the final ratings, never taken from the model.
  return {
    scores: out.scores,
    tier: decideTier(out.scores),
    changed: out.changed,
    note: out.note,
    flaggedClaims: out.flaggedClaims,
  };
}
