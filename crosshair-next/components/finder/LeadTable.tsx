"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignalActions } from "./SignalActions";

export interface LeadRow {
  id: string;
  intent: number;
  categoryLabel: string;
  title: string;
  body: string;
  author: string;
  sourceLabel: string;
  sourceName: string;
  url: string;
  service: string;
  competitor: string;
  postedAt: string | null;
  status: "new" | "promoted" | "dismissed";
  leadId: string | null;
}

type Channel = "email" | "call" | "linkedin";

const CHANNELS: Record<Channel, { title: string; via: string; body: string }> = {
  email: {
    title: "Email automation",
    via: "SMTP / email provider",
    body: "Send a personalised email sequence (Day 0, 3, 7) to the selected leads, written from your service and their post, with a human approving each one.",
  },
  call: {
    title: "Call automation",
    via: "Sarvam AI voice",
    body: "Place AI voice calls to selected leads who shared a phone number, using Sarvam's speech APIs, with a script built from their post and your service.",
  },
  linkedin: {
    title: "LinkedIn DM automation",
    via: "n8n workflow",
    body: "Hand the selected leads to an n8n workflow that finds their LinkedIn profile and sends a short, personalised connection message.",
  },
};

function intentColor(n: number): string {
  if (n >= 60) return "var(--color-mint)";
  if (n >= 35) return "var(--color-amber)";
  return "var(--color-muted)";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function WipDialog({ channel, count, onClose }: { channel: Channel; count: number; onClose: () => void }) {
  const c = CHANNELS[channel];
  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center p-4"
      style={{ background: "rgba(31,36,51,.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wip-title"
      onClick={onClose}
    >
      <div className="ch-card w-full max-w-[460px] p-6" onClick={(e) => e.stopPropagation()}>
        <span className="ch-pill" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber)" }}>
          Work in progress
        </span>
        <h2 id="wip-title" className="mt-3 text-lg font-semibold">
          {c.title}
        </h2>
        <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>
          via {c.via}
        </p>
        <p className="mt-3 text-sm">{c.body}</p>
        <p className="mt-3 text-sm" style={{ color: "var(--color-muted)" }}>
          This isn&apos;t switched on yet, so nothing was sent to your {count} selected lead
          {count === 1 ? "" : "s"}. Use <b>Export selected</b> to take them with you for now.
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" className="ch-btn ch-btn-primary" onClick={onClose} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function LeadTable({ rows }: { rows: LeadRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [wip, setWip] = useState<Channel | null>(null);
  const [busy, setBusy] = useState<"export" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const visibleSelected = ids.filter((id) => selected.has(id));
  const allOn = ids.length > 0 && visibleSelected.length === ids.length;
  const sort = params.get("sort") === "recent" ? "recent" : "intent";

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function setSort(next: "intent" | "recent") {
    const p = new URLSearchParams(params.toString());
    if (next === "intent") p.delete("sort");
    else p.set("sort", next);
    router.replace(`/finder${p.toString() ? `?${p.toString()}` : ""}`);
  }

  async function exportSelected() {
    setBusy("export");
    setError(null);
    try {
      const res = await fetch("/api/export/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: visibleSelected }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "crosshair-leads.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
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

  async function dismissSelected() {
    setBusy("dismiss");
    setError(null);
    try {
      const res = await fetch("/api/signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: visibleSelected, status: "dismissed" }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const SortHead = ({ k, label }: { k: "intent" | "recent"; label: string }) => (
    <button type="button" onClick={() => setSort(k)} className="inline-flex items-center gap-1 font-semibold uppercase">
      {label}
      <span aria-hidden style={{ opacity: sort === k ? 1 : 0.3 }}>↓</span>
    </button>
  );

  return (
    <div className="space-y-2">
      {visibleSelected.length > 0 ? (
        <div
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-[12px] px-3 py-2 text-sm shadow-sm"
          style={{ background: "var(--color-fg)", color: "var(--color-bg)" }}
          role="toolbar"
          aria-label="Selected leads"
        >
          <b>{visibleSelected.length} selected</b>
          <button type="button" className="ml-1 text-[12px] underline" onClick={() => setSelected(new Set())}>
            clear
          </button>
          <span className="flex-1" />
          <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void exportSelected()}>
            {busy === "export" ? "Exporting…" : "Export selected"}
          </button>
          <button type="button" className="ch-btn text-[13px]" onClick={() => setWip("email")}>
            Email
          </button>
          <button type="button" className="ch-btn text-[13px]" onClick={() => setWip("call")}>
            Call (Sarvam)
          </button>
          <button type="button" className="ch-btn text-[13px]" onClick={() => setWip("linkedin")}>
            LinkedIn DM (n8n)
          </button>
          <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void dismissSelected()}>
            {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-[9px] px-3 py-2 text-sm" role="alert" style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}>
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-[14px] border" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-[11px] tracking-wide" style={{ color: "var(--color-muted)", background: "var(--color-raise)" }}>
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allOn}
                  aria-label="Select all"
                  onChange={() => {
                    const next = new Set(selected);
                    if (allOn) ids.forEach((id) => next.delete(id));
                    else ids.forEach((id) => next.add(id));
                    setSelected(next);
                  }}
                />
              </th>
              <th className="w-20 px-2 py-2.5"><SortHead k="intent" label="Intent" /></th>
              <th className="px-2 py-2.5 font-semibold uppercase">Lead</th>
              <th className="w-40 px-2 py-2.5 font-semibold uppercase">Category</th>
              <th className="w-36 px-2 py-2.5 font-semibold uppercase">Matched</th>
              <th className="w-32 px-2 py-2.5 font-semibold uppercase">Source</th>
              <th className="w-24 px-2 py-2.5"><SortHead k="recent" label="Posted" /></th>
              <th className="w-44 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  className="border-t align-top"
                  style={{ borderColor: "var(--color-line)", background: on ? "var(--color-brand-soft)" : undefined }}
                >
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={on} onChange={() => toggle(r.id)} aria-label={`Select ${r.title || r.author}`} />
                  </td>
                  <td className="px-2 py-3">
                    <span className="font-semibold" style={{ color: intentColor(r.intent), fontFamily: "var(--font-mono)" }}>
                      {r.intent}
                    </span>
                    <span className="mt-1 block h-1 w-12 overflow-hidden rounded-full" style={{ background: "var(--color-raise)" }}>
                      <span className="block h-full rounded-full" style={{ width: `${r.intent}%`, background: intentColor(r.intent) }} />
                    </span>
                  </td>
                  <td className="max-w-0 px-2 py-3">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate font-semibold hover:underline">
                      {r.title || r.body.slice(0, 90)}
                    </a>
                    <p className="line-clamp-2 text-[12px]" style={{ color: "var(--color-muted)" }}>
                      {r.body}
                    </p>
                    <p className="mt-0.5 truncate text-[12px]">{r.author}</p>
                  </td>
                  <td className="px-2 py-3">
                    <span className="ch-pill" style={{ background: "var(--color-brand-soft)", color: "var(--color-brand)" }}>
                      {r.categoryLabel}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-[12px]">
                    {r.service ? <span className="ch-tag">{r.service}</span> : null}
                    {r.competitor ? <span className="block" style={{ color: "var(--color-muted)" }}>vs {r.competitor}</span> : null}
                  </td>
                  <td className="px-2 py-3 text-[12px]" title={r.sourceName}>
                    {r.sourceLabel}
                    <span className="block truncate" style={{ color: "var(--color-muted)" }}>
                      {r.sourceName.replace(/^(Reddit|Stack Exchange|Forum|Web|GitHub) /, "")}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-[12px]" style={{ fontFamily: "var(--font-mono)", color: "var(--color-muted)" }}>
                    {fmtDate(r.postedAt)}
                  </td>
                  <td className="px-2 py-3">
                    <SignalActions id={r.id} status={r.status} leadId={r.leadId} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {wip ? <WipDialog channel={wip} count={visibleSelected.length} onClose={() => setWip(null)} /> : null}
    </div>
  );
}
