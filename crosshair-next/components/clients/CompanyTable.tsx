"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface FlawView {
  key: string;
  area: string;
  areaLabel: string;
  severity: "high" | "medium" | "low";
  title: string;
  evidence: string;
}

export interface CompanyRow {
  id: string;
  name: string;
  website: string;
  domain: string;
  category: string;
  address: string;
  rating: number | null;
  ratingCount: number | null;
  score: number;
  flaws: FlawView[];
  services: string[];
  emails: string[];
  phone: string;
  contactPage: string;
  socials: Record<string, string>;
  status: "new" | "audited" | "failed" | "contacted" | "dismissed";
  auditError: string;
  source: string;
  foundUrl: string;
  foundTitle: string;
  foundAuthor: string;
}

const SOURCE_LABEL: Record<string, string> = {
  reddit: "Reddit",
  hn: "Hacker News",
  forum: "Community",
  google_places: "Google",
  manual: "Added by you",
  csv: "CSV",
};

type Channel = "email" | "call" | "linkedin";

const CHANNELS: Record<Channel, { title: string; via: string; body: string }> = {
  email: {
    title: "Email automation",
    via: "your email provider",
    body: "Send each selected company a personalised email built from the flaws found on their site (\"your homepage takes 8s on mobile…\"), with a Day 3 and Day 7 follow-up, after you approve them.",
  },
  call: {
    title: "Call automation",
    via: "Sarvam AI voice",
    body: "Call the selected companies' public phone numbers with a Sarvam AI voice agent that explains the problems found on their website and books a meeting.",
  },
  linkedin: {
    title: "LinkedIn DM automation",
    via: "n8n workflow",
    body: "Send the selected companies to an n8n workflow that finds the owner or marketing lead on LinkedIn and sends a short, personalised message.",
  },
};

const SEV_COLOR: Record<FlawView["severity"], string> = {
  high: "var(--color-coral)",
  medium: "var(--color-amber)",
  low: "var(--color-muted)",
};

function scoreColor(n: number): string {
  if (n >= 60) return "var(--color-mint)";
  if (n >= 35) return "var(--color-amber)";
  return "var(--color-muted)";
}

function WipDialog({ channel, count, onClose }: { channel: Channel; count: number; onClose: () => void }) {
  const c = CHANNELS[channel];
  return (
    <div className="fixed inset-0 z-30 grid place-items-center p-4" style={{ background: "rgba(31,36,51,.55)" }} role="dialog" aria-modal="true" aria-labelledby="wip-title" onClick={onClose}>
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
          This isn&apos;t switched on yet, so nothing was sent to your {count} selected compan{count === 1 ? "y" : "ies"}.
          Use <b>Export selected</b> to take their details and flaws with you for now.
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

function Contact({ r }: { r: CompanyRow }) {
  if (r.emails[0]) {
    return (
      <a href={`mailto:${r.emails[0]}`} className="block truncate hover:underline" title={r.emails.join(", ")}>
        {r.emails[0]}
        {r.emails.length > 1 ? <span style={{ color: "var(--color-muted)" }}> +{r.emails.length - 1}</span> : null}
      </a>
    );
  }
  if (r.phone) return <a href={`tel:${r.phone}`} className="block truncate hover:underline">{r.phone}</a>;
  if (r.contactPage) {
    return (
      <a href={r.contactPage} target="_blank" rel="noopener noreferrer" className="block truncate underline" style={{ color: "var(--color-brand)" }}>
        Contact form
      </a>
    );
  }
  if (r.foundUrl) {
    // They posted publicly asking for opinions: replying there is welcome.
    return (
      <a href={r.foundUrl} target="_blank" rel="noopener noreferrer" className="block truncate underline" style={{ color: "var(--color-brand)" }}>
        Reply to their post
      </a>
    );
  }
  return <span style={{ color: "var(--color-muted)" }}>No public contact</span>;
}

export function CompanyTable({ rows }: { rows: CompanyRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [wip, setWip] = useState<Channel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const chosen = ids.filter((id) => selected.has(id));
  const allOn = ids.length > 0 && chosen.length === ids.length;
  const sort = params.get("sort") === "recent" ? "recent" : "score";

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function setSort(next: "score" | "recent") {
    const p = new URLSearchParams(params.toString());
    if (next === "score") p.delete("sort");
    else p.set("sort", next);
    router.replace(`/finder${p.toString() ? `?${p.toString()}` : ""}`);
  }

  async function bulk(kind: string, init: RequestInit & { url: string }) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(init.url, { ...init, headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Failed (${res.status})`);
      }
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function exportSelected() {
    const res = await bulk("export", { url: "/api/export/companies", method: "POST", body: JSON.stringify({ ids: chosen }) });
    if (!res) return;
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "crosshair-companies.csv";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function setStatus(status: "dismissed" | "contacted" | "restore") {
    const res = await bulk(status, { url: "/api/companies", method: "PATCH", body: JSON.stringify({ ids: chosen, status }) });
    if (res) {
      setSelected(new Set());
      router.refresh();
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${chosen.length} compan${chosen.length === 1 ? "y" : "ies"}? This cannot be undone.`)) return;
    const res = await bulk("delete", { url: "/api/companies", method: "DELETE", body: JSON.stringify({ ids: chosen }) });
    if (res) {
      setSelected(new Set());
      router.refresh();
    }
  }

  async function reaudit(id: string) {
    const res = await bulk(`reaudit:${id}`, { url: "/api/companies/audit", method: "POST", body: JSON.stringify({ ids: [id] }) });
    if (res) router.refresh();
  }

  const showingClosed = rows.some((r) => r.status === "dismissed" || r.status === "contacted");

  const SortHead = ({ k, label }: { k: "score" | "recent"; label: string }) => (
    <button type="button" onClick={() => setSort(k)} className="inline-flex items-center gap-1 font-semibold uppercase">
      {label}
      <span aria-hidden style={{ opacity: sort === k ? 1 : 0.3 }}>↓</span>
    </button>
  );

  return (
    <div className="space-y-2">
      {chosen.length > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-[12px] px-3 py-2 text-sm shadow-sm" style={{ background: "var(--color-fg)", color: "var(--color-bg)" }} role="toolbar" aria-label="Selected companies">
          <b>{chosen.length} selected</b>
          <button type="button" className="ml-1 text-[12px] underline" onClick={() => setSelected(new Set())}>
            clear
          </button>
          <span className="flex-1" />
          <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void exportSelected()}>
            {busy === "export" ? "Exporting…" : "Export selected"}
          </button>
          <button type="button" className="ch-btn text-[13px]" onClick={() => setWip("email")}>Email</button>
          <button type="button" className="ch-btn text-[13px]" onClick={() => setWip("call")}>Call (Sarvam)</button>
          <button type="button" className="ch-btn text-[13px]" onClick={() => setWip("linkedin")}>LinkedIn DM (n8n)</button>
          {showingClosed ? (
            <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void setStatus("restore")}>Restore</button>
          ) : (
            <>
              <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void setStatus("contacted")}>Mark contacted</button>
              <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void setStatus("dismissed")}>Dismiss</button>
            </>
          )}
          <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void remove()}>Delete</button>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-[9px] px-3 py-2 text-sm" role="alert" style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}>
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-[14px] border" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
        <table className="w-full min-w-[920px] text-left text-sm">
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
              <th className="w-20 px-2 py-2.5"><SortHead k="score" label="Score" /></th>
              <th className="w-56 px-2 py-2.5 font-semibold uppercase">Company</th>
              <th className="px-2 py-2.5 font-semibold uppercase">Flaws found</th>
              <th className="w-36 px-2 py-2.5 font-semibold uppercase">Fix with</th>
              <th className="w-48 px-2 py-2.5 font-semibold uppercase">Contact</th>
              <th className="w-32 px-2 py-2.5"><SortHead k="recent" label="Found" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = selected.has(r.id);
              const expanded = open === r.id;
              const top = r.flaws.slice(0, 3);
              return (
                <Fragment key={r.id}>
                  <tr
                    className="cursor-pointer border-t align-top"
                    style={{ borderColor: "var(--color-line)", background: on ? "var(--color-brand-soft)" : undefined }}
                    onClick={() => setOpen(expanded ? null : r.id)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={on} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
                    </td>
                    <td className="px-2 py-3">
                      {r.status === "new" ? (
                        <span className="text-[12px]" style={{ color: "var(--color-muted)" }}>auditing…</span>
                      ) : r.status === "failed" ? (
                        <span className="text-[12px]" style={{ color: "var(--color-coral)" }}>failed</span>
                      ) : (
                        <>
                          <span className="font-semibold" style={{ color: scoreColor(r.score), fontFamily: "var(--font-mono)" }}>{r.score}</span>
                          <span className="mt-1 block h-1 w-12 overflow-hidden rounded-full" style={{ background: "var(--color-raise)" }}>
                            <span className="block h-full rounded-full" style={{ width: `${r.score}%`, background: scoreColor(r.score) }} />
                          </span>
                        </>
                      )}
                    </td>
                    <td className="max-w-0 px-2 py-3">
                      <b className="block truncate">{r.name}</b>
                      {r.website ? (
                        <a href={r.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block truncate text-[12px] underline" style={{ color: "var(--color-brand)" }}>
                          {r.domain}
                        </a>
                      ) : (
                        <span className="block text-[12px]" style={{ color: "var(--color-coral)" }}>no website</span>
                      )}
                      <span className="block truncate text-[12px]" style={{ color: "var(--color-muted)" }}>
                        {[r.category, r.rating ? `★ ${r.rating}${r.ratingCount ? ` (${r.ratingCount})` : ""}` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      {r.status === "failed" ? (
                        <span className="text-[12px]" style={{ color: "var(--color-muted)" }}>{r.auditError}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {top.map((f) => (
                            <span key={f.key} className="rounded-full border px-2 py-0.5 text-[12px]" style={{ borderColor: "var(--color-line)" }} title={f.evidence}>
                              <span aria-hidden style={{ color: SEV_COLOR[f.severity] }}>● </span>
                              {f.title}
                            </span>
                          ))}
                          {r.flaws.length > 3 ? (
                            <span className="px-1 text-[12px]" style={{ color: "var(--color-muted)" }}>+{r.flaws.length - 3} more</span>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-[12px]">
                      {r.services.map((s) => (
                        <span key={s} className="ch-tag mr-1 mb-1 inline-block">{s}</span>
                      ))}
                    </td>
                    <td className="max-w-0 px-2 py-3 text-[13px]" onClick={(e) => e.stopPropagation()}>
                      <Contact r={r} />
                    </td>
                    <td className="max-w-0 px-2 py-3 text-[12px]" onClick={(e) => e.stopPropagation()}>
                      {r.foundUrl ? (
                        <a href={r.foundUrl} target="_blank" rel="noopener noreferrer" className="block truncate hover:underline" title={r.foundTitle}>
                          {SOURCE_LABEL[r.source] ?? r.source}
                        </a>
                      ) : (
                        <span className="block truncate">{SOURCE_LABEL[r.source] ?? r.source}</span>
                      )}
                      <span className="block truncate" style={{ color: "var(--color-muted)" }}>{r.foundAuthor}</span>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-t" style={{ borderColor: "var(--color-line)", background: "var(--color-raise)" }}>
                      <td />
                      <td colSpan={6} className="px-2 py-4">
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                          <div>
                            <h3 className="ch-label mb-2">Everything found on {r.domain || r.name}</h3>
                            {r.flaws.length === 0 ? (
                              <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>{r.auditError || "No flaws found."}</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {r.flaws.map((f) => (
                                  <li key={f.key} className="text-[13px]">
                                    <span className="font-semibold" style={{ color: SEV_COLOR[f.severity] }}>{f.severity}</span>{" "}
                                    <span className="ch-tag">{f.areaLabel}</span> <b>{f.title}.</b> {f.evidence}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="space-y-1 text-[13px]">
                            <h3 className="ch-label mb-2">Contact</h3>
                            {r.emails.map((e) => (
                              <a key={e} href={`mailto:${e}`} className="block truncate hover:underline">{e}</a>
                            ))}
                            {r.phone ? <a href={`tel:${r.phone}`} className="block hover:underline">{r.phone}</a> : null}
                            {r.contactPage ? (
                              <a href={r.contactPage} target="_blank" rel="noopener noreferrer" className="block truncate underline" style={{ color: "var(--color-brand)" }}>Contact page</a>
                            ) : null}
                            {Object.entries(r.socials).map(([k, v]) => (
                              <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="block truncate capitalize underline" style={{ color: "var(--color-brand)" }}>{k}</a>
                            ))}
                            {r.address ? <p style={{ color: "var(--color-muted)" }}>{r.address}</p> : null}
                            {r.foundUrl ? (
                              <>
                                <h3 className="ch-label mt-3 mb-1">Where we found them</h3>
                                <a href={r.foundUrl} target="_blank" rel="noopener noreferrer" className="block underline" style={{ color: "var(--color-brand)" }}>
                                  {SOURCE_LABEL[r.source] ?? r.source} post by {r.foundAuthor || "the owner"}
                                </a>
                                <p className="line-clamp-3" style={{ color: "var(--color-muted)" }}>{r.foundTitle}</p>
                              </>
                            ) : null}
                            {r.website ? (
                              <button type="button" className="ch-btn mt-2 text-[12px]" disabled={busy !== null} onClick={() => void reaudit(r.id)}>
                                {busy === `reaudit:${r.id}` ? "Re-auditing…" : "Re-audit"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {wip ? <WipDialog channel={wip} count={chosen.length} onClose={() => setWip(null)} /> : null}
    </div>
  );
}
