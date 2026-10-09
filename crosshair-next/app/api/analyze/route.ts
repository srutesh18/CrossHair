import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { analyzeComplaint } from "@/lib/ai";
import { orgIcp, qualifyNewLead } from "@/lib/pipeline";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  said: z.string().trim().min(1, "Paste a complaint first.").max(5000),
  who: z.string().max(300).default(""),
  sourceName: z.string().max(200).default("Pasted manually"),
  sourceUrl: z.union([z.literal(""), z.string().url("The source link must be a full URL")]).default(""),
});

/** Paste a complaint -> extract, find the real trigger, score, save. */
export async function POST(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const input = parsed.data;

    const facts = await analyzeComplaint(input);
    const lead = await qualifyNewLead(supabase, orgId, {
      facts,
      fallbackName: input.who.split(",")[0]?.trim() ?? "",
      said: input.said,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      icp: await orgIcp(supabase, orgId),
    });

    return NextResponse.json({
      lead: { id: lead.id, name: lead.name, company: lead.company },
      scores: lead.scored.scores,
      tier: lead.tier,
      trigger: lead.trigger,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
