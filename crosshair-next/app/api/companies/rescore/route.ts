import { NextResponse } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { rescoreAll } from "@/lib/companies";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

/** Recompute scores after the user changes the services they sell. */
export async function POST() {
  try {
    const { supabase, orgId } = await requireSession();
    return NextResponse.json({ rescored: await rescoreAll(supabase, orgId) });
  } catch (err) {
    return errorResponse(err);
  }
}
