import "server-only";
import type { PublicPost } from "./types";

/**
 * GitHub issue search: public issues that mention a product. Unauthenticated
 * search allows 10 requests a minute, so each run makes one call per term.
 */
interface Issue {
  html_url: string;
  title?: string;
  body?: string | null;
  created_at?: string;
  user?: { login?: string };
  repository_url?: string;
  pull_request?: unknown;
}

export async function searchGitHubIssues(query: string, limit = 15): Promise<PublicPost[]> {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const q = `${query} in:title,body is:issue created:>${since}`;
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=${Math.min(limit, 50)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "crosshair-leadgen (public read-only research)",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (res.status === 403 || res.status === 429) {
    throw new Error("GitHub search rate limit reached. Try again in a minute.");
  }
  if (!res.ok) throw new Error(`GitHub search returned ${res.status}`);
  const json = (await res.json()) as { items?: Issue[] };

  return (json.items ?? [])
    .filter((i) => !i.pull_request)
    .map((i): PublicPost => {
      const repo = i.repository_url?.split("/repos/")[1] ?? "";
      const title = (i.title ?? "").trim();
      const body = (i.body ?? "").replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
      return {
        who: i.user?.login ? `GitHub user ${i.user.login}` : "a GitHub user",
        title,
        said: `${title}. ${body}`.slice(0, 1000),
        sourceName: repo ? `GitHub ${repo}` : "GitHub",
        sourceUrl: i.html_url,
        sourceAt: i.created_at ?? null,
      };
    })
    .filter((p) => p.said.length >= 40);
}
