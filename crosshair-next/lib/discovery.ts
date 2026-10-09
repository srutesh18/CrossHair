import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchReddit } from "./sources/reddit";
import { recentLaunches, searchHackerNews } from "./sources/hackernews";
import { newsCompanies } from "./sources/companyNews";
import type { PublicPost } from "./sources/types";
import { addCompanies, type NewCompany } from "./companies";
import { nameFromDomain, normaliseWebsite } from "./audit/url";

/**
 * Automatic company discovery. Business owners constantly share their own
 * website in public ("roast my website", "feedback on my store", "Show HN:
 * we launched X"). Each of those is a company with a site to audit and an
 * owner who asked for opinions. No manual lists, no logins, public data only.
 */

export const DISCOVERY_SOURCES = ["reddit", "hn", "forums", "news"] as const;
export type DiscoverySource = (typeof DISCOVERY_SOURCES)[number];

export const DISCOVERY_LABEL: Record<DiscoverySource, string> = {
  reddit: "Reddit",
  hn: "Hacker News",
  forums: "Communities",
  news: "Company news",
};

const BUSINESS_SUBS = [
  "smallbusiness", "Entrepreneur", "startups", "SaaS", "sideproject", "ecommerce", "shopify",
  "web_design", "website", "SEO", "marketing", "EntrepreneurRideAlong", "indiehackers", "nocode",
  "roastmystartup", "AlphaandBetausers", "IMadeThis",
];
const OWNER_PHRASES = ['"my website"', '"my site"', '"my store"', '"my business"', "roast", "feedback", '"i built"', "launched"];

/** Sites that are platforms, not someone's business. */
const PLATFORM = /(^|\.)(reddit\.com|redd\.it|imgur\.com|youtube\.com|youtu\.be|google\.[a-z.]+|goo\.gl|twitter\.com|x\.com|t\.co|instagram\.com|facebook\.com|fb\.me|linkedin\.com|lnkd\.in|github\.com|gitlab\.com|github\.io|medium\.com|wikipedia\.org|amazon\.[a-z.]+|amzn\.to|apple\.com|microsoft\.com|tiktok\.com|discord\.(gg|com)|t\.me|wa\.me|whatsapp\.com|bit\.ly|tinyurl\.com|ycombinator\.com|producthunt\.com|archive\.org|stackoverflow\.com|npmjs\.com|pypi\.org|loom\.com|vimeo\.com|dropbox\.com|notion\.so|substack\.com|gumroad\.com|chatgpt\.com|openai\.com|claude\.ai|anthropic\.com|imgbb\.com|postimg\.cc|i\.ibb\.co|figma\.com|canva\.com|wix\.com|squarespace\.com|shopify\.com|wordpress\.com|wordpress\.org|w3\.org|forms\.gle|typeform\.com|calendly\.com|stripe\.com|paypal\.com|patreon\.com|ko-fi\.com|buymeacoffee\.com|n8n\.io|make\.com|bubble\.io|retool\.com|webflow\.com|framer\.com|vercel\.com|netlify\.com|socket\.io|nodejs\.org|react\.dev|reactjs\.org|python\.org|docker\.com|aws\.amazon\.com|cloudflare\.com|supabase\.com|firebase\.google\.com|mozilla\.org|developer\.mozilla\.org|npm\.im|huggingface\.co|arxiv\.org|steampowered\.com|itch\.io|chrome\.google\.com|chromewebstore\.google\.com|play\.google\.com)$/i;
const FILE = /\.(png|jpe?g|gif|webp|svg|pdf|mp4|mov|zip|csv|xlsx?)(\?|$)/i;

/** The poster's own website: the first link that isn't a platform or a file. */
export function ownerWebsite(post: PublicPost): { website: string; domain: string } | null {
  const text = `${post.title ?? ""} ${post.said}`.toLowerCase();
  const candidates: Array<{ website: string; domain: string }> = [];
  for (const link of post.links ?? []) {
    if (FILE.test(link)) continue;
    const norm = normaliseWebsite(link);
    if (!norm || PLATFORM.test(norm.domain)) continue;
    if (!candidates.some((c) => c.domain === norm.domain)) candidates.push(norm);
  }
  // A domain the post talks about ("I built waybill.supply") beats a random link.
  const named = candidates.find((c) => text.includes(c.domain.split(".")[0] ?? c.domain));
  return named ?? candidates[0] ?? null;
}

/** Discourse forums where members post their own sites and businesses. */
const FORUMS = ["https://forum.bubble.io", "https://community.n8n.io", "https://community.make.com"];

async function forumPosts(): Promise<PublicPost[]> {
  const out: PublicPost[] = [];
  for (const base of FORUMS) {
    for (const q of ['"my website"', '"my site"']) {
      try {
        const res = await fetch(`${base}/search.json?q=${encodeURIComponent(`${q} in:first order:latest`)}`, {
          headers: { Accept: "application/json", "User-Agent": "crosshair-leadgen (public read-only research)" },
          signal: AbortSignal.timeout(12_000),
          cache: "no-store",
        });
        if (!res.ok) continue; // a busy forum is skipped, not fatal
        const json = (await res.json()) as {
          posts?: Array<{ id: number; username?: string; created_at?: string; blurb?: string; topic_id?: number }>;
          topics?: Array<{ id: number; title?: string; slug?: string }>;
        };
        const topics = new Map((json.topics ?? []).map((t) => [t.id, t]));
        for (const p of json.posts ?? []) {
          const topic = p.topic_id ? topics.get(p.topic_id) : undefined;
          const blurb = p.blurb ?? "";
          // Blurbs are plain text; pick out written domains like "almarande.com".
          const links = [...blurb.matchAll(/\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,12})(?:\/[^\s]*)?/gi)].map((m) => m[0]);
          out.push({
            who: p.username ? `${p.username} (${new URL(base).host})` : new URL(base).host,
            title: topic?.title ?? "",
            said: blurb,
            sourceName: `Forum ${new URL(base).host}`,
            sourceUrl: topic ? `${base}/t/${topic.slug ?? "topic"}/${topic.id}` : `${base}/p/${p.id}`,
            sourceAt: p.created_at ?? null,
            links,
          });
        }
      } catch {
        // skip this forum/query
      }
      await new Promise((r) => setTimeout(r, 1_200));
    }
  }
  return out;
}

/** Real businesses (they have customers and pay for services) rank first. */
const BUSINESS = /\b(my (business|company|store|shop|agency|clinic|restaurant|salon|practice|firm)|our (business|company|store|shop|clients|customers)|customers|clients|small business|e-?commerce|shopify store|service business|local business|booking|appointments|revenue|sales|b2b|agency|startup|saas|subscribers|pricing)\b/i;
const HOBBY = /\b(game|games|open[- ]source|library|chrome extension|browser extension|hackathon|side project|for fun|weekend project|emulator|mod\b|homework|school project|portfolio)\b/i;

function businessScore(c: NewCompany): number {
  const text = c.found_title ?? "";
  // Companies in the news with a trigger are the best prospects of all.
  if (c.trigger_kind) return 5;
  return (BUSINESS.test(text) ? 2 : 0) - (HOBBY.test(text) ? 2 : 0) + (c.source === "forum" ? 1 : 0);
}

export interface SourceStat {
  ok: boolean;
  posts: number;
  sites: number;
  error?: string;
}

export interface DiscoveryResult {
  found: number;
  added: number;
  sources: Partial<Record<DiscoverySource, SourceStat>>;
}

/** Find companies from public posts. Pure: fetches and extracts, no database. */
export async function discoverCompanies(
  sources: DiscoverySource[] = [...DISCOVERY_SOURCES],
  maxCompanies = 60,
): Promise<{ companies: NewCompany[]; sources: Partial<Record<DiscoverySource, SourceStat>> }> {
  const jobs: Array<[DiscoverySource, () => Promise<PublicPost[]>]> = [];
  if (sources.includes("reddit")) {
    jobs.push(["reddit", () => searchReddit(`(${OWNER_PHRASES.join(" OR ")})`, 100, "month", BUSINESS_SUBS)]);
  }
  if (sources.includes("hn")) {
    jobs.push([
      "hn",
      async () => [
        ...(await recentLaunches(80, 30)),
        ...(await searchHackerNews('"feedback on my" website', 20, 90).catch(() => [])),
      ],
    ]);
  }
  if (sources.includes("forums")) jobs.push(["forums", forumPosts]);

  const stats: Partial<Record<DiscoverySource, SourceStat>> = {};
  const companies: NewCompany[] = [];
  const seen = new Set<string>();

  // News is different: the headline is the trigger, the website is resolved.
  const newsJob = sources.includes("news")
    ? newsCompanies(30)
        .then((r) => {
          for (const t of r.companies) {
            if (seen.has(t.domain)) continue;
            seen.add(t.domain);
            companies.push({
              name: t.company,
              website: t.website,
              domain: t.domain,
              source: "news",
              found_url: t.url,
              found_title: `${t.headline} (${t.source})`,
              found_author: t.source,
              found_at: t.publishedAt,
              trigger_kind: t.kind,
              trigger_headline: t.headline,
              trigger_url: t.url,
              trigger_at: t.publishedAt,
            });
          }
          stats.news = { ok: true, posts: r.triggers, sites: r.companies.length };
        })
        .catch((err: unknown) => {
          stats.news = { ok: false, posts: 0, sites: 0, error: err instanceof Error ? err.message : String(err) };
        })
    : Promise.resolve();

  const [settled] = await Promise.all([Promise.allSettled(jobs.map(([, job]) => job())), newsJob]);

  settled.forEach((r, i) => {
    const key = jobs[i]?.[0];
    if (!key) return;
    if (r.status === "rejected") {
      stats[key] = { ok: false, posts: 0, sites: 0, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
      return;
    }
    let sites = 0;
    for (const post of r.value) {
      const site = ownerWebsite(post);
      if (!site || seen.has(site.domain)) continue;
      seen.add(site.domain);
      sites += 1;
      companies.push({
        name: nameFromDomain(site.domain),
        website: site.website,
        domain: site.domain,
        source: key === "forums" ? "forum" : key,
        found_url: post.sourceUrl,
        found_title: [post.title, post.said].filter(Boolean).join(" — ").slice(0, 300),
        found_author: post.who,
        found_at: post.sourceAt,
      });
    }
    stats[key] = { ok: true, posts: r.value.length, sites };
  });

  // Businesses first, then the newest posts.
  companies.sort(
    (a, b) => businessScore(b) - businessScore(a) || (b.found_at ?? "").localeCompare(a.found_at ?? ""),
  );
  return { companies: companies.slice(0, maxCompanies + (stats.news?.sites ?? 0)), sources: stats };
}

/** Run a discovery scan for the workspace and record it. */
export async function runDiscovery(
  supabase: SupabaseClient,
  orgId: string,
  sources: DiscoverySource[] = [...DISCOVERY_SOURCES],
): Promise<DiscoveryResult> {
  const { data: run } = await supabase
    .from("crawl_runs")
    .insert({ org_id: orgId, query: "auto-discovery", sources })
    .select("id")
    .single();

  const { companies, sources: stats } = await discoverCompanies(sources);
  const added = await addCompanies(supabase, orgId, companies);
  const allFailed = Object.values(stats).every((s) => s && !s.ok);

  if (run?.id) {
    await supabase
      .from("crawl_runs")
      .update({
        status: allFailed ? "failed" : "done",
        error: allFailed ? Object.values(stats).map((s) => s?.error).join(" ") : "",
        stats,
        found: companies.length,
        added,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
  }
  if (allFailed) throw new Error(Object.values(stats).map((s) => s?.error).filter(Boolean).join(" "));
  return { found: companies.length, added, sources: stats };
}
