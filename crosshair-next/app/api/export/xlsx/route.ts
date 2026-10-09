import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { getLeads, parseFilters } from "@/lib/leads";
import { toXlsx } from "@/lib/export/xlsx";
import { exportFilename, toExportRows } from "@/lib/export/rows";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const filters = parseFilters(request.nextUrl.searchParams);
    const leads = await getLeads(supabase, filters);
    const buffer = await toXlsx(toExportRows(leads));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename("xlsx", filters.tier)}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
