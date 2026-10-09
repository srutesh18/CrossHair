import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { getCompanies, getCompaniesByIds, parseCompanyFilters, type Company } from "@/lib/companies";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

function toCsv(companies: Company[]): NextResponse {
  const csv = Papa.unparse(
    {
      fields: ["Company", "Website", "Score", "Fixes with", "Top flaws", "Email", "Other emails", "Phone", "Contact page", "LinkedIn", "Address", "Category", "Status"],
      data: companies.map((c) => [
        c.name,
        c.website,
        c.score,
        c.services_matched.join("; "),
        c.flaws
          .slice()
          .sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity))
          .slice(0, 4)
          .map((f) => `${f.title}: ${f.evidence}`)
          .join(" | "),
        c.emails[0] ?? "",
        c.emails.slice(1).join("; "),
        c.phone,
        c.contact_page,
        c.socials.linkedin ?? "",
        c.address,
        c.category,
        c.status,
      ]),
    },
    { quotes: true, newline: "\r\n" },
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="crosshair-companies-${stamp}.csv"`,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    return toCsv(await getCompanies(supabase, parseCompanyFilters(request.nextUrl.searchParams), 5000));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) }).safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Select at least one company." }, { status: 400 });
    return toCsv(await getCompaniesByIds(supabase, parsed.data.ids));
  } catch (err) {
    return errorResponse(err);
  }
}
