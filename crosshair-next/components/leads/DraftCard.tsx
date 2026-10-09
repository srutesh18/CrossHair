"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailDraft } from "@/lib/types";

/** One drafted email. A human can edit it before approval; sent emails are locked. */
export function DraftCard({ draft }: { draft: EmailDraft }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="ch-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="ch-tag">Day {draft.day}</span>
        {draft.feature ? <span className="ch-label">{draft.feature}</span> : null}
        {draft.sent_at ? (
          <span className="ch-pill ch-pill-sent">Sent</span>
        ) : draft.approved_at ? (
          <span className="ch-pill ch-pill-sent">Approved</span>
        ) : null}
        {draft.edited_at ? <span className="ch-label">edited</span> : null}
        <span className="flex-1" />
        {!draft.sent_at && !editing ? (
          <button type="button" className="text-[13px] font-semibold" style={{ color: "var(--color-brand)" }} onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2">
          <input
            className="ch-input font-bold"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label={`Day ${draft.day} subject`}
          />
          <textarea
            className="ch-input"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label={`Day ${draft.day} body`}
          />
          <div className="flex gap-2">
            <button type="button" className="ch-btn ch-btn-primary" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="ch-btn"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setSubject(draft.subject);
                setBody(draft.body);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p className="rounded-[9px] px-3 py-2 text-sm" role="alert" style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="font-bold">{draft.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{draft.body}</p>
        </>
      )}
    </article>
  );
}
