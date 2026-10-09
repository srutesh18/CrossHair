"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Audits companies waiting in the queue, a small batch per request, until none
 * are left. Starts by itself whenever there is something pending.
 */
export function AuditRunner({ pending }: { pending: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (pending === 0 || started.current) return;
    started.current = true;
    setRunning(true);
    setTotal(pending);
    setDone(0);
    setError(null);

    void (async () => {
      let remaining = pending;
      let audited = 0;
      try {
        while (remaining > 0) {
          const res = await fetch("/api/companies/audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          const json = (await res.json()) as { audited?: number; remaining?: number; error?: string };
          if (!res.ok) throw new Error(json.error ?? `Audit failed (${res.status})`);
          audited += json.audited ?? 0;
          remaining = json.remaining ?? 0;
          setDone(audited);
          setTotal(audited + remaining);
          router.refresh();
          if ((json.audited ?? 0) === 0) break;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Audit failed");
      } finally {
        setRunning(false);
        started.current = false;
        router.refresh();
      }
    })();
  }, [pending, router]);

  if (!running && !error) return null;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="ch-card py-3" role="status" aria-live="polite">
      {error ? (
        <p className="text-sm" style={{ color: "var(--color-coral)" }}>
          {error}
        </p>
      ) : (
        <>
          <div className="mb-1.5 flex items-center justify-between text-[13px]">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Auditing websites for flaws and contact details…
            </span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {done}/{total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--color-raise)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--color-brand)" }} />
          </div>
        </>
      )}
    </div>
  );
}
