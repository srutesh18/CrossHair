/**
 * Service vocabulary: how buyers actually phrase a need. "web design" buyers
 * write "need a website" or "looking for a web designer", so matching and
 * searching use these variants, not just the exact service name.
 */
const KNOWN: Array<{ match: RegExp; variants: string[] }> = [
  { match: /web ?(design|site)|website|landing page|wordpress|webflow/i, variants: ["website", "web designer", "web design", "landing page", "wordpress site", "website redesign", "shopify store"] },
  { match: /\bseo\b|search engine/i, variants: ["seo", "search engine optimization", "rank on google", "google ranking", "organic traffic", "seo agency"] },
  { match: /app ?(dev|development|developer)|mobile app|\bios\b|android/i, variants: ["app developer", "mobile app", "build an app", "app development", "ios app", "android app", "mvp"] },
  { match: /automation|\bai\b|chatbot|agent/i, variants: ["ai automation", "automate", "automation", "ai agent", "chatbot", "n8n", "zapier", "workflow automation"] },
  { match: /software|saas|web app|full.?stack/i, variants: ["developer", "web app", "software developer", "full stack developer", "build a saas"] },
  { match: /graphic|logo|brand/i, variants: ["graphic designer", "logo", "branding", "brand identity"] },
  { match: /marketing|ads|ppc|social media/i, variants: ["marketing agency", "google ads", "facebook ads", "social media manager", "marketer"] },
  { match: /video|editing/i, variants: ["video editor", "video editing", "youtube editor"] },
  { match: /copy|content|writ/i, variants: ["copywriter", "content writer", "blog writer"] },
  { match: /bookkeep|accounting|tax/i, variants: ["bookkeeper", "accountant", "bookkeeping"] },
];

/** The service itself plus role nouns derived from it ("design" -> "designer"). */
function derived(service: string): string[] {
  const s = service.trim().toLowerCase();
  const out = [s];
  if (/design$/.test(s)) out.push(`${s}er`);
  if (/\bdev$/.test(s)) out.push(s.replace(/dev$/, "developer"), s.replace(/dev$/, "development"));
  if (/marketing$/.test(s)) out.push(s.replace(/marketing$/, "marketer"));
  if (/development$/.test(s)) out.push(s.replace(/development$/, "developer"));
  return out;
}

export function serviceVariants(service: string): string[] {
  const known = KNOWN.filter((k) => k.match.test(service)).flatMap((k) => k.variants);
  return [...new Set([...derived(service), ...known])];
}

/** Which of the user's services a text asks about (canonical name), or "". */
export function matchService(text: string, services: string[]): string {
  const lower = text.toLowerCase();
  for (const service of services) {
    for (const v of serviceVariants(service)) {
      const re = new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(lower)) return service;
    }
  }
  return "";
}

/**
 * Public Discourse communities where people post that they want to hire an
 * expert, per kind of service. Verified to expose /search.json anonymously.
 */
const BUYER_FORUMS: Array<{ match: RegExp; forums: string[] }> = [
  { match: /automation|\bai\b|agent|chatbot|n8n|zapier|make\.com|workflow/i, forums: ["https://community.n8n.io", "https://community.make.com"] },
  { match: /app|web app|software|saas|no.?code|full.?stack|internal tool|mvp/i, forums: ["https://forum.bubble.io", "https://community.retool.com"] },
];

export function buyerForumsFor(services: string[]): Array<{ forum: string; service: string }> {
  const out: Array<{ forum: string; service: string }> = [];
  for (const service of services) {
    for (const group of BUYER_FORUMS) {
      if (!group.match.test(service)) continue;
      for (const forum of group.forums) {
        if (!out.some((o) => o.forum === forum)) out.push({ forum, service });
      }
    }
  }
  return out;
}
