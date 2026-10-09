import "server-only";
import { createHash } from "node:crypto";
import { CheerioCrawler, Configuration, log, LogLevel } from "@crawlee/cheerio";
import type { PublicPost } from "./types";

/**
 * Open-source web crawling with Crawlee (Apify, Apache-2.0). Crawls the public
 * pages listed in Setup (community boards, changelog comments, public
 * feedback pages), follows same-site links one level deep, honours
 * robots.txt, and keeps only text blocks that mention a watched term.
 */
log.setLevel(LogLevel.ERROR);

export interface CrawlOptions {
  startUrls: string[];
  terms: string[];
  maxPages?: number;
}

const BLOCKS = "article, blockquote, li, p, .post, .comment, .cooked, .message, .review, td";

export async function crawlPages({ startUrls, terms, maxPages = 30 }: CrawlOptions): Promise<PublicPost[]> {
  const urls = startUrls.filter((u) => /^https?:\/\//i.test(u));
  if (urls.length === 0 || terms.length === 0) return [];
  const needles = terms.map((t) => t.toLowerCase()).filter(Boolean);
  const posts = new Map<string, PublicPost>();

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: maxPages,
      maxConcurrency: 4,
      requestHandlerTimeoutSecs: 20,
      navigationTimeoutSecs: 15,
      maxRequestRetries: 1,
      respectRobotsTxtFile: true,
      async requestHandler({ $, request, enqueueLinks }) {
        const pageTitle = $("title").first().text().trim();
        const host = new URL(request.loadedUrl ?? request.url).host;
        $("script, style, noscript, nav, header, footer").remove();

        $(BLOCKS).each((_, el) => {
          // Skip containers whose children will be visited on their own.
          if ($(el).find(BLOCKS).length > 0) return;
          const text = $(el).text().replace(/\s+/g, " ").trim();
          if (text.length < 60 || text.length > 2000) return;
          const lower = text.toLowerCase();
          if (!needles.some((n) => lower.includes(n))) return;
          const id = createHash("sha1").update(text).digest("hex").slice(0, 12);
          const url = `${request.loadedUrl ?? request.url}#crosshair-${id}`;
          if (!posts.has(url)) {
            posts.set(url, {
              who: `someone on ${host}`,
              title: pageTitle,
              said: text.slice(0, 1000),
              sourceName: `Web ${host}`,
              sourceUrl: url,
              sourceAt: null,
            });
          }
        });

        if ((request.userData as { depth?: number }).depth === 0) {
          await enqueueLinks({ strategy: "same-domain", userData: { depth: 1 } });
        }
      },
    },
    // In-memory only: no ./storage folder left behind.
    new Configuration({ persistStorage: false }),
  );

  await crawler.run(urls.map((url) => ({ url, userData: { depth: 0 } })));
  return [...posts.values()];
}
