/** Normalise whatever a user pasted ("acme.com/about", "http://www.acme.com") to an origin. */
export function normaliseWebsite(raw: string): { website: string; domain: string } | null {
  const trimmed = raw.trim().replace(/^<|>$/g, "");
  if (!trimmed) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".") || host.endsWith(".") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    return { website: `${u.protocol}//${host}`, domain: host.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

/** A readable company name from a domain: "acme-dental.co.uk" -> "Acme Dental". */
export function nameFromDomain(domain: string): string {
  const base = domain.split(".")[0] ?? domain;
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
