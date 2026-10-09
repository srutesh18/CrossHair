"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Blip } from "./Radar3D";

// WebGL only runs in the browser.
const Radar3D = dynamic(() => import("./Radar3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[13px] text-white/50">Loading radar…</div>,
});

type Source = "reddit" | "hn" | "forums" | "news";
const SOURCES: Array<{ key: Source; label: string; detail: string }> = [
  { key: "reddit", label: "Reddit", detail: "owners sharing their site in business communities" },
  { key: "hn", label: "Hacker News", detail: "new launches with a website" },
  { key: "forums", label: "Communities", detail: "Bubble, n8n and Make members' sites" },
  { key: "news", label: "Company news", detail: "who just raised money or hired a new leader" },
];

type SourceState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; sites: number; added: number }
  | { state: "error"; error: string };

interface Props {
  blips: Blip[];
  services: string[];
  pending: number;
  lastScan: string | null;
  /** Start a scan by itself (first visit, nothing found yet). */
  autoStart: boolean;
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function ScanHub({ blips, services, pending, lastScan, autoStart }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Record<Source, SourceState>>({
    reddit: { state: "idle" },
    hn: { state: "idle" },
    forums: { state: "idle" },
    news: { state: "idle" },
  });
  const [discovering, setDiscovering] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const auditLock = useRef(false);
  const autoRan = useRef(false);

  const runAudits = useCallback(async () => {
    if (auditLock.current) return;
    auditLock.current = true;
    setAuditing(true);
    let done = 0;
    try {
      for (;;) {
        const res = await fetch("/api/companies/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const json = (await res.json()) as { audited?: number; remaining?: number; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Audit failed (${res.status})`);
        done += json.audited ?? 0;
        setAudit({ done, total: done + (json.remaining ?? 0) });
        router.refresh();
        if (!json.remaining || !json.audited) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      auditLock.current = false;
      setAuditing(false);
      router.refresh();
    }
  }, [router]);

  const scan = useCallback(async () => {
    setDiscovering(true);
    setError(null);
    setStatus({ reddit: { state: "running" }, hn: { state: "running" }, forums: { state: "running" }, news: { state: "running" } });
    // One request per source so each one's progress shows as it lands.
    await Promise.all(
      SOURCES.map(async ({ key }) => {
        try {
          const res = await fetch("/api/discover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sources: [key] }),
          });
          const json = (await res.json()) as {
            error?: string;
            added?: number;
            sources?: Partial<Record<Source, { ok: boolean; sites: number; error?: string }>>;
          };
          if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
          const st = json.sources?.[key];
          setStatus((s) => ({
            ...s,
            [key]: st && !st.ok ? { state: "error", error: st.error ?? "failed" } : { state: "done", sites: st?.sites ?? 0, added: json.added ?? 0 },
          }));
        } catch (err) {
          setStatus((s) => ({ ...s, [key]: { state: "error", error: err instanceof Error ? err.message : "failed" } }));
        }
      }),
    );
    setDiscovering(false);
    router.refresh();
    await runAudits();
  }, [router, runAudits]);

  // First visit: scan by itself. Leftover queue (e.g. a site added by hand): audit it.
  useEffect(() => {
    if (autoStart && !autoRan.current) {
      autoRan.current = true;
      void scan();
    } else if (pending > 0 && !discovering) {
      void runAudits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, pending]);

  const busy = discovering || auditing;
  const strong = blips.filter((b) => b.score >= 60).length;
  const pct = audit.total ? Math.round((audit.done / audit.total) * 100) : 0;

  return (
    <section
      className="overflow-hidden rounded-[18px] text-white"
      style={{ background: "radial-gradient(120% 140% at 85% 30%, #183340 0%, #121c28 45%, #0c131c 100%)" }}
    >
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-4 p-6">
          <div>
            <p className="text-[11px] tracking-[0.16em] uppercase opacity-60" style={{ fontFamily: "var(--font-mono)" }}>
              {busy ? "Scanning" : lastScan ? `Last scan ${timeAgo(lastScan)}` : "Ready"}
            </p>
            <h2 className="mt-1 text-[26px] leading-tight font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              {blips.length ? (
                <>
                  {blips.length} companies on radar
                  {strong ? <span style={{ color: "#3ddc97" }}> · {strong} strong</span> : null}
                </>
              ) : (
                "Find companies that need you"
              )}
            </h2>
            <p className="mt-1 text-[13px] opacity-70">
              Crosshair finds business owners sharing their websites in public, audits each site for
              problems you fix{services.length ? ` (${services.join(", ")})` : ""}, and finds how to reach them.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void scan()}
            disabled={busy}
            className="inline-flex w-fit items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold transition disabled:opacity-70"
            style={{ background: "#f2a07d", color: "#121c28", boxShadow: busy ? "none" : "0 0 0 6px rgba(242,160,125,.15)" }}
          >
            {busy ? (
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <span aria-hidden>◎</span>
            )}
            {discovering ? "Scanning sources…" : auditing ? "Auditing websites…" : "Scan now"}
          </button>

          <ul className="space-y-1.5 text-[13px]">
            {SOURCES.map(({ key, label, detail }) => {
              const st = status[key];
              return (
                <li key={key} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${st.state === "running" ? "animate-pulse" : ""}`}
                    style={{
                      background:
                        st.state === "done" ? "#3ddc97" : st.state === "error" ? "#ff7b6b" : st.state === "running" ? "#f2b544" : "rgba(255,255,255,.3)",
                    }}
                  />
                  <span>
                    <b>{label}</b>{" "}
                    <span className="opacity-60">
                      {st.state === "running"
                        ? "searching…"
                        : st.state === "done"
                          ? key === "news"
                            ? `${st.sites} companies with fresh news, ${st.added} new`
                            : `${st.sites} sites found, ${st.added} new`
                          : st.state === "error"
                            ? st.error
                            : detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {auditing || audit.total ? (
            <div aria-live="polite">
              <div className="mb-1 flex justify-between text-[12px] opacity-70">
                <span>{auditing ? "Auditing websites for flaws and contacts" : "Audit complete"}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {audit.done}/{audit.total}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#3ddc97" }} />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-[13px]" style={{ color: "#ff9d90" }}>{error}</p> : null}

          <div className="mt-auto flex flex-wrap gap-4 text-[11px] opacity-60">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#3ddc97" }} />strong (60+)</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#f2b544" }} />some gaps</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#7c8597" }} />few gaps</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#5aa9ff" }} />auditing</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full border-2" style={{ borderColor: "#f2a07d" }} />in the news</span>
            <span>Closer to the centre and taller = better opportunity</span>
          </div>
        </div>
        <div className="h-[340px] lg:h-[420px]">
          <Radar3D blips={blips} scanning={busy} />
        </div>
      </div>
    </section>
  );
}
