import { Suspense } from "react";
import { Topbar } from "@/components/ui/Topbar";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ServicesSetup } from "@/components/clients/ServicesSetup";
import { AddCompanies } from "@/components/clients/AddCompanies";
import { ScanHub } from "@/components/clients/ScanHub";
import { CompanyFilters } from "@/components/clients/CompanyFilters";
import { CompanyTable, type CompanyRow } from "@/components/clients/CompanyTable";
import { requireSession } from "@/lib/supabase/server";
import { companyFiltersToQuery, getCompanies, parseCompanyFilters, type Company } from "@/lib/companies";
import { AREA_LABEL, type Area } from "@/lib/audit/checks";
import { placesEnabled } from "@/lib/sources/places";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Flaw filter options: the checks the auditor can report. */
const FLAW_OPTIONS = [
  ["no_website", "No website"],
  ["site_down", "Website down"],
  ["no_https", "No HTTPS"],
  ["not_mobile", "Not mobile-friendly"],
  ["slow", "Slow homepage"],
  ["pagespeed", "Poor mobile performance"],
  ["stale", "Looks unmaintained"],
  ["broken_links", "Broken links"],
  ["outdated_tech", "Outdated build"],
  ["no_contact", "Hard to contact"],
  ["no_title", "No page title"],
  ["no_meta_description", "No meta description"],
  ["no_h1", "No main heading"],
  ["noindex", "Hidden from Google"],
  ["no_booking", "No online booking"],
  ["no_chat", "No chat"],
  ["no_portal", "No customer portal"],
].map(([value, label]) => ({ value: value as string, label: label as string }));

function toRow(c: Company): CompanyRow {
  const flaws = [...(c.flaws ?? [])].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return {
    id: c.id,
    name: c.name,
    website: c.website,
    domain: c.domain,
    category: c.category,
    address: c.address,
    rating: c.rating,
    ratingCount: c.rating_count,
    score: c.score,
    flaws: flaws.map((f) => ({ ...f, areaLabel: AREA_LABEL[f.area as Area] ?? f.area })),
    services: c.services_matched ?? [],
    emails: c.emails ?? [],
    phone: c.phone,
    contactPage: c.contact_page,
    socials: c.socials ?? {},
    status: c.status,
    auditError: c.audit_error,
    source: c.source,
    foundUrl: c.found_url ?? "",
    foundTitle: c.found_title ?? "",
    foundAuthor: c.found_author ?? "",
  };
}

export default async function FindClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const filters = parseCompanyFilters(await searchParams);

  let services: string[] = [];
  let icp = "";
  let companies: Company[] = [];
  let pending = 0;
  let stats = { total: 0, withEmail: 0, strong: 0 };
  let blips: Array<{ id: string; name: string; domain: string; score: number }> = [];
  let lastScan: string | null = null;
  let everScanned = false;
  let error: string | null = null;
  try {
    const { supabase, orgId } = await requireSession();
    const [orgRes, list, pendingRes, statsRes, radarRes, runRes] = await Promise.all([
      supabase.from("orgs").select("services, icp").eq("id", orgId).maybeSingle(),
      getCompanies(supabase, filters),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("companies").select("score, emails").in("status", ["audited"]).limit(5000),
      supabase
        .from("companies")
        .select("id, name, domain, score, status")
        .in("status", ["new", "audited"])
        .order("score", { ascending: false })
        .limit(160),
      supabase
        .from("crawl_runs")
        .select("finished_at, started_at")
        .eq("query", "auto-discovery")
        .order("started_at", { ascending: false })
        .limit(1),
    ]);
    blips = ((radarRes.data ?? []) as Array<{ id: string; name: string; domain: string; score: number; status: string }>).map((b) => ({
      id: b.id,
      name: b.name || b.domain,
      domain: b.domain,
      score: b.status === "new" ? -1 : b.score,
    }));
    const lastRun = (runRes.data ?? [])[0] as { finished_at: string | null; started_at: string } | undefined;
    lastScan = lastRun ? lastRun.finished_at ?? lastRun.started_at : null;
    everScanned = Boolean(lastRun);
    if (orgRes.error) throw new Error(orgRes.error.message);
    services = (orgRes.data?.services as string[] | undefined) ?? [];
    icp = (orgRes.data?.icp as string | undefined) ?? "";
    companies = list;
    pending = pendingRes.count ?? 0;
    const rows = (statsRes.data ?? []) as Array<{ score: number; emails: string[] }>;
    stats = {
      total: rows.length,
      withEmail: rows.filter((r) => r.emails?.length).length,
      strong: rows.filter((r) => r.score >= 60).length,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load companies";
  }

  const onboarding = !error && services.length === 0;
  const filtered = companyFiltersToQuery({ ...filters, sort: "score" }) !== "";

  return (
    <>
      <Topbar title="Find clients" tag={onboarding ? "step 1 of 2" : `${stats.total} audited`}>
        {!onboarding && !error ? (
          <a href={`/api/export/companies?${companyFiltersToQuery(filters)}`} className="ch-btn text-[13px]">
            Export all shown
          </a>
        ) : null}
      </Topbar>

      <div className="flex-1 overflow-y-auto p-5">
        {error ? (
          <ErrorState message={error} />
        ) : onboarding ? (
          <div className="mx-auto max-w-[640px]">
            <ServicesSetup onboarding initial={{ services, icp }} />
          </div>
        ) : (
          <div className="space-y-3">
            <ScanHub
              blips={blips}
              services={services}
              pending={pending}
              lastScan={lastScan}
              autoStart={!everScanned && blips.length === 0}
            />
            <ServicesSetup onboarding={false} initial={{ services, icp }} />
            <details className="group">
              <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: "var(--color-brand)" }}>
                Know a company already? Add its website yourself
              </summary>
              <div className="mt-2">
                <AddCompanies googleEnabled={placesEnabled()} />
              </div>
            </details>

            {stats.total > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Audited", stats.total],
                  ["With an email", stats.withEmail],
                  ["Score 60+", stats.strong],
                ].map(([label, value]) => (
                  <div key={label as string} className="ch-card py-3">
                    <b className="block text-xl leading-none font-semibold">{value}</b>
                    <span className="text-[12px]" style={{ color: "var(--color-muted)" }}>{label}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <Suspense>
              <CompanyFilters services={services} flaws={FLAW_OPTIONS} />
            </Suspense>

            {companies.length === 0 ? (
              <EmptyState
                title={filtered ? "No companies match these filters" : "No companies yet"}
                hint={
                  filtered
                    ? "Clear a filter or lower the minimum score."
                    : "Press Scan now: Crosshair finds business owners sharing their websites on Reddit, Hacker News and community forums, then audits each one."
                }
              />
            ) : (
              <Suspense>
                <CompanyTable rows={companies.map(toRow)} />
              </Suspense>
            )}
            <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>
              Public posts and websites only; sites that ask crawlers to stay away (robots.txt) are skipped. Score = how much
              of what&apos;s wrong your services fix, +10 when there&apos;s a public way to reach them. Click a row for every flaw and its evidence.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
