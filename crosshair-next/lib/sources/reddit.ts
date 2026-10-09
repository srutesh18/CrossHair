import "server-only";
import Parser from "rss-parser";
import { htmlToText, linksIn, type PublicPost } from "./types";

/**
 * Reddit public search. With REDDIT_CLIENT_ID/SECRET it uses the official API
 * (app-only OAuth, ~100 requests a minute). Without them it reads the public
 * RSS feed, which allows only about one search a minute from one network.
 * Reddit's API rules ask for a descriptive User-Agent, so we send one.
 */
const UA = "web:crosshair-leadgen:1.0 (public read-only complaint research)";

const parser = new Parser({ timeout: 10_000, headers: { "User-Agent": UA } });

/** Remove Reddit's "submitted by /u/x [link] [comments]" footer. */
function cleanBody(html: string): string {
  return htmlToText(html.replace(/submitted by[\s\S]*$/i, "")).replace(/\[link\]|\[comments\]/g, "").trim();
}

/** Reddit allows only a few unauthenticated requests a minute: space them out. */
let lastRequest = 0;
const MIN_GAP_MS = 2_000;

async function fetchFeed(url: string): Promise<Awaited<ReturnType<typeof parser.parseURL>>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    try {
      return await parser.parseURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // One patient retry on a rate limit, then give up with a clear message.
      if (/429/.test(msg) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 8_000));
        continue;
      }
      if (/429/.test(msg)) throw new Error("Reddit is rate-limiting this network. Try again in a minute.");
      if (/403/.test(msg)) throw new Error("Reddit refused the request (403) from this network.");
      throw new Error(`Reddit search failed: ${msg}`);
    }
  }
  throw new Error("Reddit search failed");
}

// ---------- Official API (optional, much higher rate limit) ----------
// A free "script" app at reddit.com/prefs/apps gives REDDIT_CLIENT_ID and
// REDDIT_CLIENT_SECRET. App-only OAuth reads public posts only.

let token: { value: string; expires: number } | null = null;

async function appToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Reddit app login failed (${res.status}). Check REDDIT_CLIENT_ID / SECRET.`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Reddit app login returned no token.");
  token = { value: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return token.value;
}

interface ApiChild {
  kind?: string;
  data?: {
    author?: string;
    subreddit?: string;
    title?: string;
    selftext?: string;
    permalink?: string;
    created_utc?: number;
    over_18?: boolean;
    url?: string;
    selftext_html?: string | null;
  };
}

async function searchViaApi(
  bearer: string,
  query: string,
  limit: number,
  window: "month" | "year",
  subreddits: string[],
): Promise<PublicPost[]> {
  const path = subreddits.length ? `/r/${subreddits.join("+")}/search` : "/search";
  const url =
    `https://oauth.reddit.com${path}?q=${encodeURIComponent(query)}${subreddits.length ? "&restrict_sr=1" : ""}` +
    `&sort=${window === "year" ? "relevance" : "new"}&t=${window}&limit=${Math.min(limit, 100)}&type=link&raw_json=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}`, "User-Agent": UA },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (res.status === 429) throw new Error("Reddit API rate limit reached. Try again in a minute.");
  if (!res.ok) throw new Error(`Reddit API returned ${res.status}`);
  const json = (await res.json()) as { data?: { children?: ApiChild[] } };
  const posts: PublicPost[] = [];
  for (const child of json.data?.children ?? []) {
    const d = child.data;
    if (!d || d.over_18 || !d.permalink) continue;
    const title = (d.title ?? "").trim();
    const body = (d.selftext ?? "").replace(/\s+/g, " ").trim();
    const said = (body ? `${title}. ${body}` : title).trim();
    if (said.length < 40) continue;
    posts.push({
      who: d.author ? `u/${d.author}` : "a Reddit user",
      title,
      said: said.slice(0, 1000),
      sourceName: d.subreddit ? `Reddit r/${d.subreddit}` : "Reddit",
      sourceUrl: `https://www.reddit.com${d.permalink}`,
      sourceAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
      links: [...(d.url && !d.url.includes("reddit.com") ? [d.url] : []), ...linksIn(d.selftext_html ?? ""), ...linksIn(d.selftext ?? "")],
    });
  }
  return posts;
}

export function redditMode(): "api" | "rss" {
  return process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET ? "api" : "rss";
}

export async function searchReddit(
  query: string,
  limit = 15,
  window: "month" | "year" = "month",
  subreddits: string[] = [],
): Promise<PublicPost[]> {
  const bearer = await appToken();
  if (bearer) return searchViaApi(bearer, query, limit, window, subreddits);

  const base = subreddits.length
    ? `https://www.reddit.com/r/${subreddits.join("+")}/search.rss`
    : "https://www.reddit.com/search.rss";
  const url =
    `${base}?q=${encodeURIComponent(query)}${subreddits.length ? "&restrict_sr=1" : ""}` +
    `&sort=${window === "year" ? "relevance" : "new"}&t=${window}&limit=${Math.min(limit, 50)}`;

  const feed = await fetchFeed(url);

  const posts: PublicPost[] = [];
  for (const item of feed.items ?? []) {
    // Search results also list matching subreddits; keep actual posts only.
    if (!/\/comments\//.test(item.link ?? "")) continue;
    const title = (item.title ?? "").trim();
    const body = cleanBody(item.content ?? "");
    const said = (body.length > title.length ? `${title}. ${body}` : title).replace(/\s+/g, " ").trim();
    if (said.length < 40) continue; // skip one-liners with no signal
    const link = item.link ?? "";
    const subreddit = /\/r\/([^/]+)/.exec(link)?.[1] ?? "";
    const author = ((item as { author?: string }).author ?? "").replace(/^\/?u\//, "");
    posts.push({
      who: author ? `u/${author}` : "a Reddit user",
      title,
      said: said.slice(0, 1000),
      sourceName: subreddit ? `Reddit r/${subreddit}` : "Reddit",
      sourceUrl: link,
      sourceAt: item.isoDate ?? null,
      links: linksIn(item.content ?? ""),
    });
  }
  return posts;
}
