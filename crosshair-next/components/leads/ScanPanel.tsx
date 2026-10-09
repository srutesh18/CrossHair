"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/States";

interface SourceStatus {
  ok: boolean;
  count: number;
  error?: string;
}

const SOURCE_LABEL: Record<string, string> = { reddit: "Reddit", hn: "Hacker News" };

interface ScanResult {
  query: string;
  sources?: Record<string, SourceStatus>;
  scanned: number;
  created: number;
  skipped: number;
  failed?: number;
  leads: Array<{ id: string; name: string; company: string; tier: string }>;
  note?: string;
}

/** Runs a real scan: public Reddit posts, then a real Google News trigger each. */
export function ScanPanel() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Array<"reddit" | "hn">>(["reddit", "hn"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 6, sources }),
      });
      const body = (await res.json()) as ScanResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Scan failed (${res.status})`);
      setResult(body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ch-card">
      <h2 className="ch-label mb-2">Scan public complaints</h2>
      <div className="flex flex-wrap gap-2">
        <input
          className="ch-input min-w-[220px] flex-1"
          placeholder='e.g. "Meridian" slow dashboards'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search query"
          disabled={busy}
        />
        <button
          type="button"
          className="ch-btn ch-btn-primary"
          onClick={() => void run()}
          disabled={busy || sources.length === 0}
        >
          {busy ? "Scanning…" : "Run scan"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
        {(["reddit", "hn"] as const).map((key) => (
          <label key={key} className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={sources.includes(key)}
              disabled={busy}
              onChange={(e) =>
                setSources(e.target.checked ? [...sources, key] : sources.filter((s) => s !== key))
              }
            />
            {SOURCE_LABEL[key]}
          </label>
        ))}
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--color-muted)" }}>
        Leave blank to use the competitors and keywords from Setup. Each post is scored against a
        real Google News trigger for that company.
      </p>

      {busy ? (
        <div className="mt-4">
          <Spinner label="Reading public posts and checking company news…" />
        </div>
      ) : null}

      {error ? (
        <div
          className="mt-4 rounded-[9px] px-3 py-2 text-sm"
          role="alert"
          style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}
        >
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 text-sm">
          <p>
            Read <b>{result.scanned}</b> public posts, created <b>{result.created}</b> lead
            {result.created === 1 ? "" : "s"}
            {result.skipped ? `, skipped ${result.skipped}` : ""}
            {result.failed ? `, ${result.failed} failed` : ""}.
          </p>
          {result.sources ? (
            <ul className="mt-1 space-y-0.5 text-[12px]" style={{ color: "var(--color-muted)" }}>
              {Object.entries(result.sources).map(([key, st]) => (
                <li key={key}>
                  {SOURCE_LABEL[key] ?? key}:{" "}
                  {st.ok ? `${st.count} posts` : <span style={{ color: "var(--color-coral)" }}>{st.error}</span>}
                </li>
              ))}
            </ul>
          ) : null}
          {result.note ? (
            <p className="mt-1" style={{ color: "var(--color-muted)" }}>
              {result.note}
            </p>
          ) : null}
          {result.leads.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {result.leads.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <span className="ch-tag">{l.tier}</span>
                  <span className="truncate">
                    {l.name} &middot; {l.company}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
