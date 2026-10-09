import Link from "next/link";
import { Topbar } from "@/components/ui/Topbar";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { requireSession } from "@/lib/supabase/server";
import type { TriggerEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;

  let events: TriggerEvent[] = [];
  let error: string | null = null;
  try {
    const { supabase } = await requireSession();
    const { data, error: err } = await supabase
      .from("trigger_events")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(100);
    if (err) throw new Error(err.message);
    events = (data ?? []) as TriggerEvent[];
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load news";
  }

  const triggers = events.filter((e) => e.kind !== "");
  const shown =
    filter === "trigger" ? triggers : filter === "noise" ? events.filter((e) => e.kind === "") : events;

  return (
    <>
      <Topbar title="News" tag="Google News RSS">
        <div className="flex gap-1">
          {[
            ["all", "All"],
            ["trigger", "Triggers"],
            ["noise", "Ignored"],
          ].map(([key, label]) => (
            <Link
              key={key}
              href={`/news?filter=${key}`}
              className="ch-btn text-[13px]"
              style={
                filter === key
                  ? { background: "var(--color-fg)", color: "var(--color-bg)", borderColor: "var(--color-fg)" }
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </div>
        <span className="text-[13px]" style={{ color: "var(--color-muted)" }}>
          {triggers.length} real triggers of {events.length}
        </span>
      </Topbar>

      <div className="flex-1 overflow-y-auto p-5">
        {error ? (
          <ErrorState message={error} />
        ) : shown.length === 0 ? (
          <EmptyState
            title="No company news yet"
            hint="News is fetched from Google News when a lead is scanned or scored."
            action={
              <Link href="/radar" className="ch-btn ch-btn-primary">
                Go to Radar
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((e) => (
              <article key={e.id} className="ch-card flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="ch-pill"
                    style={
                      e.kind
                        ? { background: "var(--color-brand-soft)", color: "var(--color-brand)" }
                        : { background: "var(--color-idle-bg)", color: "var(--color-idle)" }
                    }
                  >
                    {e.kind || "Not a trigger"}
                  </span>
                  <time className="ml-auto text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "var(--color-muted)" }}>
                    {e.published_at
                      ? new Date(e.published_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                        })
                      : ""}
                  </time>
                </div>
                <h3 className="text-[15px] leading-snug font-semibold">{e.company_name}</h3>
                <p className="text-[13px]">{e.headline}</p>
                {e.url ? (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto truncate text-[12px] underline"
                    style={{ color: "var(--color-brand)" }}
                  >
                    Read source
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
