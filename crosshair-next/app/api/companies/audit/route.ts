import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { auditPending } from "@/lib/companies";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ ids: z.array(z.string().uuid()).max(20).optional() });

/**
 * Audit the next small batch (or the given companies). The page calls this
 * repeatedly until `remaining` is 0, showing progress as it goes.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const result = await auditPending(supabase, orgId, { ids: parsed.data.ids, batch: 6 });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
