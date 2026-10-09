import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { getLeads, parseFilters } from "@/lib/leads";
import { toCsv } from "@/lib/export/csv";
import { exportFilename, toExportRows } from "@/lib/export/rows";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const filters = parseFilters(request.nextUrl.searchParams);
    const leads = await getLeads(supabase, filters);
    const csv = toCsv(toExportRows(leads));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename("csv", filters.tier)}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
