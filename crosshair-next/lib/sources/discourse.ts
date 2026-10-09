import "server-only";
import type { PublicPost } from "./types";

/**
 * Discourse community forums (many SaaS products run their community on
 * Discourse). Every public Discourse forum exposes /search.json, no key.
 * Forum URLs come from Setup.
 */
interface DPost {
  id: number;
  username?: string;
  created_at?: string;
  blurb?: string;
  topic_id?: number;
  post_number?: number;
}
interface DTopic {
  id: number;
  title?: string;
  slug?: string;
}

function baseUrl(raw: string): string {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) forums");
  return `${u.protocol}//${u.host}`;
}

export async function searchDiscourse(forumUrl: string, query: string, limit = 15): Promise<PublicPost[]> {
  const base = baseUrl(forumUrl);
  const host = new URL(base).host;
  const url = `${base}/search.json?q=${encodeURIComponent(`${query} order:latest`)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "crosshair-leadgen (public read-only research)" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${host} returned ${res.status} (is it a public Discourse forum?)`);
  const json = (await res.json()) as { posts?: DPost[]; topics?: DTopic[] };
  const topics = new Map((json.topics ?? []).map((t) => [t.id, t]));

  // One row per topic: replies in the same thread are the same lead.
  const firstPerTopic = new Map<number, DPost>();
  for (const p of json.posts ?? []) {
    const key = p.topic_id ?? -p.id;
    const prev = firstPerTopic.get(key);
    if (!prev || (p.post_number ?? 99) < (prev.post_number ?? 99)) firstPerTopic.set(key, p);
  }

  return [...firstPerTopic.values()]
    .slice(0, limit)
    .map((p): PublicPost => {
      const topic = p.topic_id ? topics.get(p.topic_id) : undefined;
      const title = (topic?.title ?? "").trim();
      return {
        who: p.username ? `${p.username} (${host})` : `a ${host} user`,
        title,
        said: `${title}. ${(p.blurb ?? "").replace(/\s+/g, " ").trim()}`.slice(0, 1000),
        sourceName: `Forum ${host}`,
        sourceUrl: topic ? `${base}/t/${topic.slug ?? "topic"}/${topic.id}` : `${base}/p/${p.id}`,
        sourceAt: p.created_at ?? null,
      };
    })
    .filter((p) => p.said.length >= 40);
}
