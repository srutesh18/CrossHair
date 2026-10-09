import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

const Patch = z.object({
  stage: z.enum(["to_contact", "emailed", "replied", "won", "lost"]).optional(),
  notes: z.string().max(4000).optional(),
});

/** Move a company between stages (Replied / Won / Lost stop the follow-ups). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireSession();
    const parsed = Patch.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
    if (parsed.data.stage) {
      update.stage = parsed.data.stage;
      if (parsed.data.stage === "replied" || parsed.data.stage === "won" || parsed.data.stage === "lost") {
        update.next_action_at = null;
      }
      if (parsed.data.stage === "to_contact") {
        update.next_step = 0;
        update.next_action_at = new Date().toISOString();
      }
    }
    const { data, error } = await supabase.from("outreach").update(update).eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Remove from the pipeline; the company goes back to the Radar list. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireSession();
    const { data, error } = await supabase.from("outreach").delete().eq("id", id).select("company_id");
    if (error) throw new Error(error.message);
    const companyId = data?.[0]?.company_id as string | undefined;
    if (!companyId) return NextResponse.json({ error: "Not found." }, { status: 404 });
    await supabase.from("companies").update({ status: "audited" }).eq("id", companyId).eq("status", "contacted");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
