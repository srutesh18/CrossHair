import Link from "next/link";
import { Topbar } from "@/components/ui/Topbar";
import { ExportMenu } from "@/components/export/ExportMenu";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { TierPill } from "@/components/leads/Score";
import { requireSession } from "@/lib/supabase/server";
import { getLeads } from "@/lib/leads";
import type { LeadWithDetail, Tier } from "@/lib/types";

export const dynamic = "force-dynamic";

interface CompanyGroup {
  company: string;
  leads: LeadWithDetail[];
  best: Tier | null;
}

const RANK: Record<Tier, number> = { HOT: 0, WARM: 1, HOLD: 2 };

function groupByCompany(leads: LeadWithDetail[]): CompanyGroup[] {
  const map = new Map<string, LeadWithDetail[]>();
  for (const lead of leads) {
    const key = lead.company_name || "Unknown company";
    map.set(key, [...(map.get(key) ?? []), lead]);
  }
  return [...map.entries()]
    .map(([company, items]) => {
      const tiers = items.map((i) => i.tier).filter((t): t is Tier => t !== null);
      const best = tiers.sort((a, b) => RANK[a] - RANK[b])[0] ?? null;
      return { company, leads: items, best };
    })
    .sort((a, b) => (RANK[a.best ?? "HOLD"] ?? 3) - (RANK[b.best ?? "HOLD"] ?? 3));
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string }>;
}) {
  const { q = "", tier: tierRaw } = await searchParams;
  const tier: Tier | "ALL" =
    tierRaw === "HOT" || tierRaw === "WARM" || tierRaw === "HOLD" ? tierRaw : "ALL";

  let groups: CompanyGroup[] = [];
  let total = 0;
  let error: string | null = null;
  try {
    const { supabase } = await requireSession();
    const leads = await getLeads(supabase, { tier, q });
    total = leads.length;
    groups = groupByCompany(leads);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load companies";
  }

  return (
    <>
      <Topbar title="Companies" tag={`${groups.length} companies`}>
        <ExportMenu tier={tier} q={q} />
      </Topbar>

      <div className="flex-1 overflow-y-auto p-5">
        <form className="mb-4 flex flex-wrap items-center gap-2" action="/companies">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search company, name or competitor"
            className="ch-input max-w-[280px]"
            aria-label="Search companies"
          />
          <select name="tier" defaultValue={tier} className="ch-input max-w-[140px]" aria-label="Filter by tier">
            <option value="ALL">All tiers</option>
            <option value="HOT">Hot</option>
            <option value="WARM">Warm</option>
            <option value="HOLD">Hold</option>
          </select>
          <button type="submit" className="ch-btn">
            Apply
          </button>
          <span className="ch-label">Exports follow these filters</span>
        </form>

        {error ? (
          <ErrorState message={error} />
        ) : groups.length === 0 ? (
          <EmptyState
            title={q || tier !== "ALL" ? "No companies match those filters" : "No companies yet"}
            hint={
              q || tier !== "ALL"
                ? "Clear the search or pick a different tier."
                : "Run a scan from Radar to find real public complaints."
            }
            action={
              <Link href="/radar" className="ch-btn ch-btn-primary">
                Go to Radar
              </Link>
            }
          />
        ) : (
          <>
            <p className="mb-3 text-[13px]" style={{ color: "var(--color-muted)" }}>
              {total} lead{total === 1 ? "" : "s"} across {groups.length} compan
              {groups.length === 1 ? "y" : "ies"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => (
                <article key={g.company} className="ch-card">
                  <div className="mb-2 flex items-center gap-2">
                    <b className="min-w-0 flex-1 truncate">{g.company}</b>
                    <TierPill tier={g.best} />
                  </div>
                  <ul className="space-y-1">
                    {g.leads.map((lead) => (
                      <li key={lead.id} className="truncate text-[13px]">
                        <Link href={`/signals?lead=${lead.id}`} className="hover:underline">
                          {lead.name}
                        </Link>
                        <span style={{ color: "var(--color-muted)" }}>
                          {lead.role ? ` · ${lead.role}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
