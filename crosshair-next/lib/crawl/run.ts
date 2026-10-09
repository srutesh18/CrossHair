import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicPost } from "../sources/types";
import { searchReddit } from "../sources/reddit";
import { searchHackerNews } from "../sources/hackernews";
import { searchStackExchange } from "../sources/stackexchange";
import { searchGitHubIssues } from "../sources/github";
import { searchDiscourse } from "../sources/discourse";
import { searchBuyerForum, searchHNSeekingFreelancer, searchRedditBusiness, searchRedditHiring } from "../sources/buyers";
import { buyerForumsFor, matchService, serviceVariants } from "./services";
import { crawlPages } from "../sources/crawler";
import {
  asksToHireUpFront,
  buyerIntent,
  canRefine,
  classify,
  classifyWithTypesafe,
  intentAfterRefine,
  isAnnouncement,
  isHireRequest,
  isJobOrSeller,
  looksEnglish,
  type Category,
} from "./classify";

export const SOURCE_KEYS = ["reddit", "hn", "stackexchange", "github", "forums", "web"] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export const SOURCE_LABEL: Record<SourceKey, string> = {
  reddit: "Reddit",
  hn: "Hacker News",
  stackexchange: "Stack Exchange",
  github: "GitHub Issues",
  forums: "Communities (Discourse)",
  web: "Web crawl (Crawlee)",
};

export interface SourceStat {
  ok: boolean;
  count: number;
  error?: string;
}

export interface CrawlResult {
  runId: string;
  found: number;
  kept: number;
  added: number;
  refined: number;
  sources: Partial<Record<SourceKey, SourceStat>>;
}

/** The Lead Finder looks back further than the 30-day Radar scan. */
const LOOKBACK_DAYS = 365;

/** Sources a crawl uses when none are chosen. GitHub suits dev-tool competitors. */
export const DEFAULT_SOURCES: SourceKey[] = ["reddit", "hn", "stackexchange", "forums"];

/** Below this, a "service" post is usually discussion that mentions hiring. */
const MIN_BUYER_INTENT = 55;

/** Words that turn a service search into a buyer search. */
const BUY_WORDS = ["looking for", "recommend", "hire", "need", "agency"];

/** Words that turn a product search into a complaint search. */
const COMPLAINT_WORDS = ["alternative", "slow", "expensive", "frustrated", "switching from"];

/** How many of the strongest posts per run get a Typesafe category check. */
const REFINE_LIMIT = 30;

async function mapPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next;
      next += 1;
      await fn(items[i] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

export interface CrawlConfig {
  /** What the user sells: the crawler looks for people asking for these. */
  services: string[];
  competitors: string[];
  keywords: string[];
  forumUrls: string[];
  crawlUrls: string[];
}

export interface CrawlOptions {
  query: string;
  sources: SourceKey[];
  perSource: number;
}

export interface SignalDraft {
  source: SourceKey;
  source_name: string;
  source_url: string;
  author: string;
  title: string;
  body: string;
  posted_at: string | null;
  competitor: string;
  service: string;
  category: Category;
  category_confidence: number;
  category_by: "rules" | "typesafe";
  intent: number;
  matched: string[];
}

/** Fetch every chosen source, classify, de-duplicate. No database access. */
export async function collectSignals(
  cfg: CrawlConfig,
  opts: CrawlOptions,
): Promise<{ found: number; rows: SignalDraft[]; refined: number; sources: Partial<Record<SourceKey, SourceStat>> }> {
  const { services, competitors, keywords, forumUrls, crawlUrls } = cfg;
  const userQuery = opts.query.trim();
  if (!userQuery && services.length === 0 && competitors.length === 0 && keywords.length === 0) {
    throw new Error("Tell us what services you sell (or add competitors) first.");
  }
  const quoted = (t: string) => (t.includes(" ") ? `"${t}"` : t);

  // Two kinds of search: people asking for a service you sell, and people
  // unhappy with a competitor. A typed query replaces both.
  const serviceTerms = userQuery ? [] : services.slice(0, 4);
  const competitorTerms = userQuery ? [] : (competitors.length ? competitors : keywords).slice(0, 4);
  const terms = userQuery ? [userQuery] : [...serviceTerms, ...competitorTerms].slice(0, 6);

  const per = opts.perSource;
  const perTerm = Math.max(5, Math.ceil(per / terms.length));
  const perPair = Math.max(5, Math.ceil(per / Math.max(1, competitorTerms.length * 3)) + 2);
  const perReddit = per;

  // Buyer searches use how people phrase a need ("website", "web designer").
  const serviceSearch = [...new Set(serviceTerms.flatMap((t) => serviceVariants(t).slice(0, 3)))].slice(0, 10);
  const hasServices = serviceTerms.length > 0;
  const hasCompetitors = userQuery !== "" || competitorTerms.length > 0;
  const competitorOnly = userQuery ? [userQuery] : competitorTerms;

  const jobs: Array<[SourceKey, () => Promise<PublicPost[]>]> = [];
  for (const key of opts.sources) {
    if (key === "reddit") {
      jobs.push([
        key,
        async () => {
          // Sequential: Reddit rate-limits bursts. Hiring boards first, they are the
          // best leads; if a later search is rate-limited, keep what we already have.
          const searches: Array<() => Promise<PublicPost[]>> = [];
          if (hasServices) {
            searches.push(() => searchRedditHiring(serviceSearch, 50));
            searches.push(() => searchRedditBusiness(serviceSearch, 40));
          }
          if (hasCompetitors) {
            const q = userQuery
              ? userQuery
              : `(${competitorTerms.map((t) => `"${t}"`).join(" OR ")}) (${[...COMPLAINT_WORDS, ...keywords]
                  .slice(0, 8)
                  .map(quoted)
                  .join(" OR ")})`;
            searches.push(() => searchReddit(q, perReddit, "year"));
          }
          const out: PublicPost[] = [];
          let lastError: unknown = null;
          for (const search of searches) {
            try {
              out.push(...(await search()));
            } catch (err) {
              lastError = err;
              break; // Rate-limited: further Reddit calls would fail too.
            }
          }
          if (out.length === 0 && lastError) throw lastError;
          return out;
        },
      ]);
    }
    if (key === "hn") {
      jobs.push([
        key,
        async () => {
          const calls: Array<Promise<PublicPost[]>> = [];
          if (hasServices) {
            for (const t of serviceTerms) {
              for (const v of serviceVariants(t).slice(0, 2)) calls.push(searchHNSeekingFreelancer(v, 15));
            }
          }
          const competitorPairs = userQuery
            ? [userQuery]
            : competitorTerms.flatMap((t) => COMPLAINT_WORDS.slice(0, 3).map((w) => `"${t}" ${w}`));
          for (const p of competitorPairs) calls.push(searchHackerNews(p, perPair, LOOKBACK_DAYS));
          return (await Promise.all(calls)).flat();
        },
      ]);
    }
    // Developer Q&A and issue trackers hold product complaints, not buyers of services.
    if (key === "stackexchange") {
      jobs.push([
        key,
        async () => {
          if (!hasCompetitors) throw new Error("Used for competitor research; add a competitor to search it.");
          return (await Promise.all(competitorOnly.map((t) => searchStackExchange(t, perTerm, LOOKBACK_DAYS)))).flat();
        },
      ]);
    }
    if (key === "github") {
      jobs.push([
        key,
        async () => {
          if (!hasCompetitors) throw new Error("Used for competitor research; add a competitor to search it.");
          return searchGitHubIssues(competitorOnly.map((t) => `"${t}"`).join(" OR "), per);
        },
      ]);
    }
    if (key === "forums") {
      jobs.push([
        key,
        async () => {
          // Built-in buyer communities for your services, plus any forums from Setup.
          const builtIn = hasServices ? buyerForumsFor(serviceTerms) : [];
          if (builtIn.length === 0 && forumUrls.length === 0) {
            throw new Error("No community matches your services yet; add forum URLs in Setup.");
          }
          const lists = await Promise.allSettled([
            ...builtIn.map((b) => searchBuyerForum(b.forum, b.service, 20)),
            ...forumUrls.flatMap((f) => terms.map((t) => searchDiscourse(f, t, perTerm))),
          ]);
          const ok = lists.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
          if (ok.length === 0) {
            const firstErr = lists.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
            if (firstErr) throw firstErr.reason;
          }
          return ok;
        },
      ]);
    }
    if (key === "web") {
      jobs.push([
        key,
        async () => {
          if (crawlUrls.length === 0) throw new Error("No pages to crawl in Setup.");
          return crawlPages({ startUrls: crawlUrls, terms: [...terms, ...serviceSearch, ...keywords], maxPages: 30 });
        },
      ]);
    }
  }

  const settled = await Promise.allSettled(jobs.map(([, job]) => job()));
  const sources: Partial<Record<SourceKey, SourceStat>> = {};
  const tagged: Array<{ source: SourceKey; post: PublicPost }> = [];
  settled.forEach((r, i) => {
    const key = jobs[i]?.[0];
    if (!key) return;
    if (r.status === "fulfilled") {
      sources[key] = { ok: true, count: r.value.length };
      for (const post of r.value) tagged.push({ source: key, post });
    } else {
      sources[key] = { ok: false, count: 0, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    }
  });

  // De-duplicate, classify, and keep only posts that say something relevant.
  const seen = new Set<string>();
  const rows: SignalDraft[] = [];
  for (const { source, post } of tagged) {
    if (!post.sourceUrl || seen.has(post.sourceUrl)) continue;
    seen.add(post.sourceUrl);
    const text = `${post.title ?? ""} ${post.said}`;
    if (!looksEnglish(text) || isJobOrSeller(text)) continue;
    const c = classify(text, competitors, keywords, userQuery ? [userQuery] : [], services);
    // A post on a service's own community (e.g. the n8n forum) is about that service.
    if (!c.service && post.serviceHint) {
      c.service = post.serviceHint;
      c.relevant = true;
      if (!c.matched.includes(post.serviceHint)) c.matched.push(post.serviceHint);
      c.intent = Math.min(100, c.intent + 15);
    }
    // Must name a competitor or search term, and read like a complaint.
    if (!c.relevant || c.category === "other") continue;
    const title = post.title ?? "";
    const titleService = matchService(title, services) || (post.serviceHint && matchService(title, [post.serviceHint]) ? post.serviceHint : "");
    // Service leads (no competitor): someone must be asking to hire or pay,
    // up front, for this service. Discussion and announcements are not leads.
    if (c.service && !c.competitor && !userQuery) {
      if (isAnnouncement(title) || !isHireRequest(text)) continue;
      if (post.serviceHint && !asksToHireUpFront(title, post.said)) continue;
      // On hiring boards the title is the role: it must be your service.
      if (/^\s*\[(hiring|task|paid|hire)\]/i.test(title) && !titleService) continue;
      c.category = "buying";
      c.intent = buyerIntent({ title, body: post.said, titleNamesService: Boolean(titleService), postedAt: post.sourceAt });
      if (c.intent < MIN_BUYER_INTENT) continue;
    }
    rows.push({
      source,
      source_name: post.sourceName,
      source_url: post.sourceUrl,
      author: post.who,
      title: (post.title ?? "").slice(0, 300),
      body: post.said,
      posted_at: post.sourceAt,
      competitor: c.competitor,
      service: c.service,
      category: c.category,
      category_confidence: c.confidence,
      category_by: "rules",
      intent: c.intent,
      matched: c.matched,
    });
  }

  // Refine the strongest posts with Typesafe AI; failures keep the rule result.
  let refined = 0;
  const strongest = [...rows]
    .filter((r) => canRefine(r.category))
    .sort((a, b) => b.intent - a.intent)
    .slice(0, REFINE_LIMIT);
  await mapPool(strongest, 4, async (row) => {
    try {
      const t = await classifyWithTypesafe(`${row.title}. ${row.body}`);
      if (t) {
        row.intent = intentAfterRefine(row.intent, row.category, t.category);
        row.category = t.category;
        row.category_confidence = t.confidence;
        row.category_by = "typesafe";
        refined += 1;
      }
    } catch {
      // Keep the rule-based category.
    }
  });

  // Typesafe was confident this is not a product complaint: drop it.
  const kept = rows.filter(
    (r) => !(r.category_by === "typesafe" && r.category === "other") && !/^\[(dead|flagged)\]/.test(r.title || r.body),
  );
  return { found: tagged.length, rows: kept, refined, sources };
}

export async function runCrawl(
  supabase: SupabaseClient,
  orgId: string,
  opts: CrawlOptions,
): Promise<CrawlResult> {
  const { data: org, error: orgErr } = await supabase
    .from("orgs")
    .select("services, competitors, keywords, forum_urls, crawl_urls")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) throw new Error(orgErr.message);
  const cfg: CrawlConfig = {
    services: (org?.services as string[] | undefined) ?? [],
    competitors: (org?.competitors as string[] | undefined) ?? [],
    keywords: (org?.keywords as string[] | undefined) ?? [],
    forumUrls: (org?.forum_urls as string[] | undefined) ?? [],
    crawlUrls: (org?.crawl_urls as string[] | undefined) ?? [],
  };
  if (!opts.query.trim() && !cfg.services.length && !cfg.competitors.length && !cfg.keywords.length) {
    throw new Error("Tell us what services you sell (or add competitors) first.");
  }

  const { data: run, error: runErr } = await supabase
    .from("crawl_runs")
    .insert({ org_id: orgId, query: opts.query.trim(), sources: opts.sources })
    .select("id")
    .single();
  if (runErr) throw new Error(runErr.message);
  const runId = run.id as string;

  const finish = (patch: Record<string, unknown>) =>
    supabase.from("crawl_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", runId);

  let collected: Awaited<ReturnType<typeof collectSignals>>;
  try {
    collected = await collectSignals(cfg, opts);
  } catch (err) {
    await finish({ status: "failed", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  const { found, rows, refined, sources } = collected;

  let added = 0;
  if (rows.length > 0) {
    const { data: inserted, error } = await supabase
      .from("signals")
      .upsert(
        rows.map((r) => ({ ...r, org_id: orgId, run_id: runId })),
        { onConflict: "org_id,source_url", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      await finish({ status: "failed", error: error.message, stats: sources });
      throw new Error(error.message);
    }
    added = inserted?.length ?? 0;
  }

  const allFailed = Object.values(sources).every((st) => st && !st.ok);
  await finish({
    status: allFailed ? "failed" : "done",
    error: allFailed ? Object.values(sources).map((st) => st?.error).join(" ") : "",
    stats: sources,
    found,
    added,
  });

  return { runId, found, kept: rows.length, added, refined, sources };
}
