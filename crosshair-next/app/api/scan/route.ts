import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { searchReddit } from "@/lib/sources/reddit";
import { searchHackerNews } from "@/lib/sources/hackernews";
import type { PublicPost } from "@/lib/sources/types";
import { analyzeComplaint } from "@/lib/ai";
import { qualifyNewLead } from "@/lib/pipeline";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  query: z.string().max(300).default(""),
  limit: z.number().int().min(1).max(15).default(6),
  sources: z.array(z.enum(["reddit", "hn"])).min(1).default(["reddit", "hn"]),
});

type SourceKey = "reddit" | "hn";
interface SourceStatus {
  ok: boolean;
  count: number;
  error?: string;
}

/** Alternate posts from each source so one source cannot crowd out another. */
function interleave(lists: PublicPost[][]): PublicPost[] {
  const out: PublicPost[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i += 1) {
    for (const list of lists) {
      const item = list[i];
      if (item) out.push(item);
    }
  }
  return out;
}

/** Posts are processed a few at a time: fast, but gentle on rate limits. */
const CONCURRENCY = 3;

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

type Outcome =
  | { kind: "created"; lead: { id: string; name: string; company: string; tier: string } }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string };

/**
 * Scan real public posts (Reddit + Hacker News), then for each one look up a real trigger from
 * Google News and score it. Nothing is invented: if a source fails, the scan
 * reports the failure rather than substituting sample data.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const { data: org } = await supabase
      .from("orgs")
      .select("icp, competitors, keywords")
      .eq("id", orgId)
      .maybeSingle();

    const icp = (org?.icp as string | undefined) ?? "";
    const competitors = (org?.competitors as string[] | undefined) ?? [];
    const keywords = (org?.keywords as string[] | undefined) ?? [];
    const query =
      parsed.data.query.trim() ||
      [
        competitors.length ? `(${competitors.map((c) => `"${c}"`).join(" OR ")})` : "",
        keywords.length ? `(${keywords.map((k) => `"${k}"`).join(" OR ")})` : "",
      ]
        .filter(Boolean)
        .join(" ") ||
      '"too slow" OR "bad support" OR "broken import"';

    // Hacker News matches every word, so it gets one plain search per term
    // instead of the OR query Reddit understands.
    const userQuery = parsed.data.query.trim();
    const hnTerms = userQuery
      ? [userQuery]
      : (competitors.length ? competitors : keywords.length ? keywords : ["too slow"]).slice(0, 3);

    const want = parsed.data.sources;
    const fetchCount = Math.min(parsed.data.limit * 3, 50);
    const runs: Array<[SourceKey, Promise<PublicPost[]>]> = [];
    if (want.includes("reddit")) runs.push(["reddit", searchReddit(query, fetchCount)]);
    if (want.includes("hn")) {
      runs.push([
        "hn",
        Promise.all(hnTerms.map((t) => searchHackerNews(t, Math.ceil(fetchCount / hnTerms.length)))).then(
          (lists) => lists.flat(),
        ),
      ]);
    }
    const settled = await Promise.allSettled(runs.map(([, p]) => p));
    const sources: Partial<Record<SourceKey, SourceStatus>> = {};
    const lists: PublicPost[][] = [];
    settled.forEach((r, i) => {
      const key = runs[i]?.[0];
      if (!key) return;
      if (r.status === "fulfilled") {
        sources[key] = { ok: true, count: r.value.length };
        lists.push(r.value);
      } else {
        sources[key] = {
          ok: false,
          count: 0,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        };
      }
    });
    if (lists.length === 0) {
      throw new Error(
        Object.values(sources)
          .map((st) => st?.error)
          .filter(Boolean)
          .join(" "),
      );
    }

    // De-duplicate by URL across sources.
    const byUrl = new Map<string, PublicPost>();
    for (const p of interleave(lists)) if (p.sourceUrl && !byUrl.has(p.sourceUrl)) byUrl.set(p.sourceUrl, p);
    const posts = [...byUrl.values()];
    if (posts.length === 0) {
      return NextResponse.json({
        query,
        sources,
        scanned: 0,
        created: 0,
        skipped: 0,
        failed: 0,
        leads: [],
        note: "No public posts matched.",
      });
    }

    // Drop posts already captured, in one query.
    const urls = posts.map((p) => p.sourceUrl).filter(Boolean);
    const { data: existing } = await supabase.from("leads").select("source_url").in("source_url", urls);
    const seen = new Set((existing ?? []).map((r) => r.source_url as string));
    const fresh = posts.filter((p) => !seen.has(p.sourceUrl));
    const batch = fresh.slice(0, parsed.data.limit);

    const outcomes = await mapPool<PublicPost, Outcome>(batch, CONCURRENCY, async (post) => {
      try {
        const facts = await analyzeComplaint({
          said: post.said,
          who: post.who,
          sourceName: post.sourceName,
          sourceUrl: post.sourceUrl,
        });
        // No identifiable company means we cannot check a trigger or fit honestly.
        if (!facts.company) return { kind: "skipped", reason: "no company named" };
        const lead = await qualifyNewLead(supabase, orgId, {
          facts,
          fallbackName: post.who,
          said: post.said,
          sourceName: post.sourceName,
          sourceUrl: post.sourceUrl,
          sourceAt: post.sourceAt,
          icp,
        });
        return {
          kind: "created",
          lead: { id: lead.id, name: lead.name, company: lead.company, tier: lead.tier },
        };
      } catch (err) {
        return { kind: "failed", reason: err instanceof Error ? err.message : "failed" };
      }
    });

    const created = outcomes.flatMap((o) => (o.kind === "created" ? [o.lead] : []));
    const failures = outcomes.flatMap((o) => (o.kind === "failed" ? [o.reason] : []));
    // If every post failed for the same reason (e.g. a bad AI key), surface it.
    if (created.length === 0 && failures.length > 0 && failures.length === batch.length) {
      throw new Error(failures[0]);
    }

    return NextResponse.json({
      query,
      sources,
      scanned: posts.length,
      created: created.length,
      skipped: seen.size + outcomes.filter((o) => o.kind === "skipped").length,
      failed: failures.length,
      leads: created,
      note: failures.length ? `${failures.length} post(s) failed: ${failures[0]}` : undefined,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
