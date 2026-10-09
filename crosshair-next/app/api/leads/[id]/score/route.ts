import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { getLead } from "@/lib/leads";
import { rescoreLead } from "@/lib/pipeline";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Re-score a lead against a fresh trigger lookup. */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, orgId } = await requireSession();

    const lead = await getLead(supabase, id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const { scored, news } = await rescoreLead(supabase, orgId, lead);
    // Drafts written for a lead that is now Hold must not linger.
    if (scored.tier === "HOLD") await supabase.from("email_drafts").delete().eq("lead_id", id);

    return NextResponse.json({ id, scores: scored.scores, tier: scored.tier, news });
  } catch (err) {
    return errorResponse(err);
  }
}
