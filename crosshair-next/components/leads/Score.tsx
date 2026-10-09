import type { CrossCheckFacet, CrossCheckView, LeadScores, Rating, Tier } from "@/lib/types";
import { RATING_LABEL, TIER_LABEL } from "@/lib/tier";

const PILL: Record<Tier, string> = {
  HOT: "ch-pill-hot",
  WARM: "ch-pill-warm",
  HOLD: "ch-pill-hold",
};

export function TierPill({ tier }: { tier: Tier | null }) {
  if (!tier) return <span className="ch-pill ch-pill-hold">Unscored</span>;
  return <span className={`ch-pill ${PILL[tier]}`}>{TIER_LABEL[tier]}</span>;
}

const METER: Record<Rating, string> = {
  strong: "ch-meter-strong",
  fair: "ch-meter-fair",
  none: "ch-meter-none",
};

const TEXT: Record<Rating, string> = {
  strong: "var(--color-mint)",
  fair: "var(--color-amber)",
  none: "var(--color-coral)",
};

export function Facet({
  label,
  facet,
  check,
}: {
  label: string;
  facet: { rating: Rating; reason: string };
  check?: CrossCheckFacet;
}) {
  return (
    <div className="ch-card min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="ml-auto text-[13px] font-semibold" style={{ color: TEXT[facet.rating] }}>
          {RATING_LABEL[facet.rating]}
        </span>
      </div>
      <div className={`ch-meter ${METER[facet.rating]}`} aria-hidden>
        <i /><i /><i />
      </div>
      <p className="mt-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
        {facet.reason}
      </p>
      {check ? (
        <p className="mt-1 text-[11px]" style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
          cross-check: {RATING_LABEL[check.rating]} &middot; {Math.round(check.confidence * 100)}%
        </p>
      ) : null}
    </div>
  );
}

/** The three-up pain / fit / trigger card row. */
export function ScoreTrio({
  scores,
  crossCheck,
}: {
  scores: LeadScores;
  crossCheck?: CrossCheckView | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Facet label="Pain" facet={scores.pain} check={crossCheck?.pain} />
      <Facet label="Fit" facet={scores.fit} check={crossCheck?.fit} />
      <Facet label="Trigger" facet={scores.trigger} check={crossCheck?.trigger} />
    </div>
  );
}
