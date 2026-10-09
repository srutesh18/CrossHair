import { Topbar } from "@/components/ui/Topbar";
import { ErrorState } from "@/components/ui/States";
import { ScanPanel } from "@/components/leads/ScanPanel";
import { requireSession } from "@/lib/supabase/server";
import { getLeads } from "@/lib/leads";
import type { LeadWithDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  let leads: LeadWithDetail[] = [];
  let competitors: string[] = [];
  let error: string | null = null;

  try {
    const { supabase, orgId } = await requireSession();
    leads = await getLeads(supabase, {});
    const { data: org } = await supabase
      .from("orgs")
      .select("competitors")
      .eq("id", orgId)
      .maybeSingle();
    competitors = (org?.competitors as string[] | undefined) ?? [];
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the radar";
  }

  const counts = {
    total: leads.length,
    hot: leads.filter((l) => l.tier === "HOT").length,
    warm: leads.filter((l) => l.tier === "WARM").length,
    hold: leads.filter((l) => l.tier === "HOLD").length,
  };

  return (
    <>
      <Topbar title="Radar" tag="live sources" />
      <div className="flex-1 overflow-y-auto p-5">
        {error ? (
          <ErrorState message={error} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Leads", counts.total],
                  ["Hot", counts.hot],
                  ["Warm", counts.warm],
                  ["Hold", counts.hold],
                ].map(([label, value]) => (
                  <div key={label as string} className="ch-card">
                    <b className="block text-2xl leading-none font-semibold">{value}</b>
                    <span className="text-[12px]" style={{ color: "var(--color-muted)" }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <ScanPanel />
            </div>

            <aside className="space-y-4">
              <div className="ch-card">
                <h2 className="ch-label mb-2">Sources</h2>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between">
                    <span>Reddit search (RSS)</span>
                    <span className="ch-tag">live</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Hacker News search</span>
                    <span className="ch-tag">live</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Google News RSS</span>
                    <span className="ch-tag">live</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Public company pages</span>
                    <span className="ch-tag">on demand</span>
                  </li>
                </ul>
                <p className="mt-3 text-[12px]" style={{ color: "var(--color-muted)" }}>
                  Public data only. No LinkedIn, nothing behind a login, and no sample data: if a
                  source fails the scan says so.
                </p>
              </div>

              <div className="ch-card">
                <h2 className="ch-label mb-2">Watching</h2>
                {competitors.length === 0 ? (
                  <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>
                    No competitors set. Add them in Setup to focus the scan.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {competitors.map((c) => (
                      <span key={c} className="ch-tag">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
