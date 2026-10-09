import "server-only";
import { htmlToText, linksIn, type PublicPost } from "./types";

/**
 * Hacker News search via the public Algolia API. Free, no key, read-only.
 * Searches stories and comments from the last `days` days (default 30).
 */
interface Hit {
  objectID: string;
  author?: string;
  created_at?: string;
  title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  story_title?: string | null;
  url?: string | null;
}

/**
 * Algolia matches words, not phrases, unless advancedSyntax is on and the
 * phrase is quoted ("Power BI" otherwise matches "power" and "bi" anywhere).
 */
function toAlgoliaQuery(query: string): string {
  const plain = query.replace(/\bOR\b/g, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (plain.includes('"')) return plain;
  return plain.includes(" ") ? `"${plain}"` : plain;
}

export async function searchHackerNews(query: string, limit = 15, days = 30): Promise<PublicPost[]> {
  const since = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  const url =
    "https://hn.algolia.com/api/v1/search_by_date" +
    `?query=${encodeURIComponent(toAlgoliaQuery(query))}` +
    `&advancedSyntax=true&tags=(story,comment)&numericFilters=created_at_i>${since}&hitsPerPage=${Math.min(limit, 50)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Hacker News search returned ${res.status}`);
  const json = (await res.json()) as { hits?: Hit[] };

  const posts: PublicPost[] = [];
  for (const hit of json.hits ?? []) {
    const text = htmlToText(hit.comment_text ?? hit.story_text ?? "");
    const title = (hit.title ?? "").trim();
    const said = (text.length > title.length ? text : title).trim();
    if (said.length < 40 || /^\[(dead|flagged)\]$/.test(said)) continue;
    posts.push({
      who: hit.author ? `HN user ${hit.author}` : "an HN user",
      title: title || (hit.story_title ?? "").trim(),
      said: said.slice(0, 1000),
      sourceName: "Hacker News",
      sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      sourceAt: hit.created_at ?? null,
      links: [...(hit.url ? [hit.url] : []), ...linksIn(hit.story_text ?? hit.comment_text ?? "")],
    });
  }
  return posts;
}

/** Recent "Show HN" launches: founders sharing their product's website. */
export async function recentLaunches(limit = 60, days = 30): Promise<PublicPost[]> {
  const since = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  const url =
    "https://hn.algolia.com/api/v1/search_by_date" +
    `?tags=show_hn&numericFilters=created_at_i>${since}&hitsPerPage=${Math.min(limit, 100)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Hacker News returned ${res.status}`);
  const json = (await res.json()) as { hits?: Hit[] };
  return (json.hits ?? [])
    .filter((h) => h.url)
    .map((h) => ({
      who: h.author ? `HN user ${h.author}` : "an HN user",
      title: (h.title ?? "").replace(/^show hn:\s*/i, ""),
      said: htmlToText(h.story_text ?? h.title ?? ""),
      sourceName: "Hacker News · Show HN",
      sourceUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
      sourceAt: h.created_at ?? null,
      links: [h.url as string],
    }));
}
