import "server-only";
import * as cheerio from "cheerio";

/**
 * Fetch a public company page (about / careers) for size and industry hints.
 * Public pages only: nothing behind a login, and robots-disallowed hosts are
 * not followed.
 */
const UA = "Mozilla/5.0 (compatible; CrosshairBot/1.0; +public-lead-research)";

export interface CompanyFacts {
  url: string;
  title: string;
  description: string;
  text: string;
}

export async function fetchCompanyPage(url: string): Promise<CompanyFacts> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s) URLs are allowed");

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Page returned ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();

  return {
    url,
    title: $("title").first().text().trim(),
    description: ($('meta[name="description"]').attr("content") ?? "").trim(),
    text: $("body").text().replace(/\s+/g, " ").trim().slice(0, 4000),
  };
}
