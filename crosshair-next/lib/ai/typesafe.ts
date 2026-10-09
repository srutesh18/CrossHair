import "server-only";
import type { LeadScores, Rating } from "../types";

/**
 * Typesafe AI SystemOne: a probabilistic classifier, not a text generator.
 * Crosshair uses it as an independent cross-check on the pain / fit / trigger
 * ratings. It can only ever lower a rating, never raise one.
 *
 *   POST {base}/v1/systemone  { model, state, questions: { name: ChoiceQuestion } }
 */
const BASE_URL = process.env.TYPESAFE_AI_BASE_URL || "https://api.typesafe.ai";
const MODEL = process.env.TYPESAFE_AI_MODEL || "jev-latest";
/** Below this confidence the cross-check is recorded but never acts. */
const MIN_CONFIDENCE = 0.75;

const ORDER: Record<Rating, number> = { none: 0, fair: 1, strong: 2 };
const FACETS = ["pain", "fit", "trigger"] as const;
type FacetName = (typeof FACETS)[number];

export interface CrossCheckFacet {
  rating: Rating;
  confidence: number;
}
export type CrossCheck = Record<FacetName, CrossCheckFacet> & { model: string };

export function typesafeEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_AI_API_KEY) && process.env.TYPESAFE_CROSSCHECK !== "false";
}

function isRating(v: unknown): v is Rating {
  return v === "strong" || v === "fair" || v === "none";
}

export async function crossCheckRatings(args: {
  state: string;
  icp: string;
}): Promise<CrossCheck> {
  const apiKey = process.env.TYPESAFE_AI_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_AI_API_KEY is not set");

  const questions = {
    pain: {
      type: "choice",
      instructions: "Is this person clearly unhappy with a competitor's product for a business reason?",
      criteria: {
        strong: "A specific, costly complaint about the competitor",
        fair: "Real unhappiness, but mild or vague",
        none: "No real unhappiness with a competitor",
      },
    },
    fit: {
      type: "choice",
      instructions: `Would this person's company plausibly buy our product? Our ideal customer: ${args.icp || "(not specified)"}`,
      criteria: {
        strong: "Role, company size and industry clearly match the ideal customer",
        fair: "A partial match, or key details are unknown",
        none: "A poor fit for the product",
      },
    },
    trigger: {
      type: "choice",
      instructions: "Does the recent company news show something that just changed (funding, new executive, hiring spike, launch, expansion)?",
      criteria: {
        strong: "A clear, recent buying trigger",
        fair: "A mild signal, or only a plan",
        none: "No news, or nothing relevant",
      },
    },
  };

  const res = await fetch(`${BASE_URL}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, state: args.state, questions }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Typesafe AI returned ${res.status}`);

  const payload = (await res.json()) as {
    model?: string;
    answers?: Record<string, { choice?: unknown; confidence?: unknown }>;
  };
  const out = { model: payload.model ?? MODEL } as CrossCheck;
  for (const facet of FACETS) {
    const a = payload.answers?.[facet];
    if (!a || !isRating(a.choice) || typeof a.confidence !== "number") {
      throw new Error(`Typesafe AI gave no usable answer for ${facet}`);
    }
    out[facet] = { rating: a.choice, confidence: a.confidence };
  }
  return out;
}

/**
 * Merge the cross-check into the model's ratings. A confident, lower rating
 * wins and the reason says so; a higher or unsure one changes nothing.
 */
export function applyCrossCheck(scores: LeadScores, check: CrossCheck): LeadScores {
  const merged: LeadScores = {
    pain: { ...scores.pain },
    fit: { ...scores.fit },
    trigger: { ...scores.trigger },
  };
  for (const facet of FACETS) {
    const c = check[facet];
    const current = merged[facet];
    if (c.confidence >= MIN_CONFIDENCE && ORDER[c.rating] < ORDER[current.rating]) {
      merged[facet] = {
        rating: c.rating,
        reason: `${current.reason} (lowered by cross-check: ${c.rating}, ${Math.round(c.confidence * 100)}%)`.slice(0, 200),
      };
    }
  }
  return merged;
}
