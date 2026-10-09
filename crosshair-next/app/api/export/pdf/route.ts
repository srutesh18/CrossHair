import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { getLeads, parseFilters } from "@/lib/leads";
import { toPdf } from "@/lib/export/pdf";
import { exportFilename, toExportRows } from "@/lib/export/rows";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const filters = parseFilters(request.nextUrl.searchParams);
    const leads = await getLeads(supabase, filters);
    const scope = filters.tier && filters.tier !== "ALL" ? `${filters.tier} only` : "All tiers";
    const buffer = await toPdf(toExportRows(leads), scope);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${exportFilename("pdf", filters.tier)}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
