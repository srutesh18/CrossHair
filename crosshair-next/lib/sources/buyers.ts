import "server-only";
import { searchReddit } from "./reddit";
import { searchHackerNews } from "./hackernews";
import { searchDiscourse } from "./discourse";
import type { PublicPost } from "./types";

/**
 * Where people post that they want to hire or buy a service:
 *  - Reddit hiring communities: only [Hiring] / [Task] / [Paid] posts.
 *  - Reddit business communities: owners asking for recommendations.
 *  - Hacker News "Freelancer? Seeking freelancer?" threads: SEEKING FREELANCER.
 */
const HIRING_SUBS = ["forhire", "hiring", "freelance_forhire", "slavelabour", "jobbit", "HireaWriter", "DesignJobs"];
const BUSINESS_SUBS = ["smallbusiness", "Entrepreneur", "startups", "ecommerce", "shopify", "SaaS", "marketing", "nocode", "WordpressPlugins", "webdev"];
const BUY_PHRASES = ['"looking for"', "recommend", "hire", '"need someone"', "agency"];

const quote = (t: string) => (t.includes(" ") ? `"${t}"` : t);

/** Reddit search across several subreddits in one request. */
function multiReddit(subs: string[], query: string, limit: number, window: "month" | "year") {
  return searchReddit(query, limit, window, subs);
}

export async function searchRedditHiring(terms: string[], limit = 40): Promise<PublicPost[]> {
  const posts = await multiReddit(HIRING_SUBS, `(${terms.map(quote).join(" OR ")})`, limit, "month");
  // Sellers post "[For Hire]"; only buyers' posts are leads.
  return posts.filter((p) => /^\s*\[(hiring|task|paid|hire)\]/i.test(p.title ?? p.said) && !/\[for hire\]/i.test(p.title ?? ""));
}

export async function searchRedditBusiness(terms: string[], limit = 40): Promise<PublicPost[]> {
  return multiReddit(
    BUSINESS_SUBS,
    `(${terms.map(quote).join(" OR ")}) (${BUY_PHRASES.join(" OR ")})`,
    limit,
    "year",
  );
}

export async function searchHNSeekingFreelancer(term: string, limit = 20): Promise<PublicPost[]> {
  const posts = await searchHackerNews(`"seeking freelancer" ${quote(term)}`, limit, 180);
  return posts
    .filter((p) => /seeking freelancer/i.test(p.said))
    .map((p) => ({ ...p, title: `Seeking freelancer: ${term}`, sourceName: "Hacker News · Seeking freelancer" }));
}

/** Hiring requests on a service's own community forum, newest first. */
export async function searchBuyerForum(forum: string, service: string, limit = 20): Promise<PublicPost[]> {
  const queries = ['"looking for"', "hire", "freelancer"];
  const lists = await Promise.all(queries.map((q) => searchDiscourse(forum, q, limit)));
  return lists.flat().map((p) => ({ ...p, serviceHint: service }));
}
