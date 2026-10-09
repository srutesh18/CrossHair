import type { CheerioAPI } from "cheerio";

export interface Contacts {
  emails: string[];
  phones: string[];
  socials: Record<string, string>;
  hasForm: boolean;
  contactPage: string;
}

export function emptyContacts(): Contacts {
  return { emails: [], phones: [], socials: {}, hasForm: false, contactPage: "" };
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const JUNK_EMAIL = /(\.(png|jpe?g|gif|svg|webp)$)|example\.|@sentry|wixpress|@domain\.|your(name|email)?@|email@|name@|user@|@2x|\.(js|css)$|^u00[0-9a-f]{2}/i;

/** Cloudflare "email protection" hides addresses as hex XOR-ed with the first byte. */
function decodeCfEmail(hex: string): string {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  } catch {
    return "";
  }
}

const SOCIAL: Array<[string, RegExp]> = [
  ["linkedin", /linkedin\.com\/(company|in|school)\/[^/?#"']+/i],
  ["instagram", /instagram\.com\/[^/?#"']+/i],
  ["facebook", /facebook\.com\/[^/?#"']+/i],
  ["x", /(twitter|x)\.com\/[^/?#"']+/i],
  ["youtube", /youtube\.com\/(@|channel\/|c\/|user\/)[^/?#"']+/i],
];

/** Collect public contact details from one page into `into`. */
export function extractContacts($: CheerioAPI, pageUrl: string, into: Contacts): void {
  const emails = new Set(into.emails);
  $("a[href^='mailto:']").each((_, el) => {
    const v = ($(el).attr("href") ?? "").replace(/^mailto:/i, "").split("?")[0]?.trim().toLowerCase() ?? "";
    if (v) emails.add(v);
  });
  $("[data-cfemail]").each((_, el) => {
    const v = decodeCfEmail($(el).attr("data-cfemail") ?? "").toLowerCase();
    if (v) emails.add(v);
  });
  // The business's own published details (schema.org), e.g. "email": "info@…".
  $("script[type='application/ld+json']").each((_, el) => {
    for (const m of ($(el).text().match(/"email"\s*:\s*"(?:mailto:)?([^"]+@[^"]+)"/gi) ?? [])) {
      const v = /"email"\s*:\s*"(?:mailto:)?([^"]+)"/i.exec(m)?.[1];
      if (v) emails.add(v.toLowerCase());
    }
  });
  // Visible text only: scripts hold escaped JSON and UI sample data, not contacts.
  const visible = $("body").clone();
  visible.find("script, style, noscript, template, svg").remove();
  for (const m of visible.text().match(EMAIL_RE) ?? []) emails.add(m.toLowerCase());

  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  into.emails = [...emails]
    .filter((e) => !JUNK_EMAIL.test(e) && e.length < 80)
    // Addresses on the company's own domain first.
    .sort((a, b) => Number(!a.endsWith(`@${host}`)) - Number(!b.endsWith(`@${host}`)))
    .slice(0, 6);

  const phones = new Set(into.phones);
  $("a[href^='tel:']").each((_, el) => {
    const v = ($(el).attr("href") ?? "").replace(/^tel:/i, "").replace(/[^\d+]/g, "");
    if (v.replace(/\D/g, "").length >= 7) phones.add(v);
  });
  into.phones = [...phones].slice(0, 3);

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    for (const [name, re] of SOCIAL) {
      if (!into.socials[name]) {
        const m = re.exec(href);
        if (m && !/sharer|share\?|intent\//i.test(href)) into.socials[name] = `https://${m[0]}`;
      }
    }
  });

  if ($("form input[type='email'], form textarea, form input[name*='mail' i]").length > 0) {
    into.hasForm = true;
    if (!into.contactPage && /contact|kontakt|get-in-touch|enquir|inquir/i.test(pageUrl)) into.contactPage = pageUrl;
  }
}

/** Same-site links that probably hold contact details, best first. */
export function contactLinks($: CheerioAPI, base: string): string[] {
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().toLowerCase();
    if (!/contact|kontakt|get-in-touch|enquir|inquir|about|impressum|team/i.test(`${href} ${text}`)) return;
    try {
      const u = new URL(href, base);
      if (u.origin === new URL(base).origin && !out.includes(u.href.split("#")[0] ?? u.href)) {
        out.push(u.href.split("#")[0] ?? u.href);
      }
    } catch {
      // ignore malformed links
    }
  });
  // Contact pages before about pages.
  return out.sort((a, b) => Number(/about|team|impressum/i.test(a)) - Number(/about|team|impressum/i.test(b))).slice(0, 3);
}
