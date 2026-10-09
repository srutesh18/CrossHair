"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Recipient address and delete, for one lead. */
export function LeadSettings({ id, contactEmail }: { id: string; contactEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(contactEmail);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy("save");
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactEmail: email.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this lead, its scores and drafts? This cannot be undone.")) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Delete failed (${res.status})`);
      router.push("/signals");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label htmlFor={`email-${id}`} className="ch-label">
        Contact email
      </label>
      <input
        id={`email-${id}`}
        type="email"
        className="ch-input max-w-[260px]"
        placeholder="Only a verified, public address"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setSaved(false);
        }}
      />
      <button
        type="button"
        className="ch-btn"
        disabled={busy !== null || email.trim() === contactEmail}
        onClick={() => void save()}
      >
        {busy === "save" ? "Saving…" : "Save"}
      </button>
      {saved ? <span className="text-[13px]" style={{ color: "var(--color-mint)" }}>Saved.</span> : null}
      <span className="flex-1" />
      <button
        type="button"
        className="text-[13px] font-semibold"
        style={{ color: "var(--color-coral)" }}
        disabled={busy !== null}
        onClick={() => void remove()}
      >
        {busy === "delete" ? "Deleting…" : "Delete lead"}
      </button>
      {error ? (
        <p className="w-full rounded-[9px] px-3 py-2 text-sm" role="alert" style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
