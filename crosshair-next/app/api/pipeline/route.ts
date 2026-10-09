import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { addToPipeline } from "@/lib/outreach";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({ companyIds: z.array(z.string().uuid()).min(1).max(500) });

/** Add selected companies from the Radar to the outreach pipeline. */
export async function POST(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Select at least one company." }, { status: 400 });
    const added = await addToPipeline(supabase, orgId, parsed.data.companyIds);
    return NextResponse.json({ added, already: parsed.data.companyIds.length - added });
  } catch (err) {
    return errorResponse(err);
  }
}
