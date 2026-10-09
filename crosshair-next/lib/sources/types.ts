/** One public post from any complaint source, normalised for the scan. */
export interface PublicPost {
  who: string;
  /** Thread or issue title, when the source has one. */
  title?: string;
  /** The user's service this source is about (e.g. an n8n forum -> "ai automation"). */
  serviceHint?: string;
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
