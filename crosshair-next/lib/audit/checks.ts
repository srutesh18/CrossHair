import type { CheerioAPI } from "cheerio";

export type Area = "design" | "seo" | "automation" | "app";
export type Severity = "high" | "medium" | "low";

export interface Flaw {
  key: string;
  area: Area;
  severity: Severity;
  title: string;
  /** What we actually saw, quotable in an email. */
  evidence: string;
}

export const AREA_LABEL: Record<Area, string> = {
  design: "Website",
  seo: "SEO",
  automation: "Automation",
  app: "App / portal",
};

export interface PageFacts {
  finalUrl: string;
  status: number;
  loadMs: number;
  htmlBytes: number;
  html: string;
}

const BOOKING = /calendly\.com|acuityscheduling|booksy|setmore|simplybook|squareup\.com\/appointments|zocdoc|opentable|resy\.com|mindbodyonline|vagaro|fresha|hubspot\.com\/meetings|cal\.com\/|book (now|online|an appointment)|schedule (a|an|your) (call|appointment|consultation)|online booking|reserve a table/i;
const CHAT = /intercom|drift\.com|tawk\.to|crisp\.chat|tidio|livechatinc|zopim|zendesk.*widget|freshchat|manychat|usemessages|hs-chat|wa\.me\/|api\.whatsapp\.com|chatbot|botpress|voiceflow/i;
const ANALYTICS = /googletagmanager\.com|google-analytics\.com|gtag\(|fbq\(|connect\.facebook\.net|plausible\.io|clarity\.ms|hotjar/i;
const PORTAL = /\b(log ?in|sign ?in|my account|client portal|customer portal|order online|order now|patient portal)\b/i;
const APP_STORE = /apps\.apple\.com|play\.google\.com\/store/i;
/** Businesses that run on appointments or reservations. */
const APPOINTMENTS = /\b(appointments?|clinic|dentist|dental|salon|spa|barber|restaurant|reservations?|consultations?|therapy|therapist|physio|massage|veterinar\w*|lawyer|attorney|tutoring|fitness|gym|patients?|dine|dinner)\b/gi;
/** Businesses whose customers would log in or order online. */
const ORDERING = /\b(menu|order|shop|store|products?|delivery|patients|members(hip)?|clients|customers|subscribers)\b/i;

export function noWebsiteFlaw(): Flaw {
  return {
    key: "no_website",
    area: "design",
    severity: "high",
    title: "No website",
    evidence: "No website is listed for this business.",
  };
}

export function siteDownFlaw(detail: string): Flaw {
  return { key: "site_down", area: "design", severity: "high", title: "Website does not load", evidence: detail };
}

/** All homepage checks. `brokenLinks` and `hasSitemap` come from extra requests. */
export function checkHomepage(
  $: CheerioAPI,
  page: PageFacts,
  extra: { brokenLinks: string[]; hasSitemap: boolean | null; hasContact: boolean },
): Flaw[] {
  const flaws: Flaw[] = [];
  const html = page.html;
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const year = new Date().getFullYear();

  // ---------- website / design ----------
  if (page.finalUrl.startsWith("http://")) {
    flaws.push({ key: "no_https", area: "design", severity: "high", title: "No HTTPS", evidence: `The site loads over plain http (${page.finalUrl}), so browsers mark it "Not secure".` });
  }
  if ($("meta[name='viewport']").length === 0) {
    flaws.push({ key: "not_mobile", area: "design", severity: "high", title: "Not mobile-friendly", evidence: "The homepage has no mobile viewport tag, so it renders as a shrunken desktop page on phones." });
  }
  const secs = page.loadMs / 1000;
  if (secs > 6) flaws.push({ key: "slow", area: "design", severity: "high", title: "Very slow homepage", evidence: `The homepage took ${secs.toFixed(1)}s to load.` });
  else if (secs > 3) flaws.push({ key: "slow", area: "design", severity: "medium", title: "Slow homepage", evidence: `The homepage took ${secs.toFixed(1)}s to load.` });

  const copyright = /(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i.exec(text);
  const copyYear = copyright ? Number(copyright[1]) : null;
  if (copyYear && copyYear >= 1995 && copyYear <= year - 2) {
    flaws.push({ key: "stale", area: "design", severity: "medium", title: "Looks unmaintained", evidence: `The footer still says © ${copyYear}.` });
  }
  if (extra.brokenLinks.length > 0) {
    flaws.push({
      key: "broken_links",
      area: "design",
      severity: extra.brokenLinks.length >= 3 ? "high" : "medium",
      title: `${extra.brokenLinks.length} broken link${extra.brokenLinks.length === 1 ? "" : "s"}`,
      evidence: `Links on the homepage return "not found": ${extra.brokenLinks.slice(0, 3).join(", ")}`,
    });
  }
  const jquery = /jquery[.-]?(1\.\d+(\.\d+)?)/i.exec(html);
  const wp = /<meta[^>]+generator[^>]+WordPress\s+([0-9.]+)/i.exec(html);
  if (/<frameset|\.swf["']|<marquee/i.test(html)) {
    flaws.push({ key: "outdated_tech", area: "design", severity: "high", title: "Very outdated build", evidence: "The page uses frames, Flash or <marquee>, which modern browsers no longer support." });
  } else if (wp && Number(wp[1]?.split(".")[0]) < 6) {
    flaws.push({ key: "outdated_tech", area: "design", severity: "medium", title: "Outdated WordPress", evidence: `The site reports WordPress ${wp[1]}, several major versions behind.` });
  } else if (jquery) {
    flaws.push({ key: "outdated_tech", area: "design", severity: "low", title: "Old front-end code", evidence: `The site still loads jQuery ${jquery[1]} (2016 or older).` });
  }
  if (!extra.hasContact) {
    flaws.push({ key: "no_contact", area: "design", severity: "medium", title: "Hard to contact", evidence: "No email, phone link or contact form found on the homepage or contact pages." });
  }

  // ---------- SEO ----------
  const title = $("title").first().text().trim();
  if (!title) flaws.push({ key: "no_title", area: "seo", severity: "medium", title: "No page title", evidence: "The homepage has no <title>, so Google shows the bare URL." });
  else if (title.length < 15 || title.length > 70) {
    flaws.push({ key: "weak_title", area: "seo", severity: "low", title: "Weak page title", evidence: `The homepage title is "${title.slice(0, 80)}" (${title.length} characters; 30-60 ranks best).` });
  }
  const desc = ($("meta[name='description']").attr("content") ?? "").trim();
  if (!desc) flaws.push({ key: "no_meta_description", area: "seo", severity: "medium", title: "No meta description", evidence: "Google has no description to show under the result, so it guesses one." });
  const h1 = $("h1").length;
  if (h1 === 0) flaws.push({ key: "no_h1", area: "seo", severity: "medium", title: "No main heading", evidence: "The homepage has no <h1> heading telling search engines what the business does." });
  const robots = ($("meta[name='robots']").attr("content") ?? "").toLowerCase();
  if (robots.includes("noindex")) {
    flaws.push({ key: "noindex", area: "seo", severity: "high", title: "Hidden from Google", evidence: "The homepage tells search engines not to index it (noindex)." });
  }
  if (extra.hasSitemap === false) flaws.push({ key: "no_sitemap", area: "seo", severity: "low", title: "No sitemap", evidence: "/sitemap.xml is missing." });
  const imgs = $("img").length;
  const noAlt = $("img:not([alt]), img[alt='']").length;
  if (imgs >= 5 && noAlt / imgs > 0.4) {
    flaws.push({ key: "img_alt", area: "seo", severity: "low", title: "Images without descriptions", evidence: `${noAlt} of ${imgs} images have no alt text.` });
  }
  if ($("script[type='application/ld+json']").length === 0) {
    flaws.push({ key: "no_schema", area: "seo", severity: "low", title: "No business details for Google", evidence: "No structured data (schema.org), so Google can't show hours, reviews or location rich results." });
  }
  if (text.split(" ").length < 200) {
    flaws.push({ key: "thin_content", area: "seo", severity: "low", title: "Very little text", evidence: `The homepage has about ${text.split(" ").length} words, too little to rank for anything.` });
  }
  if (!ANALYTICS.test(html)) {
    flaws.push({ key: "no_analytics", area: "seo", severity: "low", title: "No analytics", evidence: "No Google Analytics, Tag Manager or ad pixel found, so they can't measure visitors." });
  }

  // ---------- automation ----------
  // What the business IS comes from its title, description, headings and menu,
  // not every word on the page (a payments site may mention "gym" customers).
  const identity = [
    $("title").first().text(),
    $("meta[name='description']").attr("content") ?? "",
    $("h1, h2").slice(0, 8).text(),
    $("nav").first().text(),
  ].join(" ");
  const apptWords = [...new Set((identity.match(APPOINTMENTS) ?? []).map((w) => w.toLowerCase()))];
  if (apptWords.length >= 1 && !BOOKING.test(html)) {
    const what = apptWords.slice(0, 2).join(" and ");
    flaws.push({ key: "no_booking", area: "automation", severity: "medium", title: "No online booking", evidence: `The site talks about ${what} but has no online booking; customers have to call or email.` });
  }
  if (!CHAT.test(html)) {
    flaws.push({ key: "no_chat", area: "automation", severity: "low", title: "No chat or instant replies", evidence: "No live chat, chatbot or WhatsApp button, so after-hours questions go unanswered." });
  }

  // ---------- app / portal ----------
  if (ORDERING.test(identity) && !PORTAL.test(text) && !APP_STORE.test(html)) {
    flaws.push({ key: "no_portal", area: "app", severity: "low", title: "No customer portal or app", evidence: "No customer login, online ordering or mobile app links." });
  }

  return flaws;
}
