import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { modelName, scoreLead, type ScoredLead } from "./ai";
import { findTrigger, type NewsItem } from "./sources/googleNews";
import type { AnalyzeOutput } from "./ai/schemas";
import type { LeadScores, ScoreFacet, Tier } from "./types";
import { decideTier } from "./tier";
import { crossCheckRatings, typesafeEnabled, type CrossCheck } from "./ai/typesafe";

/**
 * The shared qualify step: real trigger lookup -> score -> persist. Used by
 * paste-in analysis, the Reddit scan and re-scoring so they never drift.
 */

async function lookupTrigger(company: string): Promise<NewsItem | null> {
  if (!company.trim()) return null;
  try {
    return await findTrigger(company);
  } catch {
    // No news is a real answer: the trigger scores as "none".
    return null;
  }
}

function newsLine(trigger: NewsItem | null): string {
  return trigger ? `${trigger.headline} (${trigger.kind})` : "";
}

async function saveScore(
  supabase: SupabaseClient,
  orgId: string,
  leadId: string,
  scored: ScoredLead,
): Promise<void> {
  const { scores, tier, crossCheck } = scored;
  const { error } = await supabase.from("lead_scores").insert({
    org_id: orgId,
    lead_id: leadId,
    pass: "initial",
    pain_rating: scores.pain.rating,
    pain_reason: scores.pain.reason,
    fit_rating: scores.fit.rating,
    fit_reason: scores.fit.reason,
    trigger_rating: scores.trigger.rating,
    trigger_reason: scores.trigger.reason,
    tier,
    model: modelName(),
    crosscheck: crossCheck,
  });
  if (error) throw new Error(error.message);
}

async function saveTrigger(
  supabase: SupabaseClient,
  orgId: string,
  leadId: string,
  trigger: NewsItem,
): Promise<void> {
  const { error } = await supabase.from("trigger_events").insert({
    org_id: orgId,
    lead_id: leadId,
    company_name: trigger.companyName,
    headline: trigger.headline,
    kind: trigger.kind,
    url: trigger.url,
    source: trigger.source,
    published_at: trigger.publishedAt,
  });
  if (error) throw new Error(error.message);
}

export async function orgIcp(supabase: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await supabase.from("orgs").select("icp").eq("id", orgId).maybeSingle();
  return (data?.icp as string | undefined) ?? "";
}

export interface NewLeadInput {
  facts: AnalyzeOutput;
  fallbackName: string;
  said: string;
  sourceName: string;
  sourceUrl: string;
  sourceAt?: string | null;
  icp: string;
}

export interface QualifiedLead {
  id: string;
  name: string;
  company: string;
  tier: Tier;
  scored: ScoredLead;
  trigger: NewsItem | null;
}

/** Score a freshly analyzed complaint and save it as a lead. */
export async function qualifyNewLead(
  supabase: SupabaseClient,
  orgId: string,
  input: NewLeadInput,
): Promise<QualifiedLead> {
  const { facts } = input;
  const trigger = await lookupTrigger(facts.company);
  const scored = await scoreLead({
    name: facts.name,
    role: facts.role,
    company: facts.company,
    size: facts.size,
    industry: facts.industry,
    competitor: facts.competitor,
    said: input.said,
    news: newsLine(trigger),
    icp: input.icp,
  });

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      org_id: orgId,
      name: facts.name || input.fallbackName || "Unknown",
      role: facts.role,
      company_name: facts.company,
      company_size: facts.size,
      industry: facts.industry,
      competitor: facts.competitor,
      pain_type: facts.painType,
      said: input.said,
      source_name: input.sourceName,
      source_url: input.sourceUrl,
      source_at: input.sourceAt ?? null,
      tier: scored.tier,
      status: scored.tier === "HOLD" ? "hold" : "new",
    })
    .select("id, name, company_name")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("This source link is already a lead.");
    throw new Error(error.message);
  }

  await saveScore(supabase, orgId, lead.id as string, scored);
  if (trigger) await saveTrigger(supabase, orgId, lead.id as string, trigger);

  return {
    id: lead.id as string,
    name: lead.name as string,
    company: lead.company_name as string,
    tier: scored.tier,
    scored,
    trigger,
  };
}

/** Re-score an existing lead against a fresh trigger lookup. */
export async function rescoreLead(
  supabase: SupabaseClient,
  orgId: string,
  lead: {
    id: string;
    name: string;
    role: string;
    company_name: string;
    company_size: string;
    industry: string;
    competitor: string;
    said: string;
    status: string;
  },
): Promise<{ scored: ScoredLead; news: string }> {
  const trigger = await lookupTrigger(lead.company_name);
  const scored = await scoreLead({
    name: lead.name,
    role: lead.role,
    company: lead.company_name,
    size: lead.company_size,
    industry: lead.industry,
    competitor: lead.competitor,
    said: lead.said,
    news: newsLine(trigger),
    icp: await orgIcp(supabase, orgId),
  });

  await saveScore(supabase, orgId, lead.id, scored);
  if (trigger) await saveTrigger(supabase, orgId, lead.id, trigger);

  // A lead that was approved or sent keeps that status unless it fell to Hold.
  const status =
    scored.tier === "HOLD" ? "hold" : lead.status === "hold" ? "new" : lead.status;
  const { error } = await supabase
    .from("leads")
    .update({ tier: scored.tier, status })
    .eq("id", lead.id);
  if (error) throw new Error(error.message);

  return { scored, news: newsLine(trigger) };
}

// ------------------------------------------------- scoring without Groq

export interface SignalForScoring {
  id: string;
  author: string;
  title: string;
  body: string;
  source_name: string;
  source_url: string;
  posted_at: string | null;
  competitor: string;
  service: string;
  category: string;
  intent: number;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

/**
 * Pain / Fit / Trigger for a crawled post without a generative model:
 *  - Pain: how explicitly they ask (the crawl's intent score).
 *  - Fit: Typesafe AI judges the post against your services + ideal customer,
 *    falling back to "they asked for your service" when Typesafe is off.
 *  - Trigger: recency. A fresh request means they are buying now.
 * The tier is still decided by decideTier(), never by a model.
 */
export async function scoreSignalWithoutGroq(
  supabase: SupabaseClient,
  orgId: string,
  signal: SignalForScoring,
): Promise<QualifiedLead> {
  const { data: org } = await supabase.from("orgs").select("icp, services").eq("id", orgId).maybeSingle();
  const services = (org?.services as string[] | undefined) ?? [];
  const icp = [
    services.length ? `We sell: ${services.join(", ")}.` : "",
    (org?.icp as string | undefined) ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const what = signal.service || signal.competitor || "your offer";

  const pain: ScoreFacet =
    signal.intent >= 80
      ? { rating: "strong", reason: `Explicitly asking to hire or buy (${what}), intent ${signal.intent}.` }
      : signal.intent >= 55
        ? { rating: "fair", reason: `Asking about ${what}, but less explicit (intent ${signal.intent}).` }
        : { rating: "none", reason: `No clear request to hire or buy (intent ${signal.intent}).` };

  let fit: ScoreFacet = signal.service
    ? { rating: "fair", reason: `Asks for ${signal.service}; company size and budget unknown.` }
    : { rating: "fair", reason: `Unhappy with ${signal.competitor || "a competitor"}; details unknown.` };
  let crossCheck: CrossCheck | null = null;
  if (typesafeEnabled()) {
    try {
      crossCheck = await crossCheckRatings({
        state: `Post by ${signal.author}: ${signal.title}. ${signal.body}`.slice(0, 2000),
        icp,
      });
      const c = crossCheck.fit;
      fit = {
        rating: c.rating,
        reason: `Typesafe AI rates fit ${c.rating} (${Math.round(c.confidence * 100)}% confident) against your services.`,
      };
    } catch {
      // Keep the rule-based fit.
    }
  }

  const age = daysSince(signal.posted_at);
  const trigger: ScoreFacet =
    age === null
      ? { rating: "fair", reason: "Posting date unknown." }
      : age <= 14
        ? { rating: "strong", reason: `Posted ${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}: actively looking now.` }
        : age <= 60
          ? { rating: "fair", reason: `Posted ${age} days ago: may still be looking.` }
          : { rating: "none", reason: `Posted ${age} days ago: probably already hired.` };

  const scores: LeadScores = { pain, fit, trigger };
  const tier = decideTier(scores);
  const scored: ScoredLead = { scores, tier, crossCheck };

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      org_id: orgId,
      name: signal.author || "Unknown",
      role: "",
      company_name: "",
      company_size: "",
      industry: "",
      competitor: signal.competitor,
      pain_type: signal.service ? `needs ${signal.service}` : signal.category,
      said: [signal.title, signal.body].filter(Boolean).join(". ").slice(0, 5000),
      source_name: signal.source_name,
      source_url: signal.source_url,
      source_at: signal.posted_at,
      tier,
      status: tier === "HOLD" ? "hold" : "new",
    })
    .select("id, name, company_name")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("This post is already a lead.");
    throw new Error(error.message);
  }

  const { error: scoreErr } = await supabase.from("lead_scores").insert({
    org_id: orgId,
    lead_id: lead.id,
    pass: "initial",
    pain_rating: pain.rating,
    pain_reason: pain.reason,
    fit_rating: fit.rating,
    fit_reason: fit.reason,
    trigger_rating: trigger.rating,
    trigger_reason: trigger.reason,
    tier,
    model: crossCheck ? `rules+typesafe:${crossCheck.model}` : "rules",
    crosscheck: crossCheck,
  });
  if (scoreErr) throw new Error(scoreErr.message);

  return { id: lead.id as string, name: lead.name as string, company: "", tier, scored, trigger: null };
}
