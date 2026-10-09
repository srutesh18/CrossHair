"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignalActions({
  id,
  status,
  leadId,
  compact = false,
}: {
  id: string;
  status: "new" | "promoted" | "dismissed";
  leadId: string | null;
  /** Table rows: smaller buttons, short labels. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"promote" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function promote() {
    setBusy("promote");
    setError(null);
    try {
      const res = await fetch(`/api/signals/${id}/promote`, { method: "POST" });
      const body = (await res.json()) as { error?: string; leadId?: string };
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      router.push(`/signals?lead=${body.leadId ?? ""}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(null);
    }
  }

  async function setStatus(next: "new" | "dismissed") {
    setBusy("status");
    setError(null);
    try {
      const res = await fetch(`/api/signals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (status === "promoted" && leadId) {
    return (
      <a href={`/signals?lead=${leadId}`} className="ch-btn text-[13px]">
        Open lead
      </a>
    );
  }

  return (
    <div className={`flex flex-wrap items-center ${compact ? "justify-end gap-1" : "gap-2"}`}>
      <button
        type="button"
        className="ch-btn ch-btn-primary text-[13px]"
        disabled={busy !== null}
        onClick={() => void promote()}
        title="Score Pain / Fit / Trigger and add to your pipeline (uses Groq)"
      >
        {busy === "promote" ? "Scoring…" : compact ? "Score" : "Make lead"}
      </button>
      <button
        type="button"
        className="ch-btn text-[13px]"
        disabled={busy !== null}
        onClick={() => void setStatus(status === "dismissed" ? "new" : "dismissed")}
      >
        {status === "dismissed" ? "Restore" : "Dismiss"}
      </button>
      {error ? (
        <span className="w-full text-[12px]" role="alert" style={{ color: "var(--color-coral)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
