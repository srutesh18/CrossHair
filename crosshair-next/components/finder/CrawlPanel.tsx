"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Key = "reddit" | "hn" | "stackexchange" | "github" | "forums" | "web";

const LABEL: Record<Key, string> = {
  reddit: "Reddit",
  hn: "Hacker News",
  stackexchange: "Stack Exchange",
  github: "GitHub",
  forums: "Communities",
  web: "Web crawl",
};

interface Stat {
  ok: boolean;
  count: number;
  error?: string;
}
interface Result {
  found: number;
  kept: number;
  added: number;
  sources: Partial<Record<Key, Stat>>;
}

/** One-line crawl bar: optional query, source toggles, run. */
export function CrawlPanel({
  forumCount,
  crawlCount,
  hasBuyerForums = false,
}: {
  forumCount: number;
  crawlCount: number;
  /** Your services map to built-in buyer communities (n8n, Make, Bubble…). */
  hasBuyerForums?: boolean;
}) {
  const router = useRouter();
  const available: Record<Key, boolean> = {
    reddit: true,
    hn: true,
    stackexchange: true,
    github: true,
    forums: forumCount > 0 || hasBuyerForums,
    web: crawlCount > 0,
  };
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Key[]>(
    (Object.keys(available) as Key[]).filter((k) => available[k] && k !== "github"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, sources, perSource: 30 }),
      });
      const body = (await res.json()) as Result & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Crawl failed (${res.status})`);
      setResult(body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setBusy(false);
    }
  }

  const failed = result ? (Object.entries(result.sources) as Array<[Key, Stat]>).filter(([, s]) => !s.ok) : [];

  return (
    <section className="ch-card">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="ch-input min-w-[200px] flex-1"
          placeholder="Search for something specific (optional)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void run();
          }}
          disabled={busy}
          aria-label="Search query"
        />
        <button
          type="button"
          className="ch-btn ch-btn-primary"
          onClick={() => void run()}
          disabled={busy || sources.length === 0}
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Finding leads…
            </span>
          ) : (
            "Find leads"
          )}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span style={{ color: "var(--color-muted)" }}>Sources:</span>
        {(Object.keys(LABEL) as Key[]).map((key) => {
          const on = sources.includes(key);
          return (
            <button
              key={key}
              type="button"
              disabled={busy || !available[key]}
              title={available[key] ? undefined : "Add URLs in Setup to use this source"}
              onClick={() => setSources(on ? sources.filter((s) => s !== key) : [...sources, key])}
              className="rounded-full border px-2.5 py-0.5 transition disabled:opacity-40"
              aria-pressed={on}
              style={
                on
                  ? { background: "var(--color-fg)", color: "var(--color-bg)", borderColor: "var(--color-fg)" }
                  : { borderColor: "var(--color-line)", color: "var(--color-muted)" }
              }
            >
              {LABEL[key]}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mt-3 rounded-[9px] px-3 py-2 text-sm" role="alert" style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}>
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="mt-3 rounded-[9px] px-3 py-2 text-sm" style={{ background: "var(--color-mint-bg)", color: "var(--color-mint)" }}>
          Checked {result.found} public posts: <b>{result.added} new leads</b> added
          {result.kept > result.added ? ` (${result.kept - result.added} already listed)` : ""}.
          {failed.length ? (
            <span style={{ color: "var(--color-amber)" }}>
              {" "}
              {failed.map(([k, s]) => `${LABEL[k]}: ${s.error}`).join(" ")}
            </span>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
