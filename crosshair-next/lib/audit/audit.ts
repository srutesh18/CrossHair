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
  /** The homepage <title>, for naming companies found by their domain. */
  pageTitle: string;
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

interface LighthouseAudit {
  displayValue?: string;
  numericValue?: number;
}

interface PsiResponse {
  lighthouseResult?: {
    categories?: Record<string, { score?: number } | undefined>;
    audits?: Record<string, LighthouseAudit | undefined>;
  };
}

/**
 * Google PageSpeed Insights on mobile (needs GOOGLE_API_KEY, free).
 *
 * We ask for performance, SEO and accessibility because each maps to a service
 * we sell, and we quote Google's own number plus the real metric. "Google rates
 * your mobile site 31/100 and the page takes 8.4s to show its main content" is
 * evidence a business owner can verify; our own fetch timing was just noise
 * from whichever network the audit happened to run on.
 */
/**
 * Lighthouse runs a real browser on Google's servers, so a call takes 10-30s.
 * Capped well under that: a score is a bonus, never worth stalling a scan for.
 */
const PSI_TIMEOUT_MS = 25_000;

async function pageSpeed(url: string): Promise<Flaw[]> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return [];
  try {
    const cats = ["performance", "seo", "accessibility"].map((c) => `&category=${c}`).join("");
    const api =
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}` +
      `&strategy=mobile${cats}&key=${key}`;
    const res = await fetch(api, { signal: AbortSignal.timeout(PSI_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return [];

    const json = (await res.json()) as PsiResponse;
    const categories = json.lighthouseResult?.categories ?? {};
    const audits = json.lighthouseResult?.audits ?? {};
    const pct = (name: string): number | null => {
      const s = categories[name]?.score;
      return typeof s === "number" ? Math.round(s * 100) : null;
    };

    const flaws: Flaw[] = [];

    const perf = pct("performance");
    if (perf !== null && perf < 75) {
      const lcp = audits["largest-contentful-paint"]?.displayValue;
      flaws.push({
        key: "pagespeed",
        area: "design",
        severity: perf < 50 ? "high" : "medium",
        title: "Slow on phones",
        evidence:
          `Google rates the mobile homepage ${perf}/100 for speed` +
          (lcp ? `, and its main content takes ${lcp} to appear.` : ".") +
          " Most people leave before a slow page finishes loading.",
      });
    }

    const seo = pct("seo");
    if (seo !== null && seo < 85) {
      flaws.push({
        key: "psi_seo",
        area: "seo",
        severity: seo < 65 ? "high" : "medium",
        title: "Weak on Google's own SEO checks",
        evidence: `Google's SEO audit scores the homepage ${seo}/100, so it is losing search traffic to competitors.`,
      });
    }

    const a11y = pct("accessibility");
    if (a11y !== null && a11y < 75) {
      flaws.push({
        key: "psi_a11y",
        area: "design",
        severity: a11y < 55 ? "medium" : "low",
        title: "Hard to use for some visitors",
        evidence: `Google's accessibility audit scores the homepage ${a11y}/100 (unreadable contrast, unlabelled buttons and similar).`,
      });
    }

    return flaws;
  } catch {
    // PSI is a bonus signal; the rest of the audit still stands without it.
    return [];
  }
}

/**
 * `pageSpeed` is off by default. Running it while sweeping dozens of newly
 * discovered companies made every scan wait on Lighthouse; it is worth those
 * seconds only for a company you are about to contact.
 */
export async function auditWebsite(
  website: string,
  opts: { pageSpeed?: boolean } = {},
): Promise<AuditResult> {
  const contacts = emptyContacts();
  const origin = new URL(website).origin;

  if (await blockedByRobots(origin)) return { flaws: [], contacts, blocked: true, pageTitle: "" };

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
  if (!page) return { flaws: [siteDownFlaw(lastError)], contacts, blocked: false, pageTitle: "" };

  const $ = cheerio.load(page.html);
  extractContacts($, page.finalUrl, contacts);
  const [broken, sitemap, , speed] = await Promise.all([
    brokenLinks($, page.finalUrl),
    hasSitemap(new URL(page.finalUrl).origin),
    crawlContactPages(contactLinks($, page.finalUrl), contacts).catch(() => undefined),
    opts.pageSpeed ? pageSpeed(page.finalUrl) : Promise.resolve([] as Flaw[]),
  ]);
  const hasContact = contacts.emails.length > 0 || contacts.phones.length > 0 || contacts.hasForm;

  const flaws = checkHomepage($, page, { brokenLinks: broken, hasSitemap: sitemap, hasContact });
  // PSI measures speed properly, so drop our own rough fetch timing when it ran.
  const measured = speed.length > 0 ? flaws.filter((f) => f.key !== "slow") : flaws;
  measured.push(...speed);
  return {
    flaws: measured,
    contacts,
    blocked: false,
    pageTitle: $("title").first().text().replace(/\s+/g, " ").trim(),
  };
}
