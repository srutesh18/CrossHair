import type { LeadScores, Rating, Tier } from "./types";

/**
 * The tier rule lives here, never in a prompt. The model only supplies the
 * three ratings; this function decides the tier from them.
 *
 * None is checked first because "one Fair + one None" satisfies both the WARM
 * and the HOLD wording, and a None must always win.
 *
 *   any None            -> HOLD
 *   exactly one Fair    -> WARM
 *   two or more Fair    -> HOLD
 *   all three Strong    -> HOT
 */
export function decideTier(scores: LeadScores): Tier {
  const ratings: Rating[] = [scores.pain.rating, scores.fit.rating, scores.trigger.rating];
  if (ratings.includes("none")) return "HOLD";
  const fairs = ratings.filter((r) => r === "fair").length;
  if (fairs === 0) return "HOT";
  if (fairs === 1) return "WARM";
  return "HOLD";
}

/** Hold leads never get an email drafted, and can never be sent. */
export function canDraft(tier: Tier): boolean {
  return tier === "HOT" || tier === "WARM";
}

export const TIER_LABEL: Record<Tier, string> = {
  HOT: "Hot",
  WARM: "Warm",
  HOLD: "Hold",
};

export const RATING_LABEL: Record<Rating, string> = {
  strong: "Strong",
  fair: "Fair",
  none: "None",
};
