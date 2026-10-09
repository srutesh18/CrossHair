import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { auditWebsite } from "./audit/audit";
import { noWebsiteFlaw, type Flaw } from "./audit/checks";
import { scoreCompany } from "./audit/score";
import { nameFromDomain, normaliseWebsite } from "./audit/url";

export type CompanyStatus = "new" | "audited" | "failed" | "contacted" | "dismissed";

export type CompanySource = "manual" | "csv" | "google_places" | "reddit" | "hn" | "forum" | "news";

export interface Company {
  id: string;
  name: string;
  website: string;
  domain: string;
  source: CompanySource;
  found_url: string;
  found_title: string;
  found_author: string;
  found_at: string | null;
  trigger_kind: string;
  trigger_headline: string;
  trigger_url: string;
  trigger_at: string | null;
  search_query: string;
  address: string;
  category: string;
  rating: number | null;
  rating_count: number | null;
  phone: string;
  emails: string[];
  contact_page: string;
  socials: Record<string, string>;
  flaws: Flaw[];
  services_matched: string[];
  score: number;
  status: CompanyStatus;
  audit_error: string;
  audited_at: string | null;
  created_at: string;
}

export interface NewCompany {
  name: string;
  website: string;
  domain: string;
  source: Company["source"];
  search_query?: string;
  address?: string;
  category?: string;
  rating?: number | null;
  rating_count?: number | null;
  phone?: string;
  emails?: string[];
  found_url?: string;
  found_title?: string;
  found_author?: string;
  found_at?: string | null;
  trigger_kind?: string;
  trigger_headline?: string;
  trigger_url?: string;
  trigger_at?: string | null;
}

/**
 * Parse pasted text or CSV into companies. Accepts one website per line,
 * "Name, website" lines, or a CSV with name/website(/email/phone) headers.
 */
export function parseCompanyList(text: string, source: "manual" | "csv"): { rows: NewCompany[]; skipped: string[] } {
  const rows: NewCompany[] = [];
  const skipped: string[] = [];
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const lines = parsed.data.map((r) => r.map((c) => (c ?? "").trim()));
  if (lines.length === 0) return { rows, skipped };

  const header = (lines[0] ?? []).map((h) => h.toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const hasHeader = col(["website", "url", "domain", "site"]) !== -1;
  const iSite = hasHeader ? col(["website", "url", "domain", "site"]) : -1;
  const iName = hasHeader ? col(["name", "company", "business", "company name"]) : -1;
  const iEmail = hasHeader ? col(["email", "e-mail"]) : -1;
  const iPhone = hasHeader ? col(["phone", "telephone", "tel"]) : -1;

  for (const cells of hasHeader ? lines.slice(1) : lines) {
    let siteRaw = "";
    let name = "";
    if (hasHeader) {
      siteRaw = cells[iSite] ?? "";
      name = iName >= 0 ? cells[iName] ?? "" : "";
    } else {
      // "website" or "Name, website" (the cell that looks like a URL wins).
      const urlCell = cells.find((c) => /\.[a-z]{2,}(\/|$)/i.test(c) && !c.includes(" "));
      siteRaw = urlCell ?? "";
      name = cells.find((c) => c !== urlCell) ?? "";
    }
    const norm = normaliseWebsite(siteRaw);
    if (!norm) {
      if (cells.join("").trim()) skipped.push(cells.join(", ").slice(0, 80));
      continue;
    }
    const email = iEmail >= 0 ? (cells[iEmail] ?? "").toLowerCase() : "";
    rows.push({
      name: name || nameFromDomain(norm.domain),
      website: norm.website,
      domain: norm.domain,
      source,
      phone: iPhone >= 0 ? cells[iPhone] ?? "" : "",
      emails: email.includes("@") ? [email] : [],
    });
  }
  // De-duplicate within the paste itself.
  const seen = new Set<string>();
  return { rows: rows.filter((r) => (seen.has(r.domain) ? false : (seen.add(r.domain), true))), skipped };
}

/** Insert, skipping companies already in the workspace. Returns how many were new. */
export async function addCompanies(supabase: SupabaseClient, orgId: string, rows: NewCompany[]): Promise<number> {
  if (rows.length === 0) return 0;
  const withSite = rows.filter((r) => r.domain);
  const noSite = rows.filter((r) => !r.domain);
  let added = 0;

  if (withSite.length) {
    const { data: existing } = await supabase.from("companies").select("domain").in("domain", withSite.map((r) => r.domain));
    const have = new Set((existing ?? []).map((e) => e.domain as string));
    const fresh = withSite.filter((r) => !have.has(r.domain)).map((r) => ({ ...r, org_id: orgId }));
    if (fresh.length) {
      const { data, error } = await supabase.from("companies").insert(fresh).select("id");
      if (error) throw new Error(error.message);
      added += data?.length ?? 0;
    }
  }
  if (noSite.length) {
    const { data: existing } = await supabase.from("companies").select("name").eq("domain", "");
    const have = new Set((existing ?? []).map((e) => (e.name as string).toLowerCase()));
    const fresh = noSite.filter((r) => !have.has(r.name.toLowerCase())).map((r) => ({ ...r, org_id: orgId }));
    if (fresh.length) {
      const { data, error } = await supabase.from("companies").insert(fresh).select("id");
      if (error) throw new Error(error.message);
      added += data?.length ?? 0;
    }
  }
  return added;
}

function triggerOf(c: { trigger_kind?: string; trigger_at?: string | null }): { kind: string; at: string | null } | null {
  return c.trigger_kind ? { kind: c.trigger_kind, at: c.trigger_at ?? null } : null;
}

async function orgServices(supabase: SupabaseClient, orgId: string): Promise<string[]> {
  const { data } = await supabase.from("orgs").select("services").eq("id", orgId).maybeSingle();
  return (data?.services as string[] | undefined) ?? [];
}

/** Audit one company and save flaws, contacts and score. */
async function auditOne(supabase: SupabaseClient, company: Company, services: string[]): Promise<void> {
  const now = new Date().toISOString();
  if (!company.website) {
    const flaws = [noWebsiteFlaw()];
    const { score, servicesMatched } = scoreCompany(flaws, services, Boolean(company.phone || company.emails.length), triggerOf(company));
    await supabase
      .from("companies")
      .update({ flaws, score, services_matched: servicesMatched, status: "audited", audit_error: "", audited_at: now })
      .eq("id", company.id);
    return;
  }
  try {
    const result = await auditWebsite(company.website);
    if (result.blocked) {
      await supabase
        .from("companies")
        .update({ status: "failed", audit_error: "This site asks crawlers not to visit (robots.txt), so it was not audited.", audited_at: now })
        .eq("id", company.id);
      return;
    }
    const emails = [...new Set([...company.emails, ...result.contacts.emails])].slice(0, 6);
    // Discovered companies are named after their domain; the site's own title
    // ("Waybill | Canada Post labels") usually has the real brand name.
    // Pick the title segment that looks like a brand, skipping generic ones.
    const GENERIC = /^(home|homepage|welcome|age check|index|official site|official website)$/i;
    const brand =
      result.pageTitle
        .split(/\s[|–—·•-]\s|:\s|\s·\s/)
        .map((p) => p.trim())
        .find((p) => p && !GENERIC.test(p)) ?? "";
    const name =
      company.name === nameFromDomain(company.domain) && brand.length >= 2 && brand.length <= 40 ? brand : company.name;
    const phone = company.phone || result.contacts.phones[0] || "";
    const { score, servicesMatched } = scoreCompany(result.flaws, services, emails.length > 0 || Boolean(phone), triggerOf(company));
    const { error } = await supabase
      .from("companies")
      .update({
        name,
        flaws: result.flaws,
        emails,
        phone,
        socials: { ...company.socials, ...result.contacts.socials },
        contact_page: result.contacts.contactPage || company.contact_page,
        score,
        services_matched: servicesMatched,
        status: "audited",
        audit_error: "",
        audited_at: now,
      })
      .eq("id", company.id);
    if (error) throw new Error(error.message);
  } catch (err) {
    await supabase
      .from("companies")
      .update({ status: "failed", audit_error: err instanceof Error ? err.message : "Audit failed", audited_at: now })
      .eq("id", company.id);
  }
}

/**
 * Audit the next batch of not-yet-audited companies. Small batches keep each
 * request well inside serverless time limits; the UI calls again until done.
 */
export async function auditPending(
  supabase: SupabaseClient,
  orgId: string,
  opts: { ids?: string[]; batch?: number } = {},
): Promise<{ audited: number; remaining: number }> {
  const batch = opts.batch ?? 6;
  let query = supabase.from("companies").select("*");
  query = opts.ids?.length ? query.in("id", opts.ids) : query.eq("status", "new");
  const { data, error } = await query.order("created_at").limit(batch);
  if (error) throw new Error(error.message);
  const companies = (data ?? []) as Company[];
  const services = await orgServices(supabase, orgId);

  // Three at a time: fast, and polite to the sites being visited.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, companies.length) }, async () => {
      while (next < companies.length) {
        const c = companies[next];
        next += 1;
        if (c) await auditOne(supabase, c, services);
      }
    }),
  );

  const { count } = await supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "new");
  return { audited: companies.length, remaining: opts.ids?.length ? 0 : count ?? 0 };
}

/** Re-score every audited company after the user changes their services. */
export async function rescoreAll(supabase: SupabaseClient, orgId: string): Promise<number> {
  const services = await orgServices(supabase, orgId);
  const { data, error } = await supabase.from("companies").select("id, flaws, emails, phone, trigger_kind, trigger_at").eq("status", "audited");
  if (error) throw new Error(error.message);
  let n = 0;
  for (const c of data ?? []) {
    const { score, servicesMatched } = scoreCompany(
      (c.flaws as Flaw[]) ?? [],
      services,
      ((c.emails as string[]) ?? []).length > 0 || Boolean(c.phone),
      triggerOf(c as { trigger_kind?: string; trigger_at?: string | null }),
    );
    await supabase.from("companies").update({ score, services_matched: servicesMatched }).eq("id", c.id);
    n += 1;
  }
  return n;
}

// ---------------------------------------------------------------- listing

export interface CompanyFilters {
  trigger: "" | "any" | "Funding" | "New executive" | "Hiring" | "Expansion";
  q: string;
  service: string;
  flaw: string;
  contact: "any" | "email" | "phone" | "none";
  minScore: number;
  status: CompanyStatus | "ready" | "all";
  sort: "score" | "recent";
}

type Params = URLSearchParams | Record<string, string | undefined>;
const get = (p: Params, k: string) => (p instanceof URLSearchParams ? p.get(k) ?? "" : p[k] ?? "");

export function parseCompanyFilters(p: Params): CompanyFilters {
  const contact = get(p, "contact");
  const status = get(p, "status");
  const minScore = Number(get(p, "minScore"));
  const trigger = get(p, "trigger");
  return {
    trigger: (["any", "Funding", "New executive", "Hiring", "Expansion"] as const).includes(trigger as never)
      ? (trigger as CompanyFilters["trigger"])
      : "",
    q: get(p, "q").slice(0, 100),
    service: get(p, "service").slice(0, 100),
    flaw: get(p, "flaw").slice(0, 40),
    contact: contact === "email" || contact === "phone" || contact === "none" ? contact : "any",
    minScore: Number.isFinite(minScore) ? Math.max(0, Math.min(100, minScore)) : 0,
    status: (["new", "audited", "failed", "contacted", "dismissed", "all"] as const).includes(status as CompanyStatus)
      ? (status as CompanyStatus | "all")
      : "ready",
    sort: get(p, "sort") === "recent" ? "recent" : "score",
  };
}

export function companyFiltersToQuery(f: CompanyFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.trigger) p.set("trigger", f.trigger);
  if (f.service) p.set("service", f.service);
  if (f.flaw) p.set("flaw", f.flaw);
  if (f.contact !== "any") p.set("contact", f.contact);
  if (f.minScore) p.set("minScore", String(f.minScore));
  if (f.status !== "ready") p.set("status", f.status);
  if (f.sort !== "score") p.set("sort", f.sort);
  return p.toString();
}

/** RLS limits rows to the signed-in user's workspace. */
export async function getCompanies(supabase: SupabaseClient, f: CompanyFilters, limit = 500): Promise<Company[]> {
  let query = supabase.from("companies").select("*");
  // "ready" = everything still worth looking at: audited, pending or failed.
  if (f.status === "ready") query = query.in("status", ["new", "audited", "failed"]);
  else if (f.status !== "all") query = query.eq("status", f.status);
  if (f.service) query = query.contains("services_matched", [f.service]);
  if (f.trigger === "any") query = query.neq("trigger_kind", "");
  else if (f.trigger) query = query.eq("trigger_kind", f.trigger);
  if (f.flaw) query = query.contains("flaws", [{ key: f.flaw }]);
  if (f.contact === "email") query = query.neq("emails", "{}");
  if (f.contact === "phone") query = query.neq("phone", "");
  if (f.contact === "none") query = query.eq("emails", "{}").eq("phone", "");
  if (f.minScore) query = query.gte("score", f.minScore);
  if (f.q.trim()) {
    const term = `%${f.q.trim().replace(/[%,()*\\]/g, " ")}%`;
    query = query.or(`name.ilike.${term},domain.ilike.${term},address.ilike.${term},category.ilike.${term}`);
  }
  query =
    f.sort === "recent"
      ? query.order("created_at", { ascending: false })
      : query.order("score", { ascending: false }).order("created_at", { ascending: false });
  const { data, error } = await query.limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Company[];
}

export async function getCompaniesByIds(supabase: SupabaseClient, ids: string[]): Promise<Company[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("companies").select("*").in("id", ids).order("score", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Company[];
}
