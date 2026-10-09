import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(300),
  body: z.string().trim().min(1, "Body is required").max(5000),
});

/** A human edit. It clears any earlier approval, since the text changed. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const { data: draft, error: readErr } = await supabase
      .from("email_drafts")
      .select("id, sent_at")
      .eq("id", id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    if (draft.sent_at) {
      return NextResponse.json({ error: "This email was already sent." }, { status: 409 });
    }

    const { error } = await supabase
      .from("email_drafts")
      .update({
        subject: parsed.data.subject,
        body: parsed.data.body,
        edited_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
