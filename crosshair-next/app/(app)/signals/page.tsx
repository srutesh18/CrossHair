import Link from "next/link";
import { Topbar } from "@/components/ui/Topbar";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ScoreTrio, TierPill } from "@/components/leads/Score";
import { LeadActions } from "@/components/leads/LeadActions";
import { AddComplaint } from "@/components/leads/AddComplaint";
import { DraftCard } from "@/components/leads/DraftCard";
import { LeadSettings } from "@/components/leads/LeadSettings";
import { requireSession } from "@/lib/supabase/server";
import { getLeads } from "@/lib/leads";
import type { LeadWithDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

function Drafts({ lead }: { lead: LeadWithDetail }) {
  if (lead.tier === "HOLD") {
    return (
      <div
        className="flex items-center gap-3 rounded-[14px] border border-dashed p-5 text-sm"
        style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}
      >
        <div>
          <b style={{ color: "var(--color-fg)" }}>On hold. No email.</b>
          <br />
          Crosshair is watching {lead.company_name || "this company"} for a real trigger.
        </div>
      </div>
    );
  }
  if (lead.drafts.length === 0) {
    return (
      <EmptyState
        title="No drafts yet"
        hint="Draft the Day 0, Day 3 and Day 7 emails, grounded in your product docs."
      />
    );
  }
  const flagged = lead.drafts[0]?.flagged_claims ?? [];
  return (
    <div className="space-y-3">
      {flagged.length > 0 ? (
        <div
          className="rounded-[9px] px-3 py-2 text-sm"
          style={{ background: "var(--color-amber-bg)", color: "var(--color-amber)" }}
        >
          <b>Second pass flagged {flagged.length} claim{flagged.length === 1 ? "" : "s"}:</b>
          <ul className="mt-1 list-inside list-disc">
            {flagged.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {lead.drafts
        .slice()
        .sort((a, b) => a.day - b.day)
        .map((d) => (
          <DraftCard key={`${d.id}-${d.edited_at ?? ""}`} draft={d} />
        ))}
    </div>
  );
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead: selectedId } = await searchParams;

  let leads: LeadWithDetail[] = [];
  let error: string | null = null;
  try {
    const { supabase } = await requireSession();
    leads = await getLeads(supabase, {});
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load signals";
  }

  const selected = leads.find((l) => l.id === selectedId) ?? leads[0] ?? null;

  return (
    <>
      <Topbar title="Signals" tag={`${leads.length} leads`}>
        <AddComplaint />
      </Topbar>

      <div className="flex-1 overflow-hidden">
        {error ? (
          <div className="p-5">
            <ErrorState message={error} />
          </div>
        ) : leads.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No signals yet"
              hint="Run a scan from Radar, or paste a public complaint with Add complaint."
              action={
                <Link href="/radar" className="ch-btn ch-btn-primary">
                  Go to Radar
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid h-full lg:grid-cols-[340px_minmax(0,1fr)]">
            <nav
              className="max-h-full overflow-y-auto border-r"
              style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
            >
              {leads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/signals?lead=${lead.id}`}
                  aria-current={selected?.id === lead.id ? "true" : undefined}
                  className="flex items-center gap-2 border-b px-4 py-3 transition"
                  style={{
                    borderColor: "var(--color-line)",
                    background:
                      selected?.id === lead.id ? "var(--color-brand-soft)" : "transparent",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{lead.name}</b>
                    <small className="block truncate" style={{ color: "var(--color-muted)" }}>
                      {lead.company_name}
                    </small>
                  </div>
                  <TierPill tier={lead.tier} />
                </Link>
              ))}
            </nav>

            <section className="max-h-full overflow-y-auto p-5">
              {selected ? (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-semibold tracking-tight">{selected.name}</h2>
                      <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                        {[selected.role, selected.company_name].filter(Boolean).join(" at ")}
                      </p>
                    </div>
                    <TierPill tier={selected.tier} />
                  </div>

                  <blockquote className="ch-card mb-3">
                    <p className="text-[17px] leading-snug">&ldquo;{selected.said}&rdquo;</p>
                    <footer className="mt-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
                      {selected.source_name}
                      {selected.competitor ? ` · about ${selected.competitor}` : ""}
                      {selected.source_url ? (
                        <>
                          {" · "}
                          <a
                            href={selected.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                            style={{ color: "var(--color-brand)" }}
                          >
                            View source
                          </a>
                        </>
                      ) : null}
                    </footer>
                  </blockquote>

                  {selected.scores ? (
                    <div className="mb-3">
                      <ScoreTrio scores={selected.scores} crossCheck={selected.crossCheck} />
                      {selected.scorePass === "refined" && selected.scoreNote ? (
                        <p className="mt-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
                          <b>Second pass:</b> {selected.scoreNote}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mb-3">
                      <EmptyState title="Not scored yet" hint="Score this lead to get a tier." />
                    </div>
                  )}

                  <LeadActions lead={selected} />
                  <LeadSettings key={selected.id} id={selected.id} contactEmail={selected.contact_email} />
                  <div className="mt-4">
                    <Drafts lead={selected} />
                  </div>
                </>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
