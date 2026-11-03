import type { Area, Flaw, Severity } from "./checks";

const AREA_MATCH: Array<[Area, RegExp]> = [
  ["design", /web|site|design|wordpress|webflow|shopify|ux|ui\b|landing|front.?end|redesign/i],
  ["seo", /seo|search|marketing|ads|content|growth|google/i],
  ["automation", /automation|\bai\b|chatbot|agent|crm|workflow|n8n|zapier|make\.com|integration/i],
  ["app", /\bapp|mobile|software|saas|portal|platform|full.?stack|develop/i],
];

/** Which audit areas each of the user's services covers. */
export function areasFor(services: string[]): Map<string, Area[]> {
  const map = new Map<string, Area[]>();
  for (const s of services) map.set(s, AREA_MATCH.filter(([, re]) => re.test(s)).map(([a]) => a));
  return map;
}

const WEIGHT: Record<Severity, number> = { high: 25, medium: 12, low: 5 };

/** How we can reach them. Phone outranks email: a WhatsApp message is read. */
export type Reach = "phone" | "email" | "form" | "none";

export function reachOf(c: { phone?: string; emails?: string[]; contactPage?: string; hasForm?: boolean }): Reach {
  if (c.phone?.trim()) return "phone";
  if ((c.emails ?? []).length > 0) return "email";
  if (c.hasForm || c.contactPage?.trim()) return "form";
  return "none";
}

/**
 * Reachability multiplier, not a bonus.
 *
 * A business we cannot contact is worth nothing however broken its site is, so
 * an unreachable company must never outrank a reachable one. A flat bonus let
 * that happen: a wrecked site with no phone still scored near the top and
 * clogged the list with leads nobody could act on.
 */
const REACH_FACTOR: Record<Reach, number> = { phone: 1, email: 0.9, form: 0.65, none: 0.25 };

export interface TriggerInput {
  kind: string;
  at: string | null;
}

/** New reviews since the last audit, and how long that took. */
export interface ReviewVelocity {
  current: number | null;
  previous: number | null;
  since: string | null;
}

/**
 * Trigger bonus. Funding or a new executive means budget and a new
 * decision-maker. For a local business none of that reaches the news, so a
 * burst of new Google reviews stands in: it shows the place is trading and
 * paying attention to how it looks online.
 */
function triggerBonus(trigger: TriggerInput | null, reviews: ReviewVelocity | null): number {
  let bonus = 0;
  if (trigger?.kind) {
    const days = trigger.at ? (Date.now() - new Date(trigger.at).getTime()) / 86_400_000 : 30;
    const base = trigger.kind === "Funding" || trigger.kind === "New executive" ? 15 : 10;
    bonus = days <= 30 ? base : days <= 90 ? Math.round(base / 2) : 0;
  }

  if (reviews?.current != null && reviews.previous != null && reviews.since) {
    const gained = reviews.current - reviews.previous;
    const days = Math.max(1, (Date.now() - new Date(reviews.since).getTime()) / 86_400_000);
    const perMonth = (gained / days) * 30;
    // Only a real run of reviews counts; one or two is noise.
    const reviewBonus = perMonth >= 8 ? 12 : perMonth >= 3 ? 7 : 0;
    bonus = Math.max(bonus, reviewBonus);
  }
  return bonus;
}

export interface ScoreInput {
  flaws: Flaw[];
  services: string[];
  reach: Reach;
  trigger?: TriggerInput | null;
  reviews?: ReviewVelocity | null;
}

/**
 * Opportunity score, 0-100: how much of what is wrong your services actually
 * fix, timed by a trigger, then scaled by whether you can reach them at all.
 */
export function scoreCompany(input: ScoreInput): { score: number; servicesMatched: string[] } {
  const { flaws, services, reach } = input;
  const byService = areasFor(services);
  const covered = new Set([...byService.values()].flat());
  // No service maps to an area: judge on everything rather than nothing.
  const counts = (f: Flaw) => covered.size === 0 || covered.has(f.area);

  const raw = flaws.filter(counts).reduce((sum, f) => sum + WEIGHT[f.severity], 0);
  const servicesMatched = services.filter((s) =>
    (byService.get(s) ?? []).some((a) => flaws.some((f) => f.area === a)),
  );

  const base = Math.min(80, raw) + triggerBonus(input.trigger ?? null, input.reviews ?? null);
  const score = Math.round(base * REACH_FACTOR[reach]);
  return { score: Math.max(0, Math.min(100, score)), servicesMatched };
}
