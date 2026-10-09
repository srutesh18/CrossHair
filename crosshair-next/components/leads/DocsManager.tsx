"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DocRow {
  id: string;
  title: string;
  slug: string;
  chunks: number;
}

type Busy = "upload" | `delete:${string}` | null;

/**
 * Product docs for RAG. Uploads are embedded server-side under the user's own
 * session, so they land in their org only.
 */
export function DocsManager({ docs }: { docs: DocRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function post(body: unknown, kind: "upload") {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string; docs?: Array<{ chunks: number }> };
      if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
      const n = json.docs?.length ?? 0;
      const chunks = json.docs?.reduce((sum, d) => sum + d.chunks, 0) ?? 0;
      setNotice(`Embedded ${n} doc${n === 1 ? "" : "s"} (${chunks} chunks).`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const docsIn = await Promise.all(
      files.map(async (f) => ({ name: f.name, content: await f.text() })),
    );
    await post({ docs: docsIn }, "upload");
  }

  async function remove(id: string) {
    setBusy(`delete:${id}`);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/docs/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Delete failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  const totalChunks = docs.reduce((sum, d) => sum + d.chunks, 0);

  return (
    <section className="ch-card">
      <h2 className="ch-label mb-2">Product docs (RAG)</h2>
      <p className="text-sm">
        <b>{docs.length}</b> doc{docs.length === 1 ? "" : "s"}, <b>{totalChunks}</b> embedded chunk
        {totalChunks === 1 ? "" : "s"}.
      </p>
      <p className="mt-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
        The email writer may only reference a feature that appears in these docs, so it never
        invents a claim. Upload Markdown or plain-text files describing your product.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className={`ch-btn ch-btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy === "upload" ? "Embedding…" : "Upload docs"}
          <input
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            multiple
            className="sr-only"
            disabled={busy !== null}
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-muted)" }}>
        The first upload after a deploy downloads the embedding model (~23 MB), so it can take a
        little longer.
      </p>

      {docs.length === 0 ? (
        <p
          className="mt-3 rounded-[9px] px-3 py-2 text-[13px]"
          style={{ background: "var(--color-amber-bg)", color: "var(--color-amber)" }}
        >
          No docs yet. Drafting will refuse until at least one doc is embedded.
        </p>
      ) : (
        <ul className="mt-3 divide-y text-sm" style={{ borderColor: "var(--color-line)" }}>
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2" style={{ borderColor: "var(--color-line)" }}>
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              <span className="ch-tag">{d.chunks} chunks</span>
              <button
                type="button"
                className="text-[12px] font-semibold"
                style={{ color: "var(--color-coral)" }}
                disabled={busy !== null}
                onClick={() => void remove(d.id)}
                aria-label={`Delete ${d.title}`}
              >
                {busy === `delete:${d.id}` ? "Deleting…" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
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
