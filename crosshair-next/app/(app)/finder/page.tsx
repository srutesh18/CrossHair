import Link from "next/link";
import { Suspense } from "react";
import { Topbar } from "@/components/ui/Topbar";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ServicesSetup } from "@/components/finder/ServicesSetup";
import { CrawlPanel } from "@/components/finder/CrawlPanel";
import { FilterBar } from "@/components/finder/FilterBar";
import { LeadTable, type LeadRow } from "@/components/finder/LeadTable";
import { requireSession } from "@/lib/supabase/server";
import { CATEGORIES, CATEGORY_KEYS } from "@/lib/crawl/classify";
import { SOURCE_KEYS, SOURCE_LABEL } from "@/lib/crawl/run";
import { buyerForumsFor } from "@/lib/crawl/services";
import { filtersToQuery, getSignals, parseSignalFilters, type Signal } from "@/lib/crawl/signals";

export const dynamic = "force-dynamic";

interface OrgRow {
  services: string[] | null;
  competitors: string[] | null;
  icp: string | null;
  forum_urls: string[] | null;
  crawl_urls: string[] | null;
}

function toRow(s: Signal): LeadRow {
  return {
    id: s.id,
    intent: s.intent,
    categoryLabel: CATEGORIES[s.category]?.label ?? s.category,
    title: s.title,
    body: s.body,
    author: s.author,
    sourceLabel: SOURCE_LABEL[s.source] ?? s.source,
    sourceName: s.source_name,
    url: s.source_url,
    service: s.service ?? "",
    competitor: s.competitor,
    postedAt: s.posted_at,
    status: s.status,
    leadId: s.lead_id,
  };
}

export default async function FinderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const filters = parseSignalFilters(await searchParams);

  let org: OrgRow | null = null;
  let signals: Signal[] = [];
  let counts: Record<string, number> = {};
  let total = 0;
  let error: string | null = null;
  try {
    const { supabase, orgId } = await requireSession();
    const [orgRes, sig, countRes] = await Promise.all([
      supabase.from("orgs").select("services, competitors, icp, forum_urls, crawl_urls").eq("id", orgId).maybeSingle(),
      getSignals(supabase, filters),
      supabase.from("signals").select("category").eq("status", "new").limit(5000),
    ]);
    if (orgRes.error) throw new Error(orgRes.error.message);
    org = orgRes.data as OrgRow | null;
    signals = sig;
    for (const r of (countRes.data ?? []) as Array<{ category: string }>) {
      counts[r.category] = (counts[r.category] ?? 0) + 1;
      total += 1;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load leads";
  }

  const services = org?.services ?? [];
  const competitors = org?.competitors ?? [];
  const onboarding = !error && services.length === 0 && competitors.length === 0;
  const filtered = filtersToQuery({ ...filters, sort: "intent" }) !== "";

  return (
    <>
      <Topbar title="Find leads" tag={onboarding ? "step 1 of 2" : `${total} to review`}>
        {!onboarding && !error ? (
          <a href={`/api/export/signals?${filtersToQuery(filters)}`} className="ch-btn text-[13px]">
            Export all shown
          </a>
        ) : null}
      </Topbar>

      <div className="flex-1 overflow-y-auto p-5">
        {error ? (
          <ErrorState message={error} />
        ) : onboarding ? (
          <div className="mx-auto max-w-[640px]">
            <ServicesSetup onboarding initial={{ services, competitors, icp: org?.icp ?? "" }} />
          </div>
        ) : (
          <div className="space-y-3">
            <ServicesSetup onboarding={false} initial={{ services, competitors, icp: org?.icp ?? "" }} />
            <CrawlPanel
              forumCount={org?.forum_urls?.length ?? 0}
              crawlCount={org?.crawl_urls?.length ?? 0}
              hasBuyerForums={buyerForumsFor(services).length > 0}
            />

            {total > 0 ? (
              <div className="flex flex-wrap gap-1.5 text-[12px]">
                <Link
                  href={`/finder?${filtersToQuery({ ...filters, category: "all" })}`}
                  className="rounded-full border px-2.5 py-0.5"
                  style={
                    filters.category === "all"
                      ? { background: "var(--color-fg)", color: "var(--color-bg)", borderColor: "var(--color-fg)" }
                      : { borderColor: "var(--color-line)" }
                  }
                >
                  All <span style={{ fontFamily: "var(--font-mono)" }}>{total}</span>
                </Link>
                {CATEGORY_KEYS.filter((k) => counts[k]).map((k) => (
                  <Link
                    key={k}
                    href={`/finder?${filtersToQuery({ ...filters, category: k })}`}
                    className="rounded-full border px-2.5 py-0.5"
                    style={
                      filters.category === k
                        ? { background: "var(--color-fg)", color: "var(--color-bg)", borderColor: "var(--color-fg)" }
                        : { borderColor: "var(--color-line)" }
                    }
                  >
                    {CATEGORIES[k].label} <span style={{ fontFamily: "var(--font-mono)" }}>{counts[k]}</span>
                  </Link>
                ))}
              </div>
            ) : null}

            <Suspense>
              <FilterBar
                categories={CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORIES[k].label }))}
                sources={SOURCE_KEYS.map((k) => ({ value: k, label: SOURCE_LABEL[k] }))}
                services={services}
                competitors={competitors}
              />
            </Suspense>

            {signals.length === 0 ? (
              <EmptyState
                title={filtered ? "No leads match these filters" : "No leads yet"}
                hint={filtered ? "Clear a filter or lower the minimum intent." : "Click Find leads to search public communities for people who need what you sell."}
              />
            ) : (
              <Suspense>
                <LeadTable rows={signals.map(toRow)} />
              </Suspense>
            )}
            <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>
              Public posts only. Intent is highest for people asking to hire or buy, or to switch away
              from a competitor. Tick leads to export them or (soon) reach out by email, call or LinkedIn.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
