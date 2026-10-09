"use client";

import { useState } from "react";
import type { Tier } from "@/lib/types";

/**
 * Export the CURRENT view. The same tier/q filters are forwarded to the API,
 * which re-runs the query under the user's own session, so an export can never
 * contain another org's rows.
 */
export function ExportMenu({ tier, q }: { tier: Tier | "ALL"; q: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: "csv" | "xlsx" | "pdf") {
    setBusy(format);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tier !== "ALL") params.set("tier", tier);
      if (q) params.set("q", q);
      const res = await fetch(`/api/export/${format}?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? `crosshair-leads.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="ch-label">Export</span>
      {(["csv", "xlsx", "pdf"] as const).map((f) => (
        <button
          key={f}
          type="button"
          className="ch-btn text-[13px]"
          disabled={busy !== null}
          onClick={() => void download(f)}
        >
          {busy === f ? "Preparing…" : f.toUpperCase()}
        </button>
      ))}
      {error ? (
        <span className="text-[13px]" style={{ color: "var(--color-coral)" }} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
