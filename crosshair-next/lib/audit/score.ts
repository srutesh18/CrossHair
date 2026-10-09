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
 * Opportunity score: how much of what's wrong your services fix, plus a bonus
 * when there is a public way to reach them. 0-100.
 */
export function scoreCompany(
  flaws: Flaw[],
  services: string[],
  contactable: boolean,
): { score: number; servicesMatched: string[] } {
  const byService = areasFor(services);
  const covered = new Set([...byService.values()].flat());
  // No service maps to an area: judge on everything rather than nothing.
  const counts = (f: Flaw) => covered.size === 0 || covered.has(f.area);
  const raw = flaws.filter(counts).reduce((sum, f) => sum + WEIGHT[f.severity], 0);
  const servicesMatched = services.filter((s) => (byService.get(s) ?? []).some((a) => flaws.some((f) => f.area === a)));
  const score = Math.min(90, raw) + (contactable ? 10 : 0);
  return { score: Math.max(0, Math.min(100, score)), servicesMatched };
}
