"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LeadWithDetail } from "@/lib/types";
import { canDraft } from "@/lib/tier";

type Action = "score" | "draft" | "approve";

export function LeadActions({ lead }: { lead: LeadWithDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: Action) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/${action}`, { method: "POST" });
      const body = (await res.json()) as { error?: string; note?: string; tier?: string };
      if (!res.ok) throw new Error(body.error ?? `${action} failed (${res.status})`);
      if (body.note) setNotice(body.note);
      else if (action === "score") setNotice(`Scored: ${body.tier}`);
      else if (action === "draft") setNotice("Drafts ready for review.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  const draftable = lead.tier !== null && canDraft(lead.tier);
  const hasDay0 = lead.drafts.some((d) => d.day === 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="ch-btn"
          disabled={busy !== null}
          onClick={() => void run("score")}
        >
          {busy === "score" ? "Scoring…" : lead.scores ? "Re-score" : "Score lead"}
        </button>

        <button
          type="button"
          className="ch-btn"
          disabled={busy !== null || !draftable}
          title={draftable ? undefined : "Hold leads never get an email"}
          onClick={() => void run("draft")}
        >
          {busy === "draft" ? "Drafting…" : "Draft Day 0/3/7"}
        </button>

        <button
          type="button"
          className="ch-btn ch-btn-primary"
          disabled={busy !== null || !draftable || !hasDay0}
          title={draftable ? undefined : "Hold leads can never be approved"}
          onClick={() => void run("approve")}
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>

        <span className="ch-label">Draft mode &middot; nothing is really sent</span>
      </div>

      {notice ? (
        <p
          className="rounded-[9px] px-3 py-2 text-sm"
          style={{ background: "var(--color-mint-bg)", color: "var(--color-mint)" }}
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-[9px] px-3 py-2 text-sm"
          role="alert"
          style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
