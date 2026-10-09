import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/supabase/server";
import { recordSent } from "@/lib/outreach";
import { sendDraft, sendingEnabled } from "@/lib/send";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({
  step: z.number().int().min(0).max(2),
  to: z.string().trim().email("Enter a valid email address"),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  body: z.string().trim().min(1, "Write the email first").max(10_000),
  /** smtp: send from the server. mail_app: the user sent it from their own email app; just record it. */
  method: z.enum(["smtp", "mail_app"]),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, orgId } = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { step, to, subject, body, method } = parsed.data;

    const { data: row, error } = await supabase.from("outreach").select("id, next_step, stage").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (row.stage === "won" || row.stage === "lost") {
      return NextResponse.json({ error: "This company is closed; reopen it to email again." }, { status: 409 });
    }

    if (method === "smtp") {
      if (!sendingEnabled()) {
        return NextResponse.json(
          { error: "Direct sending is off. Add SMTP details in .env.local (see Templates), or use \"Open in email app\"." },
          { status: 409 },
        );
      }
      await sendDraft({ subject, body, to });
    }
    await recordSent(supabase, orgId, { id: row.id as string, next_step: row.next_step as number }, { step, to, subject, body, method });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
