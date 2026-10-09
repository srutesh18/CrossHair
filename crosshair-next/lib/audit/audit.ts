import "server-only";
import * as cheerio from "cheerio";
import { CheerioCrawler, Configuration, log, LogLevel } from "@crawlee/cheerio";
import { checkHomepage, siteDownFlaw, type Flaw, type PageFacts } from "./checks";
import { contactLinks, emptyContacts, extractContacts, type Contacts } from "./contacts";

log.setLevel(LogLevel.ERROR);

const UA = "Mozilla/5.0 (compatible; CrosshairAudit/1.0; public website review)";
const PAGE_TIMEOUT_MS = 15_000;

export interface AuditResult {
  flaws: Flaw[];
  contacts: Contacts;
  /** The site refused automated visits (robots.txt): nothing was audited. */
  blocked: boolean;
}

/** True when robots.txt disallows the whole site for every crawler. */
async function blockedByRobots(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const lines = (await res.text()).split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
    let inStar = false;
    for (const line of lines) {
      const [k, ...rest] = line.split(":");
      const key = (k ?? "").trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") inStar = value === "*";
      else if (inStar && key === "disallow" && value === "/") return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function loadPage(url: string): Promise<PageFacts> {
  const started = Date.now();
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    cache: "no-store",
  });
  const html = await res.text();
  return { finalUrl: res.url || url, status: res.status, loadMs: Date.now() - started, htmlBytes: html.length, html };
}

async function urlStatus(url: string): Promise<number> {
  try {
    let res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(6_000), cache: "no-store" });
    // Some servers reject HEAD; ask again properly before calling it broken.
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(6_000), cache: "no-store" });
    }
    return res.status;
  } catch {
    return 0;
  }
}

async function brokenLinks($: cheerio.CheerioAPI, base: string): Promise<string[]> {
  const origin = new URL(base).origin;
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (/^(mailto|tel|javascript):|^#/i.test(href)) return;
    try {
      const u = new URL(href, base);
      if (u.origin === origin) links.add(u.href.split("#")[0] ?? u.href);
    } catch {
      // ignore
    }
  });
  const sample = [...links].slice(0, 8);
  const statuses = await Promise.all(sample.map(urlStatus));
  return sample.filter((_, i) => statuses[i] === 404 || statuses[i] === 410).map((u) => new URL(u).pathname);
}

async function hasSitemap(origin: string): Promise<boolean | null> {
  const a = await urlStatus(`${origin}/sitemap.xml`);
  if (a === 200) return true;
  const b = await urlStatus(`${origin}/sitemap_index.xml`);
  if (b === 200) return true;
  return a === 0 && b === 0 ? null : false;
}

/** Visit the contact/about pages with Crawlee (honours robots.txt). */
async function crawlContactPages(urls: string[], into: Contacts): Promise<void> {
  if (urls.length === 0) return;
  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: urls.length,
      maxConcurrency: 2,
      maxRequestRetries: 0,
      requestHandlerTimeoutSecs: 15,
      navigationTimeoutSecs: 12,
      respectRobotsTxtFile: true,
      async requestHandler({ body, request }) {
        // Crawlee bundles its own cheerio; parse with ours so types line up.
        extractContacts(cheerio.load(body.toString()), request.loadedUrl ?? request.url, into);
      },
    },
    new Configuration({ persistStorage: false }),
  );
  await crawler.run(urls);
}

/** Optional Google PageSpeed mobile score (needs GOOGLE_API_KEY). */
async function pageSpeed(url: string): Promise<Flaw | null> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;
  try {
    const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&key=${key}`;
    const res = await fetch(api, { signal: AbortSignal.timeout(45_000), cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
    const score = json.lighthouseResult?.categories?.performance?.score;
    if (typeof score !== "number" || score >= 0.5) return null;
    const pct = Math.round(score * 100);
    return {
      key: "pagespeed",
      area: "design",
      severity: pct < 30 ? "high" : "medium",
      title: "Poor mobile performance",
      evidence: `Google PageSpeed scores the mobile homepage ${pct}/100.`,
    };
  } catch {
    return null;
  }
}

export async function auditWebsite(website: string): Promise<AuditResult> {
  const contacts = emptyContacts();
  const origin = new URL(website).origin;

  if (await blockedByRobots(origin)) return { flaws: [], contacts, blocked: true };

  // Try https first; a site that only answers on http is itself a finding.
  let page: PageFacts | null = null;
  let lastError = "";
  for (const candidate of [origin.replace(/^http:/, "https:"), origin.replace(/^https:/, "http:")]) {
    try {
      page = await loadPage(candidate);
      if (page.status < 500) break;
      lastError = `The site answered with an error (${page.status}).`;
      page = null;
    } catch (err) {
      lastError =
        err instanceof Error && err.name === "TimeoutError"
          ? `The homepage did not load within ${PAGE_TIMEOUT_MS / 1000}s.`
          : "The site could not be reached.";
    }
  }
  if (!page) return { flaws: [siteDownFlaw(lastError)], contacts, blocked: false };

  const $ = cheerio.load(page.html);
  extractContacts($, page.finalUrl, contacts);
  const [broken, sitemap, , speed] = await Promise.all([
    brokenLinks($, page.finalUrl),
    hasSitemap(new URL(page.finalUrl).origin),
    crawlContactPages(contactLinks($, page.finalUrl), contacts).catch(() => undefined),
    pageSpeed(page.finalUrl),
  ]);
  const hasContact = contacts.emails.length > 0 || contacts.phones.length > 0 || contacts.hasForm;

  const flaws = checkHomepage($, page, { brokenLinks: broken, hasSitemap: sitemap, hasContact });
  if (speed) flaws.push(speed);
  return { flaws, contacts, blocked: false };
}
