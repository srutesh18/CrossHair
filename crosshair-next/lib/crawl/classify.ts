import "server-only";
import { matchService } from "./services";

/**
 * Complaint categories and buying intent. Rules run on every post (free,
 * instant); Typesafe AI can refine the category of the strongest posts.
 */
export const CATEGORIES = {
  buying: {
    label: "Looking to hire / buy",
    describe: "Actively looking to hire, buy, or get recommendations for a service or tool",
    patterns: [/^\s*\[(hiring|task|paid)\]/, /\bseeking freelancer\b/, /\blooking for (a|an)? ?[\w\s-]{0,30}(designer|developer|dev|agency|freelancer|expert|consultant|team|specialist|editor|writer|marketer)\b/, /\bneed (someone|somebody|a dev|a developer|a designer|an agency) to\b/, /\bwho can (build|make|design|create|fix|help)\b/, /\blooking for (a|an|some|someone)\b/, /\bneed (a|an|someone|help with)\b/, /\bany(one|body) (know|recommend)\b/, /\bcan (anyone|you) recommend\b/, /\brecommend(ations?)? for\b/, /\bhir(e|ing) (a|an|someone)\b/, /\bwho (can|should i)\b/, /\bquote for\b/, /\bbudget (is|of|for)\b/, /\bwhere (can|do) i find\b/],
  },
  switching: {
    label: "Switching / alternatives",
    describe: "Wants to leave the product, cancel, migrate, or asks for an alternative",
    patterns: [/alternatives? to\b/, /\bswitch(ing|ed)? (from|away|to)\b/, /\bmigrat(e|ing|ion) (from|away|off)\b/, /\bmoving (away|off)\b/, /\breplac(e|ing) \w+/, /\bcancel(l?ing|led)?\b/, /\bleaving\b/, /\bchurn/, /what (do|should) (you|we) use instead/, /\brecommend(ation)?s? for\b/],
  },
  pricing: {
    label: "Pricing / cost",
    describe: "Too expensive, price increase, billing or per-seat cost complaints",
    patterns: [/\bexpensive\b/, /\boverpriced\b/, /\bprice (hike|increase)\b/, /\bpricing\b/, /\bper (seat|user)\b/, /\brenewal\b/, /\bbilling\b/, /\bcosts? (too|so) much\b/, /\binvoice\b/],
  },
  performance: {
    label: "Slow / performance",
    describe: "Slow loading, lag, timeouts, long refresh or sync times",
    patterns: [/\bslow\b/, /\blag(gy|s)?\b/, /\btimes? out\b/, /\btimeout\b/, /takes (forever|ages|\d+ ?(min|minutes|seconds|hours))/, /\bsluggish\b/, /\bfreez(e|es|ing)\b/, /\bperformance\b/, /\bloading\b/],
  },
  reliability: {
    label: "Bugs / reliability",
    describe: "Outages, crashes, bugs, data loss, broken or failing features",
    patterns: [/\boutage\b/, /\bdown(time)?\b/, /\bcrash(es|ing)?\b/, /\bbug(gy|s)?\b/, /\bbroken\b/, /\bdata loss\b/, /\bfail(s|ed|ing|ure)\b/, /\berror\b/, /\bunreliable\b/],
  },
  support: {
    label: "Support / service",
    describe: "Poor customer support, no response, slow tickets, bad account management",
    patterns: [/\bsupport\b.*\b(slow|bad|terrible|useless|ignored|no response)\b/, /\bcustomer (service|support)\b/, /\bno (response|reply)\b/, /\bticket\b/, /\baccount manager\b/, /\bignored\b/],
  },
  integrations: {
    label: "Integrations / API / data",
    describe: "Integration, API, import/export, sync or connector problems",
    patterns: [/\bintegrat(e|ion|ions)\b/, /\bapi\b/, /\bwebhooks?\b/, /\bimport(ing)?\b/, /\bexport(ing)?\b/, /\bsync(ing)?\b/, /\bconnector\b/, /\bzapier\b/, /\bcsv\b/],
  },
  usability: {
    label: "Usability / UX",
    describe: "Confusing, clunky, hard to use, steep learning curve, bad UI",
    patterns: [/\bconfusing\b/, /\bclunky\b/, /\bhard to (use|find|learn)\b/, /\bunintuitive\b/, /\blearning curve\b/, /\bui\b/, /\bux\b/, /\bcomplicated\b/, /\bcumbersome\b/],
  },
  missing_feature: {
    label: "Missing feature",
    describe: "A capability the product lacks or does not support",
    patterns: [/\bdoes(n'?t| not) support\b/, /\bno way to\b/, /\bmissing\b/, /\black(s|ing)\b/, /\bwish (it|they)\b/, /\bfeature request\b/, /\bcan'?t (even )?\w+/],
  },
  other: { label: "Other", describe: "Not a complaint about a product", patterns: [] as RegExp[] },
} as const;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export function isCategory(v: string): v is Category {
  return v in CATEGORIES;
}

const STRONG = [/\bhate\b/, /\bterrible\b/, /\bfrustrat/, /\bworst\b/, /\bunusable\b/, /\bnightmare\b/, /\bfed up\b/, /\bridiculous\b/, /\bawful\b/, /\bgiving up\b/];
const BUSINESS = [/\bour (team|company|org|customers|clients|sales|ops)\b/, /\bwe (use|pay|switched|are paying|moved)\b/, /\bat work\b/, /\bmy (team|company|employer|clients)\b/, /\benterprise\b/];
/** Builders announcing a product: competitors to you, not unhappy buyers. */
const VENDOR = [/\[for hire\]/, /\bseeking work\b/, /\bavailable for (hire|work|projects)\b/, /\bopen to (new )?(opportunities|projects|work)\b/, /\bi'?m available\b/, /\bavailable to help\b/, /\bhire me\b/, /\bmy portfolio\b/, /\bi can help (you|with)\b/, /\bi offer\b/, /\bmy services\b/, /\bdm me\b/, /\bwe offer\b/, /^show hn\b/, /\bi (built|made|created|launched)\b/, /\bwe (built|made|launched|are building)\b/, /\bintroducing\b/, /\bmy (startup|side project|saas)\b/];
const ASKING = [/\bany (recommendations|suggestions|alternatives)\b/, /\bwhat (do|are) (you|people) us(e|ing)\b/, /\blooking for (a|an)\b/, /\bis there (a|an) (better|alternative)\b/];

const EN = new Set("the a an and or but is are was were be been to of in on for with this that it i we you they my our your have has had not do does did can can't don't just so if when what why how than then there".split(" "));
const NON_EN = new Set("le la les des est et pour une du dans que qui pas sur avec el los las por para una con del der die das und nicht ist mit".split(" "));

/** Cheap stop-word check: product names like "Tableau" are also French words. */
/** Employment threads and job ads: employers hiring staff, not buyers of a service. */
const JOB_POST = [/who is hiring\?/, /who wants to be hired/, /\bfull[- ]time\b.*\b(salary|benefits|w2|visa)\b/, /\bjob (opening|description)\b/];

/**
 * An explicit request to hire or pay someone. Posts that match only one of
 * your services (no competitor) must say this, or they are just chatter.
 */
const HIRE_STRICT = /\b(hiring|hire (a|an|someone|me)?|to hire|needed|wanted|paid (project|task|gig|work)|budget|seeking freelancer)\b|\[(hiring|task|paid)\]|\$\s?\d|\blooking for (a|an|some)?\s?[\w\s.+&/-]{0,40}\b(developers?|devs?|experts?|freelancers?|builders?|specialists?|consultants?|agency|agencies|designers?|engineers?|editors?|partners?|someone)\b|\bneed (a|an|someone|somebody) (to|who|for)\b/i;

export function isHireRequest(text: string): boolean {
  return HIRE_STRICT.test(text);
}

/** Forum housekeeping and vendor programmes, never a buyer. */
const ANNOUNCEMENT = /\b(challenge|apply now|introducing|announcement|monthly community update|newsletter|webinar|release notes|mega forum)\b/i;

/** Not a paying client: equity-only, unpaid or a co-founder search. */
const NOT_A_CLIENT = /\b(unpaid|internship|co-?founder|equity only|for equity|volunteer)\b/i;

/**
 * Score for an explicit request to hire or buy one of your services (0-100).
 * Separate from the complaint score: what matters is how clearly someone is
 * asking, for your service, with money, recently.
 */
export function buyerIntent(args: {
  title: string;
  body: string;
  titleNamesService: boolean;
  postedAt: string | null;
}): number {
  const title = args.title.toLowerCase();
  const all = `${args.title} ${args.body}`.toLowerCase();
  let score = 50;
  if (HIRE_STRICT.test(args.title)) score += 20;
  if (args.titleNamesService) score += 15;
  if (/\bbudget\b|\$\s?\d|\b\d+\s?(usd|eur|gbp)\b|\bpaid\b|\/hr\b|per hour/.test(all)) score += 10;
  if (args.postedAt) {
    const days = (Date.now() - new Date(args.postedAt).getTime()) / 86_400_000;
    if (days <= 14) score += 5;
    else if (days > 120) score -= 10;
  }
  if (NOT_A_CLIENT.test(all)) score -= 30;
  if (/\bfull[- ]time\b|\bjoin (our|the) team\b/.test(title)) score -= 10;
  return Math.max(0, Math.min(100, score));
}

/** Hiring language near the top: the title or the opening lines. */
export function asksToHireUpFront(title: string, body: string): boolean {
  return HIRE_STRICT.test(title) || HIRE_STRICT.test(body.slice(0, 220));
}

export function isAnnouncement(text: string): boolean {
  return ANNOUNCEMENT.test(text);
}

export function isJobOrSeller(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    JOB_POST.some((p) => p.test(lower)) ||
    /^\s*\[for hire\]/.test(lower) ||
    /^\s*seeking work\b/.test(lower) ||
    /\bopen to (new )?(opportunities|projects)\b|\bi'?m available to help\b|\bhire me\b/.test(lower) ||
    // A seller pricing their own offer: "Audit for your app — $399 fixed".
    (/\bfor your\b/.test(lower.slice(0, 120)) && /\$\s?\d|\bfixed\b/.test(lower.slice(0, 160)))
  );
}

export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  if (words.length < 8) return true;
  let en = 0;
  let other = 0;
  for (const w of words) {
    if (EN.has(w)) en += 1;
    else if (NON_EN.has(w)) other += 1;
  }
  return en >= other * 2 && en / words.length >= 0.08;
}

export interface Classified {
  category: Category;
  confidence: number;
  competitor: string;
  /** Which of the user's services the post asks about, if any. */
  service: string;
  intent: number;
  matched: string[];
  /** Mentions a competitor, keyword or search term at all. */
  relevant: boolean;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function classify(
  text: string,
  competitors: string[],
  keywords: string[],
  queryTerms: string[] = [],
  services: string[] = [],
): Classified {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  const has = (term: string) => new RegExp(`\\b${escape(term.trim().toLowerCase())}\\b`).test(lower);

  const competitor =
    competitors.find((c) => c.trim() && new RegExp(`\\b${escape(c.trim().toLowerCase())}\\b`).test(lower)) ?? "";
  if (competitor) matched.push(competitor);
  const service = matchService(text, services);
  if (service) matched.push(service);
  for (const k of [...keywords, ...queryTerms]) if (k.trim() && has(k)) matched.push(k.trim());

  // Category with the most pattern hits wins; earlier categories win ties
  // (buying and switching carry the strongest intent).
  let best: Category = "other";
  let bestHits = 0;
  for (const key of CATEGORY_KEYS) {
    const hits = CATEGORIES[key].patterns.filter((p) => p.test(lower)).length;
    if (hits > bestHits) {
      best = key;
      bestHits = hits;
    }
  }

  let intent = 0;
  if (best === "switching" || best === "buying") intent += 40;
  else if (best !== "other") intent += 20;
  intent += Math.min(bestHits - 1, 2) * 5;
  if (competitor) intent += 15;
  if (service) intent += 15;
  if (STRONG.some((p) => p.test(lower))) intent += 15;
  // Explicit buyer markers and money on the table.
  if (/^\s*\[(hiring|task|paid)\]|\bseeking freelancer\b/.test(lower)) intent += 15;
  if (/\bbudget\b|\$\s?\d|\b\d+\s?(usd|dollars|eur|gbp)\b|\bpaid (task|project|gig)\b/.test(lower)) intent += 10;
  if (BUSINESS.some((p) => p.test(lower))) intent += 10;
  if (ASKING.some((p) => p.test(lower))) intent += 15;
  if (matched.length > (competitor ? 1 : 0) + (service ? 1 : 0)) intent += 5;
  // Sellers announcing or advertising: competitors to you, never top of the list.
  if (VENDOR.some((p) => p.test(lower.trim()))) intent = Math.min(intent - 35, 20);

  return {
    category: best,
    confidence: best === "other" ? 0 : Math.min(0.4 + bestHits * 0.15, 0.85),
    competitor,
    service,
    intent: Math.max(0, Math.min(100, intent)),
    matched: [...new Set(matched)],
    relevant: matched.length > 0,
  };
}

/**
 * Intent after Typesafe changes the category. Explicit switching phrases
 * ("alternatives to", "switching from") are the strongest signal there is, so
 * Typesafe may upgrade a post to switching but never downgrade one.
 */
const STRONGEST: Category[] = ["switching", "buying"];
export function canRefine(ruleCategory: Category): boolean {
  return !STRONGEST.includes(ruleCategory);
}
export function intentAfterRefine(intent: number, ruleCategory: Category, refined: Category): number {
  if (!STRONGEST.includes(ruleCategory) && STRONGEST.includes(refined)) return Math.min(100, intent + 20);
  return intent;
}

/** Typesafe AI category refinement for one post. Returns null when unsure. */
export async function classifyWithTypesafe(text: string): Promise<{ category: Category; confidence: number } | null> {
  const apiKey = process.env.TYPESAFE_AI_API_KEY;
  if (!apiKey || process.env.TYPESAFE_CROSSCHECK === "false") return null;
  const criteria = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, CATEGORIES[k].describe]));
  const res = await fetch(`${process.env.TYPESAFE_AI_BASE_URL || "https://api.typesafe.ai"}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.TYPESAFE_AI_MODEL || "jev-latest",
      state: text.slice(0, 2000),
      questions: {
        category: {
          type: "choice",
          instructions: "What is the main complaint in this public post about a software product?",
          criteria,
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Typesafe AI returned ${res.status}`);
  const json = (await res.json()) as { answers?: { category?: { choice?: string; confidence?: number } } };
  const a = json.answers?.category;
  if (!a?.choice || typeof a.confidence !== "number" || !isCategory(a.choice)) return null;
  return a.confidence >= 0.5 ? { category: a.choice, confidence: a.confidence } : null;
}
