import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { DISCOVERY_SOURCES, runDiscovery } from "@/lib/discovery";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 180;

const Body = z.object({
  sources: z.array(z.enum(DISCOVERY_SOURCES)).min(1).default([...DISCOVERY_SOURCES]),
});

/** Automatic scan: find companies in public posts, add them for auditing. */
export async function POST(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid sources." }, { status: 400 });
    return NextResponse.json(await runDiscovery(supabase, orgId, parsed.data.sources));
  } catch (err) {
    return errorResponse(err);
  }
}
