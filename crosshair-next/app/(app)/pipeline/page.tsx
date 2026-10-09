import Link from "next/link";
import { Topbar } from "@/components/ui/Topbar";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { PipelineBoard, type PipelineCard } from "@/components/pipeline/PipelineBoard";
import { requireSession } from "@/lib/supabase/server";
import { columnOf, getPipeline, type OutreachRow } from "@/lib/outreach";
import { sendingEnabled } from "@/lib/send";

export const dynamic = "force-dynamic";

const SEV = { high: 0, medium: 1, low: 2 } as const;

function toCard(r: OutreachRow): PipelineCard {
  const c = r.company;
  return {
    id: r.id,
    column: columnOf(r),
    stage: r.stage,
    nextStep: r.next_step,
    nextActionAt: r.next_action_at,
    notes: r.notes,
    company: {
      name: c.name || c.domain,
      domain: c.domain,
      website: c.website,
      score: c.score,
      emails: c.emails ?? [],
      phone: c.phone,
      contactPage: c.contact_page,
      foundUrl: c.found_url ?? "",
      triggerKind: c.trigger_kind ?? "",
      triggerHeadline: c.trigger_headline ?? "",
      topFlaws: [...(c.flaws ?? [])].sort((a, b) => SEV[a.severity] - SEV[b.severity]).slice(0, 3).map((f) => f.title),
    },
    emails: r.emails.map((e) => ({ id: e.id, step: e.step, to: e.to_email, subject: e.subject, body: e.body, method: e.method, sentAt: e.sent_at })),
  };
}

export default async function PipelinePage() {
  let cards: PipelineCard[] = [];
  let error: string | null = null;
  try {
    const { supabase } = await requireSession();
    cards = (await getPipeline(supabase)).filter((r) => r.company).map(toCard);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the pipeline";
  }
  const due = cards.filter((c) => c.column === "due").length;

  return (
    <>
      <Topbar title="Pipeline" subtitle="Write, send and follow up. Day 0, 3 and 7." tag={due ? `${due} follow-up${due === 1 ? "" : "s"} due` : `${cards.length} companies`}>
        <Link href="/finder" className="ch-btn text-[13px]">Add from Radar</Link>
      </Topbar>
      <div className="flex-1 overflow-y-auto p-5">
        {error ? (
          <ErrorState message={error} />
        ) : cards.length === 0 ? (
          <EmptyState
            title="Your pipeline is empty"
            hint="On the Radar, tick the companies you want to reach and press Add to pipeline. Each one gets a ready-written email from its audit and news, with Day 3 and Day 7 follow-ups."
            action={<Link href="/finder" className="ch-btn ch-btn-primary">Go to Radar</Link>}
          />
        ) : (
          <PipelineBoard cards={cards} smtp={sendingEnabled()} />
        )}
      </div>
    </>
  );
}
