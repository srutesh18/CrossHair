import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Company } from "./companies";

export {
  DEFAULT_SEQUENCE,
  STEP_LABEL,
  TEMPLATE_VARS,
  parseSequence,
  render,
  varsFor,
  type EmailTemplate,
  type Sequence,
  type Vars,
} from "./templates";
import { WAIT_DAYS } from "./templates";

// ------------------------------------------------------------- pipeline

export type Stage = "to_contact" | "emailed" | "replied" | "won" | "lost";

export interface OutreachEmail {
  id: string;
  step: number;
  to_email: string;
  subject: string;
  body: string;
  method: "smtp" | "mail_app";
  status: "sent" | "failed";
  error: string;
  sent_at: string;
}

export interface OutreachRow {
  id: string;
  company_id: string;
  stage: Stage;
  next_step: number;
  next_action_at: string | null;
  last_contacted_at: string | null;
  notes: string;
  created_at: string;
  company: Company;
  emails: OutreachEmail[];
}

/** Add companies to the pipeline; they leave the Radar's "to review" list. */
export async function addToPipeline(supabase: SupabaseClient, orgId: string, companyIds: string[]): Promise<number> {
  const { data: existing } = await supabase.from("outreach").select("company_id").in("company_id", companyIds);
  const have = new Set((existing ?? []).map((r) => r.company_id as string));
  const fresh = companyIds.filter((id) => !have.has(id)).map((company_id) => ({ org_id: orgId, company_id }));
  if (fresh.length) {
    const { error } = await supabase.from("outreach").insert(fresh);
    if (error) throw new Error(error.message);
  }
  await supabase.from("companies").update({ status: "contacted" }).in("id", companyIds);
  return fresh.length;
}

export async function getPipeline(supabase: SupabaseClient): Promise<OutreachRow[]> {
  const { data, error } = await supabase
    .from("outreach")
    .select("*, company:companies(*), emails:outreach_emails(*)")
    .order("next_action_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as OutreachRow[]).map((r) => ({
    ...r,
    emails: [...(r.emails ?? [])].sort((a, b) => a.sent_at.localeCompare(b.sent_at)),
  }));
}

/** Record a sent email and move the sequence on. */
export async function recordSent(
  supabase: SupabaseClient,
  orgId: string,
  row: { id: string; next_step: number },
  email: { step: number; to: string; subject: string; body: string; method: "smtp" | "mail_app" },
): Promise<void> {
  const now = new Date();
  const { error } = await supabase.from("outreach_emails").insert({
    org_id: orgId,
    outreach_id: row.id,
    step: email.step,
    to_email: email.to,
    subject: email.subject,
    body: email.body,
    method: email.method,
  });
  if (error) throw new Error(error.message);

  const nextStep = Math.max(row.next_step, email.step + 1);
  const wait = WAIT_DAYS[email.step] ?? 0;
  const { error: upErr } = await supabase
    .from("outreach")
    .update({
      stage: "emailed",
      next_step: Math.min(3, nextStep),
      next_action_at: nextStep >= 3 ? null : new Date(now.getTime() + wait * 86_400_000).toISOString(),
      last_contacted_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", row.id);
  if (upErr) throw new Error(upErr.message);
}

/** Board column for a pipeline row (follow-up due is derived, not stored). */
export function columnOf(r: Pick<OutreachRow, "stage" | "next_step" | "next_action_at">): "to_contact" | "waiting" | "due" | "replied" | "closed" {
  if (r.stage === "to_contact") return "to_contact";
  if (r.stage === "replied") return "replied";
  if (r.stage === "won" || r.stage === "lost") return "closed";
  if (r.next_step <= 2 && r.next_action_at && new Date(r.next_action_at).getTime() <= Date.now()) return "due";
  return "waiting";
}
