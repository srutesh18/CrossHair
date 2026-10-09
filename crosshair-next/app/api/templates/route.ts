import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

const Template = z.object({ subject: z.string().trim().min(1).max(300), body: z.string().trim().min(1).max(8000) });
const Body = z.object({
  sequence: z.tuple([Template, Template, Template]).nullable(),
  senderName: z.string().trim().min(1, "Your name is required").max(80),
  signature: z.string().max(500),
  productName: z.string().trim().max(120),
});

/** Save the email sequence and sender details (null sequence = back to defaults). */
export async function PUT(request: NextRequest) {
  try {
    const { supabase, orgId } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { sequence, senderName, signature, productName } = parsed.data;
    const { error } = await supabase
      .from("orgs")
      .update({ email_templates: sequence, sender_name: senderName, signature, product_name: productName || "My company" })
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
