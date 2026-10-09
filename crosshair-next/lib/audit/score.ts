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

/**
 * Trigger bonus: funding (budget) or a new executive (a new decision-maker)
 * makes now the moment to reach out; fresher news counts more.
 */
function triggerBonus(trigger: { kind: string; at: string | null } | null): number {
  if (!trigger?.kind) return 0;
  const days = trigger.at ? (Date.now() - new Date(trigger.at).getTime()) / 86_400_000 : 30;
  const base = trigger.kind === "Funding" || trigger.kind === "New executive" ? 15 : 10;
  return days <= 30 ? base : days <= 90 ? Math.round(base / 2) : 0;
}

/**
 * Opportunity score: how much of what's wrong your services fix (pain), plus
 * a bonus for recent news (trigger) and for a public way to reach them. 0-100.
 */
export function scoreCompany(
  flaws: Flaw[],
  services: string[],
  contactable: boolean,
  trigger: { kind: string; at: string | null } | null = null,
): { score: number; servicesMatched: string[] } {
  const byService = areasFor(services);
  const covered = new Set([...byService.values()].flat());
  // No service maps to an area: judge on everything rather than nothing.
  const counts = (f: Flaw) => covered.size === 0 || covered.has(f.area);
  const raw = flaws.filter(counts).reduce((sum, f) => sum + WEIGHT[f.severity], 0);
  const servicesMatched = services.filter((s) => (byService.get(s) ?? []).some((a) => flaws.some((f) => f.area === a)));
  const score = Math.min(75, raw) + triggerBonus(trigger) + (contactable ? 10 : 0);
  return { score: Math.max(0, Math.min(100, score)), servicesMatched };
}
