import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/supabase/server";
import { DEFAULT_SEQUENCE, parseSequence, render, varsFor } from "@/lib/outreach";
import type { Company } from "@/lib/companies";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

/** The email for a step, written from the company's flaws, news and your templates. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const step = Math.max(0, Math.min(2, Number(request.nextUrl.searchParams.get("step") ?? 0) || 0));
    const { supabase, orgId } = await requireSession();
    const [{ data: row, error }, { data: org }] = await Promise.all([
      supabase.from("outreach").select("id, company:companies(*)").eq("id", id).maybeSingle(),
      supabase.from("orgs").select("services, sender_name, signature, email_templates").eq("id", orgId).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const company = row.company as unknown as Company;
    const vars = varsFor(company, {
      services: (org?.services as string[] | undefined) ?? [],
      sender: (org?.sender_name as string | undefined) ?? "",
      signature: (org?.signature as string | undefined) ?? "",
    });
    const t = parseSequence(org?.email_templates)[step] ?? DEFAULT_SEQUENCE[0];
    return NextResponse.json({
      step,
      to: company.emails ?? [],
      subject: render(t.subject, vars),
      body: render(t.body, vars),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
