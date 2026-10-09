import { z } from "zod";

export const RatingSchema = z.enum(["strong", "fair", "none"]);
export const TierSchema = z.enum(["HOT", "WARM", "HOLD"]);

/** Every facet must carry a one-line reason. */
export const FacetSchema = z.object({
  rating: RatingSchema,
  reason: z.string().min(1).max(200),
});

// ---------- analyzeComplaint ----------
export const AnalyzeInput = z.object({
  said: z.string().min(1, "A complaint is required"),
  who: z.string().default(""),
  sourceName: z.string().default(""),
  sourceUrl: z.string().default(""),
});
export type AnalyzeInput = z.infer<typeof AnalyzeInput>;

export const AnalyzeOutput = z.object({
  name: z.string().default(""),
  role: z.string().default(""),
  company: z.string().default(""),
  competitor: z.string().default(""),
  size: z.string().default(""),
  industry: z.string().default(""),
  painType: z.string().default(""),
});
export type AnalyzeOutput = z.infer<typeof AnalyzeOutput>;

// ---------- scoreLead ----------
export const ScoreInput = z.object({
  name: z.string().default(""),
  role: z.string().default(""),
  company: z.string().default(""),
  size: z.string().default(""),
  industry: z.string().default(""),
  competitor: z.string().default(""),
  said: z.string().min(1),
  news: z.string().default(""),
  icp: z.string().default(""),
});
export type ScoreInput = z.infer<typeof ScoreInput>;

/** The model returns ratings only. decideTier() computes the tier in code. */
export const ScoreOutput = z.object({
  pain: FacetSchema,
  fit: FacetSchema,
  trigger: FacetSchema,
});
export type ScoreOutput = z.infer<typeof ScoreOutput>;

// ---------- draftEmails ----------
export const DraftInput = z.object({
  name: z.string().min(1),
  role: z.string().default(""),
  company: z.string().default(""),
  said: z.string().default(""),
  news: z.string().default(""),
  tier: TierSchema,
  docs: z.array(z.object({ title: z.string(), content: z.string() })).min(1),
  unsubscribeLine: z.string().default(""),
  productName: z.string().min(1).default("our product"),
  sender: z.string().min(1).default("Alex"),
});
export type DraftInput = z.infer<typeof DraftInput>;

const EmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const DraftOutput = z.object({
  feature: z.string().default(""),
  day0: EmailSchema,
  day3: EmailSchema,
  day7: EmailSchema,
});
export type DraftOutput = z.infer<typeof DraftOutput>;

// ---------- refineDecision ----------
export const RefineInput = z.object({
  said: z.string().min(1),
  news: z.string().default(""),
  scores: ScoreOutput,
  proposedTier: TierSchema,
  drafts: z.array(z.object({ day: z.number(), subject: z.string(), body: z.string() })).default([]),
  docs: z.array(z.object({ title: z.string(), content: z.string() })).default([]),
});
export type RefineInput = z.infer<typeof RefineInput>;

export const RefineOutput = z.object({
  /** Confirmed or corrected ratings. Tier is still recomputed in code. */
  scores: ScoreOutput,
  changed: z.boolean().default(false),
  note: z.string().default(""),
  /** Claims in the drafts not supported by the retrieved docs or the complaint. */
  flaggedClaims: z.array(z.string()).default([]),
});
export type RefineOutput = z.infer<typeof RefineOutput>;
