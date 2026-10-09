import "server-only";
import Parser from "rss-parser";
import { normaliseWebsite } from "../audit/url";

/**
 * Company news that makes now the right time to reach out: funding (budget),
 * a new executive (a new decision-maker), a hiring push, an expansion.
 * Startup news feeds + Google News searches, all public RSS.
 */
const UA = "Mozilla/5.0 (compatible; CrosshairBot/1.0; public news research)";
const parser = new Parser({ timeout: 12_000, headers: { "User-Agent": UA } });

const FEEDS: Array<{ url: string; name: string }> = [
  { url: "https://techcrunch.com/tag/funding/feed/", name: "TechCrunch" },
  { url: "https://tech.eu/feed/", name: "tech.eu" },
  { url: "https://betakit.com/feed/", name: "BetaKit" },
  { url: "https://inc42.com/feed/", name: "Inc42" },
  { url: "https://www.prnewswire.com/rss/news-releases-list.rss", name: "PR Newswire" },
];

/** Google News searches for each kind of trigger (links are Google redirects; the headline is what we need). */
const GOOGLE_QUERIES = [
  '"raises" "seed round"',
  '"series A" "raises"',
  '"appoints" "chief marketing officer"',
  '"names new CEO" startup',
  '"hires" "chief technology officer"',
  '"opens new office"',
];

export type TriggerKind = "Funding" | "New executive" | "Hiring" | "Expansion";

export interface CompanyTrigger {
  company: string;
  kind: TriggerKind;
  headline: string;
  url: string;
  source: string;
  publishedAt: string | null;
}

const VERBS: Array<[RegExp, TriggerKind]> = [
  [/\s(raises|raised|secures|closes|lands|bags|nabs|picks up|scores|snags|gets|receives)\s+(\$|€|£|₹|rs\.?|inr|usd|eur|a\s|an\s|seed|series|pre-seed|funding|investment|\d)/i, "Funding"],
  [/\s(appoints|names|hires|taps|ropes in|onboards|elevates|promotes|welcomes|brings on|adds)\s+.*\b(ceo|cmo|cto|coo|cfo|cro|cpo|chief|president|vp|vice president|head of|director|managing director|md)\b/i, "New executive"],
  [/\s(to hire|plans to hire|is hiring|hiring spree|will hire|adds \d+ (jobs|roles)|to add \d+ jobs)\b/i, "Hiring"],
  [/\s(opens|expands|enters|launches in|expands to|expands into|opens new)\b/i, "Expansion"],
];

const DESCRIPTOR = /^(ai|a|an|the|startup|start-up|fintech|edtech|healthtech|insurtech|proptech|agritech|climate|climatetech|deeptech|saas|b2b|d2c|dtc|unicorn|soonicorn|platform|company|firm|maker|developer|provider|brand|app|chip|software|marketplace|robotics|biotech|quantum|logistics|mobility|travel|food|delivery|payments?|crypto|web3|cybersecurity|security|data|analytics|infrastructure|energy|battery|ev|electric|solar|defence|defense|space|gaming|media|retail|ecommerce|e-commerce|consumer|enterprise|legal|legaltech|hr|hrtech|martech|adtech|medtech|wealthtech|regtech|spacetech|fashion|beauty)$/i;
const NATIONALITY = /^(american|us|u\.s\.|uk|british|english|scottish|irish|french|german|spanish|italian|dutch|belgian|swiss|austrian|swedish|danish|norwegian|finnish|estonian|latvian|lithuanian|polish|czech|portuguese|greek|turkish|israeli|indian|bengaluru-based|chinese|japanese|korean|singaporean|singapore|australian|canadian|brazilian|mexican|nigerian|kenyan|egyptian|saudi|emirati|uae|european|african|asian|latam|nordic|berlin|london|paris|toronto|vancouver|montreal|calgary|bengaluru|mumbai|delhi|gurugram)$/i;

/**
 * "AI chip maker SambaNova raises $1B" -> SambaNova. Keeps the trailing run of
 * name-like words before the verb, dropping descriptors and nationalities.
 */
export function parseHeadline(headline: string): { company: string; kind: TriggerKind } | null {
  // Google News appends " - Publisher".
  const h = headline.replace(/\s+[-–|]\s+[^-–|]{2,40}$/, "").trim();
  for (const [re, kind] of VERBS) {
    const m = re.exec(` ${h}`);
    if (!m || m.index === undefined) continue;
    const before = ` ${h}`.slice(0, m.index).trim();
    if (!before) continue;
    const words = before.replace(/[’']s$/, "").split(/\s+/);
    const name: string[] = [];
    for (let i = words.length - 1; i >= 0 && name.length < 4; i -= 1) {
      const w = (words[i] ?? "").replace(/[,:;"“”‘’]/g, "");
      if (!w) continue;
      if (/-(backed|based|led|owned|headquartered)$/i.test(w)) break;
      if (DESCRIPTOR.test(w) && name.length > 0) break;
      if (NATIONALITY.test(w)) break;
      if (!/^[A-Z0-9]/.test(w)) break; // lowercase word: the name ended
      name.unshift(w);
    }
    // Drop leading descriptors in Title Case headlines ("Fintech Startup Jar").
    while (name.length > 1 && DESCRIPTOR.test(name[0] ?? "")) name.shift();
    const company = name.join(" ").trim();
    if (company.length < 2 || company.length > 40) return null;
    if (/^(the|this|that|it|he|she|they|startup|company|report|study|government|ministry|police|court|state|city)$/i.test(company)) return null;
    return { company, kind };
  }
  return null;
}

async function feedTriggers(): Promise<CompanyTrigger[]> {
  const since = Date.now() - 30 * 86_400_000;
  const lists = await Promise.allSettled([
    ...FEEDS.map(async (f) => {
      const feed = await parser.parseURL(f.url);
      return (feed.items ?? []).map((it) => ({ title: it.title ?? "", link: it.link ?? "", date: it.isoDate ?? null, source: f.name }));
    }),
    ...GOOGLE_QUERIES.map(async (q) => {
      const feed = await parser.parseURL(
        `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:30d`)}&hl=en-US&gl=US&ceid=US:en`,
      );
      return (feed.items ?? []).slice(0, 25).map((it) => ({
        title: it.title ?? "",
        link: it.link ?? "",
        date: it.isoDate ?? null,
        source: (it.title ?? "").split(" - ").pop()?.trim() || "Google News",
      }));
    }),
  ]);

  const out: CompanyTrigger[] = [];
  const seen = new Set<string>();
  for (const r of lists) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      if (item.date && new Date(item.date).getTime() < since) continue;
      // Investors closing a fund are not prospects.
      if (/\bfund (i|ii|iii|iv|v|vi|\d)\b|\bnew fund\b|venture (capital )?fund|\bvc firm\b/i.test(item.title)) continue;
      const parsed = parseHeadline(item.title);
      if (!parsed) continue;
      const key = parsed.company.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        company: parsed.company,
        kind: parsed.kind,
        headline: item.title.replace(/\s+-\s+[^-]{2,40}$/, "").trim(),
        url: item.link,
        source: item.source,
        publishedAt: item.date,
      });
    }
  }
  return out;
}

// ------------------------------------------------- finding the website

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every meaningful word of the name appears in the site's title / brand. */
function siteMatches(html: string, company: string): boolean {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const site = /property=["']og:site_name["'][^>]*content=["']([^"']+)/i.exec(html)?.[1] ?? "";
  const haystack = compact(`${title} ${site}`);
  if (!haystack) return false;
  const words = company.split(/\s+/).map(compact).filter((w) => w.length >= 2 && !/^(ai|inc|ltd|llc|the|co|group|labs?|hq)$/.test(w));
  if (words.length === 0) return haystack.includes(compact(company));
  return words.every((w) => haystack.includes(w));
}

async function fetchHtml(url: string): Promise<{ finalUrl: string; html: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(7_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 300_000);
    return { finalUrl: res.url || url, html };
  } catch {
    return null;
  }
}

async function wikidataWebsite(company: string): Promise<string | null> {
  try {
    const search = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=2&search=${encodeURIComponent(company)}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6_000), cache: "no-store" },
    );
    if (!search.ok) return null;
    const ids = ((await search.json()) as { search?: Array<{ id: string }> }).search?.map((e) => e.id) ?? [];
    for (const id of ids) {
      const claims = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P856&entity=${id}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6_000), cache: "no-store" },
      );
      if (!claims.ok) continue;
      const json = (await claims.json()) as { claims?: { P856?: Array<{ mainsnak?: { datavalue?: { value?: string } } }> } };
      const v = json.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
      if (v) return v;
    }
  } catch {
    // fall through
  }
  return null;
}

const STOP = new Set("raises raised secures closes lands bags million billion seed round series funding funds fund led round pre-seed scale expand expands accelerate launches launch with from into their about after over this that will for and the its new plans help helps more than first global growth startup company platform".split(" "));

/** Topic words from the headline ("AI", "financial advisors"), minus the name and funding jargon. */
function topicWords(headline: string, company: string): string[] {
  const name = new Set(company.toLowerCase().split(/\s+/));
  return [...new Set(
    headline
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w) && !name.has(w) && !/^\d/.test(w)),
  )];
}

/**
 * One-word names are often ordinary words ("Today", "Bloom"): the site must
 * also talk about what the headline is about, or it is someone else.
 */
function contextMatches(html: string, headline: string, company: string): boolean {
  if (company.trim().split(/\s+/).length > 1) return true;
  const words = topicWords(headline, company);
  if (words.length === 0) return true;
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").toLowerCase();
  const hits = words.filter((w) => text.includes(w)).length;
  return hits >= Math.min(2, words.length);
}

/**
 * Find a company's website from its name: try likely domains and accept one
 * only when the site itself names the company (and, for one-word names, talks
 * about what the headline is about); Wikidata as a checked fallback.
 */
export async function resolveWebsite(company: string, headline = ""): Promise<{ website: string; domain: string } | null> {
  const slug = compact(company);
  const first = compact(company.split(/\s+/)[0] ?? company);
  if (slug.length < 3) return null;
  const candidates = [...new Set([
    `${slug}.com`, `${slug}.ai`, `${slug}.io`, `${slug}.co`, `get${slug}.com`, `${slug}app.com`,
    `${slug}hq.com`, `try${slug}.com`, `${slug}.in`, `${slug}.co.uk`, `${slug}.de`, `${slug}.eu`,
    ...(first !== slug ? [`${first}.com`, `${first}.ai`] : []),
  ])];

  // A few at a time: fast without hammering anyone.
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4);
    const pages = await Promise.all(batch.map((d) => fetchHtml(`https://${d}`)));
    for (const page of pages) {
      if (page && siteMatches(page.html, company) && contextMatches(page.html, headline, company)) {
        const norm = normaliseWebsite(page.finalUrl);
        if (norm) return norm;
      }
    }
  }

  const wiki = await wikidataWebsite(company);
  if (wiki) {
    const page = await fetchHtml(wiki);
    if (page && siteMatches(page.html, company) && contextMatches(page.html, headline, company)) {
      return normaliseWebsite(page.finalUrl);
    }
  }
  return null;
}

export interface ResolvedTrigger extends CompanyTrigger {
  website: string;
  domain: string;
}

/** News triggers whose company website could be verified. */
export async function newsCompanies(max = 40): Promise<{ triggers: number; companies: ResolvedTrigger[] }> {
  const triggers = await feedTriggers();
  // Take turns between kinds (newest first within each), so one scan shows
  // funding, new leaders, hiring and expansion rather than only funding.
  const byKind = new Map<TriggerKind, CompanyTrigger[]>();
  for (const t of triggers.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))) {
    byKind.set(t.kind, [...(byKind.get(t.kind) ?? []), t]);
  }
  const kinds: TriggerKind[] = ["Funding", "New executive", "Hiring", "Expansion"];
  const picked: CompanyTrigger[] = [];
  for (let i = 0; picked.length < max * 2 && kinds.some((k) => (byKind.get(k)?.length ?? 0) > i); i += 1) {
    for (const k of kinds) {
      const t = byKind.get(k)?.[i];
      if (t) picked.push(t);
    }
  }
  const resolved: ResolvedTrigger[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (next < picked.length && resolved.length < max) {
        const t = picked[next];
        next += 1;
        if (!t) continue;
        const site = await resolveWebsite(t.company, t.headline);
        if (site && !resolved.some((r) => r.domain === site.domain)) resolved.push({ ...t, ...site });
      }
    }),
  );
  return { triggers: triggers.length, companies: resolved };
}
