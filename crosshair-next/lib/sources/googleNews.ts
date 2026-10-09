import "server-only";
import Parser from "rss-parser";

/** Google News RSS: free, public, no key. Used to find the trigger event. */
const parser = new Parser({ timeout: 10_000 });

export interface NewsItem {
  companyName: string;
  headline: string;
  url: string;
  source: string;
  publishedAt: string | null;
  kind: string;
}

/** Classify a headline into a buying trigger, or "" when it is just noise. */
export function classifyTrigger(headline: string): string {
  const h = headline.toLowerCase();
  if (/series [a-e]\b|raises|raised|funding|\$\d|seed round|accelerator/.test(h)) return "Funding";
  if (/names?\s+(a\s+)?new|appoints?|hires?\s+(a\s+)?(new\s+)?(chief|vp|head)|chief \w+ officer|\bcro\b|\bcoo\b|\bcto\b/.test(h))
    return "New executive";
  if (/hiring|job openings|adds \d+ (roles|jobs)|expands team|recruit/.test(h)) return "Hiring spike";
  if (/launch|opens|expands|new office|new warehouse|new store|acquire|partnership|rollout/.test(h))
    return "Expansion";
  return "";
}

export async function searchNews(companyName: string, limit = 5): Promise<NewsItem[]> {
  const q = encodeURIComponent(`"${companyName}"`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;

  const feed = await parser.parseURL(url);
  const items = (feed.items ?? []).slice(0, limit);

  return items.map((item) => {
    const headline = (item.title ?? "").trim();
    return {
      companyName,
      headline,
      url: item.link ?? "",
      source: "Google News",
      publishedAt: item.isoDate ?? null,
      kind: classifyTrigger(headline),
    };
  });
}

/** True when the headline names the company, not just a word it shares. */
function mentions(headline: string, companyName: string): boolean {
  const name = companyName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${name}\\b`, "i").test(headline);
}

/**
 * The most recent real trigger for a company, or null if only noise. Google
 * matches loose words ("Stripe" -> "stripes"), so the headline must name it.
 */
export async function findTrigger(companyName: string): Promise<NewsItem | null> {
  if (!companyName.trim()) return null;
  const items = await searchNews(companyName, 10);
  return items.find((i) => i.kind !== "" && mentions(i.headline, companyName)) ?? null;
}
