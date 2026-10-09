export type Rating = "strong" | "fair" | "none";
export type Tier = "HOT" | "WARM" | "HOLD";
export type LeadStatus = "new" | "approved" | "sent" | "replied" | "hold";

export interface ScoreFacet {
  rating: Rating;
  reason: string;
}

export interface LeadScores {
  pain: ScoreFacet;
  fit: ScoreFacet;
  trigger: ScoreFacet;
}

export interface Lead {
  id: string;
  org_id: string;
  name: string;
  role: string;
  company_name: string;
  company_size: string;
  industry: string;
  competitor: string;
  pain_type: string;
  said: string;
  source_name: string;
  source_url: string;
  source_at: string | null;
  tier: Tier | null;
  status: LeadStatus;
  contact_email: string;
  created_at: string;
}

export interface LeadScoreRow extends LeadScores {
  id: string;
  lead_id: string;
  pass: "initial" | "refined";
  tier: Tier;
  note: string;
  created_at: string;
}

export interface EmailDraft {
  id: string;
  lead_id: string;
  day: 0 | 3 | 7;
  subject: string;
  body: string;
  feature: string;
  docs_used: string[];
  flagged_claims: string[];
  approved_at: string | null;
  sent_at: string | null;
  edited_at: string | null;
}

export interface TriggerEvent {
  id: string;
  lead_id: string | null;
  company_name: string;
  headline: string;
  kind: string;
  url: string;
  source: string;
  published_at: string | null;
}

export interface CrossCheckFacet {
  rating: Rating;
  confidence: number;
}

/** Typesafe AI's independent ratings for the latest score, when it ran. */
export interface CrossCheckView {
  model: string;
  pain: CrossCheckFacet;
  fit: CrossCheckFacet;
  trigger: CrossCheckFacet;
}

/** A lead joined with its latest scores and drafts, as the UI and exports use it. */
export interface LeadWithDetail extends Lead {
  scores: LeadScores | null;
  /** Which pass produced the latest scores, and its reviewer note. */
  scorePass: "initial" | "refined" | null;
  scoreNote: string;
  crossCheck: CrossCheckView | null;
  drafts: EmailDraft[];
}
