/** One public post from any complaint source, normalised for the scan. */
export interface PublicPost {
  who: string;
  /** Thread or issue title, when the source has one. */
  title?: string;
  /** The user's service this source is about (e.g. an n8n forum -> "ai automation"). */
  serviceHint?: string;
  /** External links in the post (the poster's own website, usually). */
  links?: string[];
  said: string;
  sourceName: string;
  sourceUrl: string;
  sourceAt: string | null;
}

/** Collapse whitespace and strip tags/entities from an HTML fragment. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&#32;|&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every http(s) link in an HTML fragment, decoded. */
export function linksIn(html: string): string[] {
  const decoded = html.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x2F;/g, "/").replace(/&#39;/g, "'");
  const out = new Set<string>();
  for (const m of decoded.matchAll(/href="(https?:\/\/[^"]+)"/gi)) if (m[1]) out.add(m[1]);
  // Bare domains written in text ("check out waybill.supply").
  for (const m of decoded.replace(/<[^>]+>/g, " ").matchAll(/\bhttps?:\/\/[^\s<>"')\]]+/gi)) out.add(m[0]);
  return [...out];
}
