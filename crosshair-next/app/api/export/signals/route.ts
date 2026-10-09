import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { requireSession } from "@/lib/supabase/server";
import { z } from "zod";
import { getSignals, getSignalsByIds, parseSignalFilters, type Signal } from "@/lib/crawl/signals";
import { CATEGORIES } from "@/lib/crawl/classify";
import { SOURCE_LABEL } from "@/lib/crawl/run";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

function toCsv(signals: Signal[]): NextResponse {
  const csv = Papa.unparse(
    {
      fields: ["Intent", "Category", "Service", "Competitor", "Source", "Posted", "Author", "Title", "Text", "Link", "Status"],
      data: signals.map((s) => [
        s.intent,
        CATEGORIES[s.category]?.label ?? s.category,
        s.service,
        s.competitor,
        SOURCE_LABEL[s.source] ?? s.source,
        s.posted_at ? s.posted_at.slice(0, 10) : "",
        s.author,
        s.title,
        s.body,
        s.source_url,
        s.status,
      ]),
    },
    { quotes: true, newline: "\r\n" },
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="crosshair-leads-${stamp}.csv"`,
    },
  });
}

/** CSV of the lead list, with exactly the filters on screen. */
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const filters = parseSignalFilters(request.nextUrl.searchParams);
    return toCsv(await getSignals(supabase, filters, 2000));
  } catch (err) {
    return errorResponse(err);
  }
}

const Selected = z.object({ ids: z.array(z.string().uuid()).min(1).max(2000) });

/** CSV of just the rows the user ticked. */
export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const parsed = Selected.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Select at least one lead." }, { status: 400 });
    return toCsv(await getSignalsByIds(supabase, parsed.data.ids));
  } catch (err) {
    return errorResponse(err);
  }
}
