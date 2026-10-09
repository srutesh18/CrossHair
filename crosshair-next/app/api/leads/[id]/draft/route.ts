import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { draftEmails, modelName, refineDecision } from "@/lib/ai";
import { retrieveDocs } from "@/lib/rag/retrieve";
import { canDraft } from "@/lib/tier";
import { getLead } from "@/lib/leads";
import { errorResponse } from "@/lib/api";
import type { Tier } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Draft Day 0/3/7 for a Hot or Warm lead, grounded in the org's own docs,
 * then run refineDecision as a second pass to confirm the tier and flag any
 * invented claim. A Hold lead is refused outright.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, orgId } = await requireSession();

    const lead = await getLead(supabase, id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    if (!lead.scores) {
      return NextResponse.json({ error: "Score this lead first." }, { status: 409 });
    }
    if (!lead.tier || !canDraft(lead.tier)) {
      return NextResponse.json(
        { tier: lead.tier, emails: null, note: "Hold lead - no email drafted." },
        { status: 200 },
      );
    }

    const { data: event } = await supabase
      .from("trigger_events")
      .select("headline, kind")
      .eq("lead_id", id)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const newsLine = event ? `${event.headline} (${event.kind})` : "";

    const { data: org } = await supabase
      .from("orgs")
      .select("product_name, sender_name")
      .eq("id", orgId)
      .maybeSingle();

    const query = [lead.said, lead.pain_type, lead.competitor].filter(Boolean).join(" ");
    const docs = await retrieveDocs(supabase, query, 3);
    if (docs.length === 0) {
      return NextResponse.json(
        { error: "No product docs found. Add docs in Setup first." },
        { status: 409 },
      );
    }

    const unsubscribe =
      process.env.SEND_ENABLED === "true" && process.env.UNSUBSCRIBE_URL
        ? `Not useful? Unsubscribe: ${process.env.UNSUBSCRIBE_URL}`
        : "";

    const drafted = await draftEmails({
      name: lead.name,
      role: lead.role,
      company: lead.company_name,
      said: lead.said,
      news: newsLine,
      tier: lead.tier,
      docs: docs.map((d) => ({ title: d.title, content: d.content })),
      unsubscribeLine: unsubscribe,
      productName: (org?.product_name as string | undefined) || "our product",
      sender: (org?.sender_name as string | undefined) || "Alex",
    });

    // Second pass: confirm the tier and catch claims the docs do not support.
    const refined = await refineDecision({
      said: lead.said,
      news: newsLine,
      scores: lead.scores,
      proposedTier: lead.tier,
      drafts: [
        { day: 0, ...drafted.day0 },
        { day: 3, ...drafted.day3 },
        { day: 7, ...drafted.day7 },
      ],
      docs: docs.map((d) => ({ title: d.title, content: d.content })),
    });

    const finalTier: Tier = refined.tier;
    const docTitles = docs.map((d) => d.title);

    if (refined.changed) {
      await supabase.from("lead_scores").insert({
        org_id: orgId,
        lead_id: id,
        pass: "refined",
        pain_rating: refined.scores.pain.rating,
        pain_reason: refined.scores.pain.reason,
        fit_rating: refined.scores.fit.rating,
        fit_reason: refined.scores.fit.reason,
        trigger_rating: refined.scores.trigger.rating,
        trigger_reason: refined.scores.trigger.reason,
        tier: finalTier,
        note: refined.note,
        model: modelName(),
      });
      await supabase
        .from("leads")
        .update({ tier: finalTier, status: finalTier === "HOLD" ? "hold" : lead.status })
        .eq("id", id);
    }

    // The review may have demoted this to Hold. Respect that: no emails saved.
    if (!canDraft(finalTier)) {
      await supabase.from("email_drafts").delete().eq("lead_id", id);
      return NextResponse.json({
        tier: finalTier,
        emails: null,
        note: refined.note || "Second pass downgraded this lead to Hold. No email drafted.",
      });
    }

    const rows = ([0, 3, 7] as const).map((day) => ({
      org_id: orgId,
      lead_id: id,
      day,
      subject: drafted[`day${day}` as const].subject,
      body: drafted[`day${day}` as const].body,
      feature: drafted.feature,
      docs_used: docTitles,
      flagged_claims: refined.flaggedClaims,
      // A fresh draft replaces any earlier approval or edit.
      approved_by: null,
      approved_at: null,
      sent_at: null,
      edited_at: null,
    }));
    const { error } = await supabase
      .from("email_drafts")
      .upsert(rows, { onConflict: "lead_id,day" });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      tier: finalTier,
      feature: drafted.feature,
      emails: { day0: drafted.day0, day3: drafted.day3, day7: drafted.day7 },
      docsUsed: docTitles,
      flaggedClaims: refined.flaggedClaims,
      refineNote: refined.note,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
