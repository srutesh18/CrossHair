import "server-only";

/**
 * Google Programmable Search (Custom Search JSON API).
 *
 * Free, 100 queries a day, and - unlike the Places API - it needs no billing
 * account or card. Two values are required, both free:
 *   GOOGLE_CSE_KEY  an API key with "Custom Search API" enabled
 *   GOOGLE_CSE_CX   the id of a Programmable Search Engine set to search the
 *                   entire web (programmablesearchengine.google.com)
 *
 * A search result is already a website, so unlike Reddit or Hacker News there
 * is no post to mine for a link: the hit itself is the company.
 */
export interface SearchHit {
  title: string;
  snippet: string;
  website: string;
  domain: string;
}

interface CseItem {
  title?: string;
  snippet?: string;
  link?: string;
  displayLink?: string;
}

export function webSearchEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX);
}

/** Sites that are never a prospect: platforms, directories and social. */
const SKIP_HOST =
  /(^|\.)(google|facebook|instagram|twitter|x|linkedin|youtube|pinterest|reddit|wikipedia|yelp|justdial|indiamart|tripadvisor|amazon|flipkart|quora|medium|github|glassdoor|indeed|naukri|sulekha|urbanpro|99acres|magicbricks)\./i;

function normalise(link: string): { website: string; domain: string } | null {
  try {
    const u = new URL(link);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const domain = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!domain.includes(".") || SKIP_HOST.test(`${domain}.`)) return null;
    // The homepage is what gets audited, not the deep link we happened to find.
    return { website: `${u.protocol}//${u.hostname}`, domain };
  } catch {
    return null;
  }
}

/**
 * One page of results (max 10 per request, which is one unit of the daily 100).
 * `start` is 1-based, so page two is start=11.
 */
export async function searchWeb(query: string, start = 1): Promise<SearchHit[]> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) throw new Error("GOOGLE_CSE_KEY and GOOGLE_CSE_CX are not set.");

  const url =
    `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}` +
    `&q=${encodeURIComponent(query)}&num=10&start=${start}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) {
    if (res.status === 429) throw new Error("Google Search daily free limit reached (100/day).");
    if (res.status === 403) throw new Error("Google Search rejected the key: enable the Custom Search API.");
    throw new Error(`Google Search returned ${res.status}.`);
  }

  const json = (await res.json()) as { items?: CseItem[] };
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  for (const item of json.items ?? []) {
    const site = item.link ? normalise(item.link) : null;
    if (!site || seen.has(site.domain)) continue;
    seen.add(site.domain);
    out.push({
      title: (item.title ?? "").trim(),
      snippet: (item.snippet ?? "").replace(/\s+/g, " ").trim(),
      website: site.website,
      domain: site.domain,
    });
  }
  return out;
}

/**
 * Several queries, de-duplicated by domain. Each query costs one unit of the
 * daily 100, so the caller passes a small list rather than looping widely.
 */
export async function searchMany(queries: string[], perQuery = 1): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    for (let page = 0; page < perQuery; page += 1) {
      const hits = await searchWeb(q, page * 10 + 1).catch(() => [] as SearchHit[]);
      for (const h of hits) {
        if (seen.has(h.domain)) continue;
        seen.add(h.domain);
        out.push(h);
      }
      if (hits.length === 0) break;
    }
  }
  return out;
}
