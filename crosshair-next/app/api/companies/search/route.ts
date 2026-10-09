import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { addCompanies, type NewCompany } from "@/lib/companies";
import { normaliseWebsite } from "@/lib/audit/url";
import { searchPlaces } from "@/lib/sources/places";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  query: z.string().trim().min(2, "What kind of business? e.g. dentists").max(120),
  location: z.string().trim().max(120).default(""),
  max: z.number().int().min(1).max(60).default(20),
});

/** Find businesses on Google ("dentists" in "Austin, TX") and add them. */
export async function POST(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { query, location, max } = parsed.data;

    const places = await searchPlaces(query, location, max);
    const label = location ? `${query} in ${location}` : query;
    const rows: NewCompany[] = places
      .filter((p) => p.name)
      .map((p) => {
        const norm = p.website ? normaliseWebsite(p.website) : null;
        return {
          name: p.name,
          website: norm?.website ?? "",
          domain: norm?.domain ?? "",
          source: "google_places",
          search_query: label,
          address: p.address,
          category: p.category,
          rating: p.rating,
          rating_count: p.ratingCount,
          phone: p.phone,
        };
      });
    const added = await addCompanies(supabase, orgId, rows);
    return NextResponse.json({
      found: rows.length,
      added,
      withoutWebsite: rows.filter((r) => !r.domain).length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
