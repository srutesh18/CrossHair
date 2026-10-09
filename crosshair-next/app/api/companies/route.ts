import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { addCompanies, getCompaniesByIds, parseCompanyList } from "@/lib/companies";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

const Add = z.object({
  text: z.string().min(1, "Paste at least one website").max(200_000, "That list is too long; split it up"),
  source: z.enum(["manual", "csv"]).default("manual"),
});

/** Add companies from pasted websites or an uploaded CSV. */
export async function POST(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const parsed = Add.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { rows, skipped } = parseCompanyList(parsed.data.text, parsed.data.source);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid websites found. Put one website per line, e.g. acme-dental.com." }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Add up to 500 companies at a time." }, { status: 400 });
    }
    const added = await addCompanies(supabase, orgId, rows);
    return NextResponse.json({ parsed: rows.length, added, duplicates: rows.length - added, skipped });
  } catch (err) {
    return errorResponse(err);
  }
}

const Ids = z.array(z.string().uuid()).min(1).max(1000);
const Patch = z.object({ ids: Ids, status: z.enum(["dismissed", "contacted", "restore"]) });

/** Bulk: dismiss, mark contacted, or restore to the list. */
export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const parsed = Patch.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Select at least one company." }, { status: 400 });
    const { ids, status } = parsed.data;
    if (status !== "restore") {
      const { data, error } = await supabase.from("companies").update({ status }).in("id", ids).select("id");
      if (error) throw new Error(error.message);
      return NextResponse.json({ updated: data?.length ?? 0 });
    }
    // Restore: audited companies go back to the list, unaudited ones to the queue.
    const rows = await getCompaniesByIds(supabase, ids);
    const audited = rows.filter((r) => r.audited_at && r.flaws.length).map((r) => r.id);
    const pending = rows.filter((r) => !(r.audited_at && r.flaws.length)).map((r) => r.id);
    if (audited.length) await supabase.from("companies").update({ status: "audited" }).in("id", audited);
    if (pending.length) await supabase.from("companies").update({ status: "new" }).in("id", pending);
    return NextResponse.json({ updated: rows.length });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Bulk delete. */
export async function DELETE(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const parsed = z.object({ ids: Ids }).safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Select at least one company." }, { status: 400 });
    const { data, error } = await supabase.from("companies").delete().in("id", parsed.data.ids).select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ deleted: data?.length ?? 0 });
  } catch (err) {
    return errorResponse(err);
  }
}
