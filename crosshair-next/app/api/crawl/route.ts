import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { DEFAULT_SOURCES, runCrawl, SOURCE_KEYS } from "@/lib/crawl/run";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  query: z.string().max(200).default(""),
  sources: z.array(z.enum(SOURCE_KEYS)).min(1, "Pick at least one source").default(DEFAULT_SOURCES),
  perSource: z.number().int().min(5).max(50).default(25),
});

/** Crawl public sources into the Lead Finder. No AI generation needed. */
export async function POST(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const result = await runCrawl(supabase, orgId, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
