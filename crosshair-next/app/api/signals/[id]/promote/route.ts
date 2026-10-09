import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { analyzeComplaint } from "@/lib/ai";
import { orgIcp, qualifyNewLead, scoreSignalWithoutGroq, type SignalForScoring } from "@/lib/pipeline";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Turn a crawled signal into a scored lead with Pain/Fit/Trigger and a tier.
 * Uses Groq when it works; otherwise rules + Typesafe AI, so scoring never
 * depends on one provider.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, orgId } = await requireSession();
    const { data: signal, error } = await supabase.from("signals").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!signal) return NextResponse.json({ error: "Signal not found." }, { status: 404 });
    if (signal.lead_id) return NextResponse.json({ leadId: signal.lead_id, already: true });

    const scoreWithoutGroq = () => scoreSignalWithoutGroq(supabase, orgId, signal as SignalForScoring);

    let lead;
    if (!process.env.GROQ_API_KEY) {
      lead = await scoreWithoutGroq();
    } else {
      try {
        const said = [signal.title, signal.body].filter(Boolean).join(". ").slice(0, 5000);
        const facts = await analyzeComplaint({
          said,
          who: signal.author as string,
          sourceName: signal.source_name as string,
          sourceUrl: signal.source_url as string,
        });
        if (!facts.competitor && signal.competitor) facts.competitor = signal.competitor as string;
        lead = await qualifyNewLead(supabase, orgId, {
          facts,
          fallbackName: signal.author as string,
          said,
          sourceName: signal.source_name as string,
          sourceUrl: signal.source_url as string,
          sourceAt: signal.posted_at as string | null,
          icp: await orgIcp(supabase, orgId),
        });
      } catch (err) {
        // Groq unavailable (bad key, rate limit, timeout): score without it
        // rather than leave the user stuck. Duplicates are a real error.
        if (err instanceof Error && /already a lead/.test(err.message)) throw err;
        console.warn("[crosshair] Groq scoring failed, using rules + Typesafe:", err instanceof Error ? err.message : err);
        lead = await scoreWithoutGroq();
      }
    }

    await supabase.from("signals").update({ status: "promoted", lead_id: lead.id }).eq("id", id);
    return NextResponse.json({ leadId: lead.id, tier: lead.tier });
  } catch (err) {
    return errorResponse(err);
  }
}
