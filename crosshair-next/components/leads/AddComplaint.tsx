"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Paste a real public complaint (with its source link) and score it. */
export function AddComplaint() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState("");
  const [who, setWho] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          said,
          who,
          sourceUrl,
          sourceName: sourceUrl ? new URL(sourceUrl).hostname : "Pasted manually",
        }),
      });
      const body = (await res.json()) as { error?: string; lead?: { id: string } };
      if (!res.ok) throw new Error(body.error ?? `Analyze failed (${res.status})`);
      setOpen(false);
      setSaid("");
      setWho("");
      setSourceUrl("");
      router.push(`/signals?lead=${body.lead?.id ?? ""}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyze failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ch-btn" onClick={() => setOpen(true)}>
        Add complaint
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center p-4" style={{ background: "rgba(31,36,51,.55)" }}>
      <div className="ch-card w-full max-w-[560px] p-6">
        <h2 className="mb-3 text-lg font-semibold">Add a public complaint</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="said" className="mb-1 block text-[13px] font-semibold">
              What they said publicly <span style={{ color: "var(--color-coral)" }}>*</span>
            </label>
            <textarea
              id="said"
              required
              rows={4}
              className="ch-input"
              value={said}
              onChange={(e) => setSaid(e.target.value)}
              placeholder="Paste the complaint exactly as it was posted."
            />
          </div>
          <div>
            <label htmlFor="who" className="mb-1 block text-[13px] font-semibold">
              Who they are (optional)
            </label>
            <input
              id="who"
              className="ch-input"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="Name, role, company, size"
            />
          </div>
          <div>
            <label htmlFor="src" className="mb-1 block text-[13px] font-semibold">
              Public source link (optional)
            </label>
            <input
              id="src"
              type="url"
              className="ch-input"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://www.reddit.com/..."
            />
          </div>

          {error ? (
            <p
              className="rounded-[9px] px-3 py-2 text-sm"
              role="alert"
              style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="ch-btn" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="ch-btn ch-btn-primary" disabled={busy}>
              {busy ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
