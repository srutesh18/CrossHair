import "server-only";
import { htmlToText, type PublicPost } from "./types";

/**
 * Stack Exchange public API: questions across several sites, no key needed
 * (300 requests/day per IP). Software Recommendations is where people ask
 * for alternatives, so it is searched alongside Stack Overflow.
 */
const SITES = ["stackoverflow", "softwarerecs", "webapps", "superuser"] as const;

interface Item {
  question_id: number;
  title?: string;
  body?: string;
  link?: string;
  creation_date?: number;
  owner?: { display_name?: string };
}

export async function searchStackExchange(query: string, limit = 15, days = 90): Promise<PublicPost[]> {
  const since = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  const perSite = Math.max(3, Math.ceil(limit / SITES.length));
  const lists = await Promise.all(
    SITES.map(async (site) => {
      const url =
        "https://api.stackexchange.com/2.3/search/advanced" +
        `?order=desc&sort=creation&q=${encodeURIComponent(query)}&site=${site}` +
        `&fromdate=${since}&pagesize=${perSite}&filter=withbody`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
      if (!res.ok) throw new Error(`Stack Exchange (${site}) returned ${res.status}`);
      const json = (await res.json()) as { items?: Item[] };
      return (json.items ?? []).map((q): PublicPost => {
        const title = htmlToText(q.title ?? "");
        const body = htmlToText(q.body ?? "");
        return {
          who: q.owner?.display_name ? `${q.owner.display_name} (Stack Exchange)` : "a Stack Exchange user",
          title,
          said: `${title}. ${body}`.slice(0, 1000),
          sourceName: `Stack Exchange ${site}`,
          sourceUrl: q.link ?? `https://${site}.com/q/${q.question_id}`,
          sourceAt: q.creation_date ? new Date(q.creation_date * 1000).toISOString() : null,
        };
      });
    }),
  );
  return lists.flat().filter((p) => p.said.length >= 40);
}
