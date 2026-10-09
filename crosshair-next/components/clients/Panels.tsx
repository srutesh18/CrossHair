/** Dashboard panels around the radar. Server-rendered; no client state. */

export interface OpportunityCard {
  id: string;
  name: string;
  domain: string;
  website: string;
  score: number;
  flaws: Array<{ title: string; evidence: string; severity: "high" | "medium" | "low" }>;
  services: string[];
  contact: string;
  contactHref: string;
  triggerKind: string;
  triggerHeadline: string;
  triggerUrl: string;
}

export interface TriggerItem {
  id: string;
  name: string;
  domain: string;
  kind: string;
  headline: string;
  url: string;
  at: string | null;
  score: number;
}

const KIND_STYLE: Record<string, { bg: string; fg: string }> = {
  Funding: { bg: "var(--color-mint-bg)", fg: "var(--color-mint)" },
  "New executive": { bg: "var(--color-brand-soft)", fg: "var(--color-brand)" },
  Hiring: { bg: "var(--color-amber-bg)", fg: "var(--color-amber)" },
  Expansion: { bg: "var(--color-raise)", fg: "var(--color-fg)" },
};

export function TriggerBadge({ kind }: { kind: string }) {
  const s = KIND_STYLE[kind] ?? KIND_STYLE.Expansion!;
  return (
    <span className="ch-pill whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {kind}
    </span>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
}

function scoreColor(n: number): string {
  if (n >= 60) return "var(--color-mint)";
  if (n >= 35) return "var(--color-amber)";
  return "var(--color-muted)";
}

export function TopOpportunities({ cards }: { cards: OpportunityCard[] }) {
  return (
    <section className="space-y-2">
      <h2 className="ch-label">Top opportunities right now</h2>
      {cards.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ch-card h-[188px] animate-pulse" style={{ background: "var(--color-raise)" }} aria-hidden />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {cards.map((c) => (
            <article key={c.id} className="ch-card flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[15px]">{c.name}</b>
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="block truncate text-[12px] underline" style={{ color: "var(--color-brand)" }}>
                    {c.domain}
                  </a>
                </div>
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[14px] font-bold"
                  style={{ border: `3px solid ${scoreColor(c.score)}`, fontFamily: "var(--font-mono)" }}
                  title="Opportunity score"
                >
                  {c.score}
                </div>
              </div>
              {c.triggerKind ? (
                <a href={c.triggerUrl} target="_blank" rel="noopener noreferrer" className="block rounded-[9px] px-2.5 py-1.5 text-[12px] hover:underline" style={{ background: "var(--color-raise)" }}>
                  <span className="mr-1 font-semibold">Why now:</span>
                  {c.triggerHeadline}
                </a>
              ) : null}
              <ul className="space-y-1 text-[12px]">
                {c.flaws.slice(0, 2).map((f) => (
                  <li key={f.title}>
                    <b>{f.title}.</b> <span style={{ color: "var(--color-muted)" }}>{f.evidence}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                {c.services.slice(0, 3).map((s) => (
                  <span key={s} className="ch-tag">{s}</span>
                ))}
                <span className="flex-1" />
                {c.contact ? (
                  <a href={c.contactHref} target={c.contactHref.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="max-w-[60%] truncate text-[12px] font-semibold" style={{ color: "var(--color-brand)" }}>
                    {c.contact}
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function TriggerFeed({ items }: { items: TriggerItem[] }) {
  return (
    <section className="ch-card flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="ch-label">Trigger feed</h2>
        <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>funding · new leaders · hiring · expansion</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>
          Company news shows up here after a scan: who just raised money or hired a new leader, so you know who has budget and a reason to change things now.
        </p>
      ) : (
        <ul className="-mx-1 max-h-[340px] space-y-1 overflow-y-auto pr-1">
          {items.map((t) => (
            <li key={t.id} className="rounded-[9px] px-1 py-1.5 hover:bg-[var(--color-raise)]">
              <div className="flex items-center gap-2">
                <TriggerBadge kind={t.kind} />
                <b className="min-w-0 flex-1 truncate text-[13px]">{t.name}</b>
                <span className="text-[11px]" style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>{ago(t.at)}</span>
              </div>
              <a href={t.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 line-clamp-2 block text-[12px] hover:underline" style={{ color: "var(--color-muted)" }}>
                {t.headline}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Single-series magnitude: one hue, value labels, hover title per bar. */
export function FlawBars({ rows, total }: { rows: Array<{ label: string; count: number }>; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="ch-card">
      <h2 className="ch-label mb-1">Most common problems found</h2>
      <p className="mb-3 text-[12px]" style={{ color: "var(--color-muted)" }}>
        Across {total} audited website{total === 1 ? "" : "s"}: what most companies on your radar need fixed.
      </p>
      {rows.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>Appears after the first audits finish.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-2 text-[12px]" title={`${r.label}: ${r.count} of ${total} sites (${Math.round((r.count / Math.max(1, total)) * 100)}%)`}>
              <span className="truncate">{r.label}</span>
              <span className="h-2.5 rounded-full" style={{ background: "var(--color-raise)" }}>
                <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "var(--color-brand)" }} />
              </span>
              <span className="text-right" style={{ fontFamily: "var(--font-mono)" }}>{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SourceTiles({ tiles }: { tiles: Array<{ label: string; value: number; hint: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="ch-card py-3">
          <b className="block text-[22px] leading-none font-semibold" style={{ fontFamily: "var(--font-mono)" }}>{t.value}</b>
          <span className="mt-1 block text-[12px] font-semibold">{t.label}</span>
          <span className="block text-[11px]" style={{ color: "var(--color-muted)" }}>{t.hint}</span>
        </div>
      ))}
    </div>
  );
}
