import Link from "next/link";
import { Topbar } from "@/components/ui/Topbar";
import { ExportMenu } from "@/components/export/ExportMenu";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { TierPill } from "@/components/leads/Score";
import { requireSession } from "@/lib/supabase/server";
import { getLeads } from "@/lib/leads";
import type { LeadWithDetail, Tier } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLUMNS: Array<{ tier: Tier; title: string; note: string }> = [
  { tier: "HOT", title: "Hot", note: "All three Strong. Email drafted." },
  { tier: "WARM", title: "Warm", note: "One Fair. Softer email." },
  { tier: "HOLD", title: "Hold", note: "No email. Watching." },
];

function Card({ lead }: { lead: LeadWithDetail }) {
  return (
    <Link href={`/signals?lead=${lead.id}`} className="ch-card mb-2 block transition hover:border-current">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <b className="block truncate text-sm">{lead.name}</b>
          <small className="block truncate" style={{ color: "var(--color-muted)" }}>
            {lead.company_name || "Unknown company"}
          </small>
        </div>
        <TierPill tier={lead.tier} />
      </div>
      {lead.scores ? (
        <p className="mt-2 line-clamp-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
          {lead.scores.pain.reason}
        </p>
      ) : null}
    </Link>
  );
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  let leads: LeadWithDetail[] = [];
  let error: string | null = null;
  try {
    const { supabase } = await requireSession();
    leads = await getLeads(supabase, { tier: "ALL", q });
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the pipeline";
  }

  return (
    <>
      <Topbar title="Pipeline" tag={`${leads.length} leads`}>
        <ExportMenu tier="ALL" q={q} />
      </Topbar>

      <div className="flex-1 overflow-y-auto p-5">
        {error ? (
          <ErrorState message={error} />
        ) : leads.length === 0 ? (
          <EmptyState
            title="No leads yet"
            hint="Run a scan from Radar to pull real public complaints, or paste one in Signals."
            action={
              <Link href="/radar" className="ch-btn ch-btn-primary">
                Go to Radar
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {COLUMNS.map((col) => {
              const items = leads.filter((l) => l.tier === col.tier);
              return (
                <section key={col.tier} className="min-w-0">
                  <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--color-muted)" }}>
                    {col.title}
                    <span style={{ fontFamily: "var(--font-mono)" }}>{items.length}</span>
                  </h2>
                  <p className="mb-3 text-[12px]" style={{ color: "var(--color-muted)" }}>
                    {col.note}
                  </p>
                  {items.length === 0 ? (
                    <div
                      className="rounded-[12px] border border-dashed px-4 py-8 text-center text-[13px]"
                      style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}
                    >
                      Nothing here yet
                    </div>
                  ) : (
                    items.map((lead) => <Card key={lead.id} lead={lead} />)
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
