"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "google" | "paste" | "csv";

/** Three ways to bring in companies. New ones are audited automatically. */
export function AddCompanies({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(googleEnabled ? "google" : "paste");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(url: string, body: unknown, describe: (r: Record<string, number>) => string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Record<string, number> & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setNotice(describe(json));
      setText("");
      router.refresh(); // the audit runner picks up the new companies
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("That file is over 2 MB. Split it up.");
      return;
    }
    await send("/api/companies", { text: await file.text(), source: "csv" }, (r) =>
      `Added ${r.added} compan${r.added === 1 ? "y" : "ies"}${r.duplicates ? `, ${r.duplicates} already listed` : ""}. Auditing now…`,
    );
  }

  const tabs: Array<[Tab, string]> = [
    ["google", "Search Google"],
    ["paste", "Paste websites"],
    ["csv", "Upload CSV"],
  ];

  return (
    <section className="ch-card">
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <h2 className="ch-label mr-2">Add companies</h2>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setError(null);
              setNotice(null);
            }}
            className="rounded-full border px-3 py-1 text-[13px]"
            aria-pressed={tab === key}
            style={
              tab === key
                ? { background: "var(--color-fg)", color: "var(--color-bg)", borderColor: "var(--color-fg)" }
                : { borderColor: "var(--color-line)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "google" ? (
        googleEnabled ? (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send("/api/companies/search", { query, location, max: 20 }, (r) =>
                `Found ${r.found} businesses, added ${r.added}${r.withoutWebsite ? ` (${r.withoutWebsite} have no website: a lead in itself)` : ""}. Auditing now…`,
              );
            }}
          >
            <input className="ch-input min-w-[180px] flex-1" placeholder="Type of business, e.g. dentists" value={query} onChange={(e) => setQuery(e.target.value)} disabled={busy} aria-label="Type of business" required />
            <input className="ch-input min-w-[160px] flex-1" placeholder="Where, e.g. Austin, TX" value={location} onChange={(e) => setLocation(e.target.value)} disabled={busy} aria-label="Location" />
            <button type="submit" className="ch-btn ch-btn-primary" disabled={busy || query.trim().length < 2}>
              {busy ? "Searching…" : "Find companies"}
            </button>
          </form>
        ) : (
          <p className="rounded-[9px] px-3 py-2 text-[13px]" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber)" }}>
            Google search needs a <code>GOOGLE_API_KEY</code> in <code>.env.local</code> with &ldquo;Places API (New)&rdquo; enabled
            (Google Cloud gives a free monthly credit). Until then, paste websites or upload a CSV.
          </p>
        )
      ) : tab === "paste" ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send("/api/companies", { text, source: "manual" }, (r) =>
              `Added ${r.added} compan${r.added === 1 ? "y" : "ies"}${r.duplicates ? `, ${r.duplicates} already listed` : ""}. Auditing now…`,
            );
          }}
        >
          <textarea
            className="ch-input font-mono text-[13px]"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"One per line:\nacme-dental.com\nBright Smiles Clinic, brightsmiles.co.uk"}
            disabled={busy}
            aria-label="Websites"
          />
          <button type="submit" className="ch-btn ch-btn-primary" disabled={busy || !text.trim()}>
            {busy ? "Adding…" : "Add and audit"}
          </button>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>
            A CSV with a <code>website</code> column (and optionally <code>name</code>, <code>email</code>, <code>phone</code>).
          </p>
          <label className={`ch-btn ch-btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
            {busy ? "Uploading…" : "Choose CSV file"}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {notice ? (
        <p className="mt-3 rounded-[9px] px-3 py-2 text-sm" style={{ background: "var(--color-mint-bg)", color: "var(--color-mint)" }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-[9px] px-3 py-2 text-sm" role="alert" style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
