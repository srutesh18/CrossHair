import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { canDraft } from "@/lib/tier";
import { getLead } from "@/lib/leads";
import { errorResponse } from "@/lib/api";
import { sendDraft, sendingEnabled } from "@/lib/send";

export const runtime = "nodejs";

/**
 * Human approval gate. Draft mode by default: this only records the approval.
 * Real sending happens only when SEND_ENABLED=true, and never for a Hold lead.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, userId } = await requireSession();

    const lead = await getLead(supabase, id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    if (!lead.tier || !canDraft(lead.tier)) {
      return NextResponse.json({ error: "Hold leads can never be approved or sent." }, { status: 403 });
    }
    const day0 = lead.drafts.find((d) => d.day === 0);
    if (!day0) return NextResponse.json({ error: "No Day 0 draft to approve." }, { status: 409 });
    if (day0.sent_at) return NextResponse.json({ error: "Day 0 was already sent." }, { status: 409 });

    // Claims the second pass could not support must be fixed by a human first.
    if (day0.flagged_claims.length > 0 && !day0.edited_at) {
      return NextResponse.json(
        { error: "The second pass flagged claims in this draft. Edit Day 0 to fix them, then approve." },
        { status: 409 },
      );
    }

    const send = sendingEnabled();
    if (send && !lead.contact_email) {
      return NextResponse.json(
        { error: "Add a verified contact email for this lead before sending." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const { error: approveErr } = await supabase
      .from("email_drafts")
      .update({ approved_by: userId, approved_at: now })
      .eq("id", day0.id);
    if (approveErr) throw new Error(approveErr.message);

    let sent = false;
    if (send) {
      await sendDraft({ subject: day0.subject, body: day0.body, to: lead.contact_email });
      await supabase.from("email_drafts").update({ sent_at: now }).eq("id", day0.id);
      sent = true;
    }

    await supabase.from("leads").update({ status: sent ? "sent" : "approved" }).eq("id", id);

    return NextResponse.json({
      ok: true,
      sent,
      note: sent
        ? `Day 0 sent to ${lead.contact_email}.`
        : "Approved. Draft mode: nothing was actually sent.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
