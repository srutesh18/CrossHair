import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrossCheckView, EmailDraft, Lead, LeadScores, LeadWithDetail, Tier } from "./types";

export interface LeadFilters {
  /** "ALL" or a specific tier. */
  tier?: Tier | "ALL";
  /** Free-text match on name, company or competitor. */
  q?: string;
  /** Restrict to these lead ids. */
  ids?: string[];
}

interface ScoreRow {
  lead_id: string;
  pass: "initial" | "refined";
  note: string;
  crosscheck: unknown;
  pain_rating: LeadScores["pain"]["rating"];
  pain_reason: string;
  fit_rating: LeadScores["fit"]["rating"];
  fit_reason: string;
  trigger_rating: LeadScores["trigger"]["rating"];
  trigger_reason: string;
  created_at: string;
}

interface DraftRow extends Omit<EmailDraft, "docs_used" | "flagged_claims"> {
  docs_used: unknown;
  flagged_claims: unknown;
}

function asCrossCheck(v: unknown): CrossCheckView | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  for (const k of ["pain", "fit", "trigger"]) {
    const f = o[k] as Record<string, unknown> | undefined;
    if (!f || typeof f.rating !== "string" || typeof f.confidence !== "number") return null;
  }
  return o as unknown as CrossCheckView;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Leads with their latest scores and drafts. Every query runs as the signed-in
 * user, so RLS scopes rows to their org - filters narrow that set, they never
 * widen it.
 */
export async function getLeads(
  supabase: SupabaseClient,
  filters: LeadFilters = {},
): Promise<LeadWithDetail[]> {
  let query = supabase.from("leads").select("*").order("created_at", { ascending: false });

  if (filters.ids) query = query.in("id", filters.ids);
  if (filters.tier && filters.tier !== "ALL") query = query.eq("tier", filters.tier);
  if (filters.q?.trim()) {
    // Strip characters PostgREST treats as filter syntax.
    const term = `%${filters.q.trim().replace(/[%,()*\\]/g, " ")}%`;
    query = query.or(
      `name.ilike.${term},company_name.ilike.${term},competitor.ilike.${term}`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const leads = (data ?? []) as Lead[];
  if (leads.length === 0) return [];

  const ids = leads.map((l) => l.id);
  const [scoresRes, draftsRes] = await Promise.all([
    supabase
      .from("lead_scores")
      .select("*")
      .in("lead_id", ids)
      .order("created_at", { ascending: false }),
    supabase.from("email_drafts").select("*").in("lead_id", ids).order("day"),
  ]);
  if (scoresRes.error) throw new Error(scoresRes.error.message);
  if (draftsRes.error) throw new Error(draftsRes.error.message);

  // Rows are newest-first, so the first one seen per lead is the latest pass.
  const latestScore = new Map<string, ScoreRow>();
  for (const row of (scoresRes.data ?? []) as ScoreRow[]) {
    if (!latestScore.has(row.lead_id)) latestScore.set(row.lead_id, row);
  }
  const toScores = (row: ScoreRow): LeadScores => ({
    pain: { rating: row.pain_rating, reason: row.pain_reason },
    fit: { rating: row.fit_rating, reason: row.fit_reason },
    trigger: { rating: row.trigger_rating, reason: row.trigger_reason },
  });

  const draftsByLead = new Map<string, EmailDraft[]>();
  for (const row of (draftsRes.data ?? []) as DraftRow[]) {
    const list = draftsByLead.get(row.lead_id) ?? [];
    list.push({
      ...row,
      docs_used: asStringArray(row.docs_used),
      flagged_claims: asStringArray(row.flagged_claims),
    });
    draftsByLead.set(row.lead_id, list);
  }

  return leads.map((lead) => {
    const score = latestScore.get(lead.id);
    return {
      ...lead,
      scores: score ? toScores(score) : null,
      scorePass: score?.pass ?? null,
      scoreNote: score?.note ?? "",
      crossCheck: score ? asCrossCheck(score.crosscheck) : null,
      drafts: draftsByLead.get(lead.id) ?? [],
    };
  });
}

export async function getLead(
  supabase: SupabaseClient,
  id: string,
): Promise<LeadWithDetail | null> {
  // Non-uuid ids would make Postgres throw; they simply match nothing.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [lead] = await getLeads(supabase, { ids: [id] });
  return lead ?? null;
}

export function parseFilters(params: URLSearchParams): LeadFilters {
  const tierRaw = params.get("tier");
  const tier: Tier | "ALL" =
    tierRaw === "HOT" || tierRaw === "WARM" || tierRaw === "HOLD" ? tierRaw : "ALL";
  return { tier, q: params.get("q") ?? "" };
}
