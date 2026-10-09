import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

const Patch = z.object({
  contactEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]),
});

/** Set the verified contact address a human found for this lead. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireSession();
    const parsed = Patch.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("leads")
      .update({ contact_email: parsed.data.contactEmail })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Delete a lead; scores and drafts cascade, trigger events are kept unlinked. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireSession();
    const { data, error } = await supabase.from("leads").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
