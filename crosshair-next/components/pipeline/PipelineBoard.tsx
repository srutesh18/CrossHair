"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TriggerBadge } from "@/components/clients/Panels";

export type Column = "to_contact" | "due" | "waiting" | "replied" | "closed";

export interface SentEmail {
  id: string;
  step: number;
  to: string;
  subject: string;
  body: string;
  method: "smtp" | "mail_app";
  sentAt: string;
}

export interface PipelineCard {
  id: string;
  column: Column;
  stage: "to_contact" | "emailed" | "replied" | "won" | "lost";
  nextStep: number;
  nextActionAt: string | null;
  notes: string;
  company: {
    name: string;
    domain: string;
    website: string;
    score: number;
    emails: string[];
    phone: string;
    contactPage: string;
    foundUrl: string;
    triggerKind: string;
    triggerHeadline: string;
    topFlaws: string[];
  };
  emails: SentEmail[];
}

const COLUMNS: Array<{ key: Column; title: string; hint: string }> = [
  { key: "to_contact", title: "To contact", hint: "Write the first email" },
  { key: "due", title: "Follow-up due", hint: "Their follow-up is ready to send" },
  { key: "waiting", title: "Waiting", hint: "Emailed; next follow-up is scheduled" },
  { key: "replied", title: "Replied", hint: "Follow-ups stopped" },
  { key: "closed", title: "Won / lost", hint: "Done" },
];

const STEPS = ["Day 0", "Day 3", "Day 7"];

function when(iso: string | null): string {
  if (!iso) return "";
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function nextLabel(c: PipelineCard): string {
  if (c.stage === "replied") return "Replied: follow-ups stopped";
  if (c.stage === "won") return "Won";
  if (c.stage === "lost") return "Lost";
  if (c.nextStep >= 3) return "Sequence finished";
  if (c.stage === "to_contact") return "First email not sent yet";
  return `${STEPS[c.nextStep]} follow-up due ${when(c.nextActionAt)}`;
}

function Card({ c, onOpen }: { c: PipelineCard; onOpen: () => void }) {
  const sentSteps = new Set(c.emails.map((e) => e.step));
  return (
    <button
      type="button"
      onClick={onOpen}
      className="ch-card block w-full text-left transition hover:-translate-y-0.5 hover:shadow-md"
      style={c.column === "due" ? { borderColor: "var(--color-brand)" } : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[14px]">{c.company.name}</b>
          <span className="block truncate text-[12px]" style={{ color: "var(--color-muted)" }}>{c.company.domain}</span>
        </div>
        <span className="text-[13px] font-semibold" style={{ fontFamily: "var(--font-mono)", color: c.company.score >= 60 ? "var(--color-mint)" : "var(--color-amber)" }}>
          {c.company.score}
        </span>
      </div>
      {c.company.triggerKind ? (
        <div className="mt-1.5">
          <TriggerBadge kind={c.company.triggerKind} />
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-1" aria-label="Sequence progress">
        {STEPS.map((s, i) => (
          <span
            key={s}
            title={`${s}${sentSteps.has(i) ? ": sent" : ""}`}
            className="h-1.5 flex-1 rounded-full"
            style={{ background: sentSteps.has(i) ? "var(--color-mint)" : "var(--color-raise)" }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[12px]" style={{ color: c.column === "due" ? "var(--color-brand)" : "var(--color-muted)" }}>
        {nextLabel(c)}
      </p>
      <p className="mt-0.5 truncate text-[12px]">{c.company.emails[0] ?? (c.company.phone || "No email found")}</p>
    </button>
  );
}

type Provider = "app" | "gmail" | "outlook";

function composeUrl(provider: Provider, to: string, subject: string, body: string): string {
  const q = encodeURIComponent;
  if (provider === "gmail") return `https://mail.google.com/mail/?view=cm&fs=1&to=${q(to)}&su=${q(subject)}&body=${q(body)}`;
  if (provider === "outlook") return `https://outlook.office.com/mail/deeplink/compose?to=${q(to)}&subject=${q(subject)}&body=${q(body)}`;
  return `mailto:${encodeURIComponent(to)}?subject=${q(subject)}&body=${q(body)}`;
}

function Composer({ c, smtp, onClose }: { c: PipelineCard; smtp: boolean; onClose: () => void }) {
  const router = useRouter();
  const sentSteps = new Set(c.emails.map((e) => e.step));
  const firstUnsent = [0, 1, 2].find((s) => !sentSteps.has(s)) ?? 2;
  const [step, setStep] = useState<number>(c.nextStep >= 3 ? firstUnsent : c.nextStep);
  const [to, setTo] = useState(c.company.emails[0] ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [notes, setNotes] = useState(c.notes);
  const closed = c.stage === "won" || c.stage === "lost";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOpened(false);
    fetch(`/api/pipeline/${c.id}/compose?step=${step}`)
      .then(async (res) => {
        const json = (await res.json()) as { subject?: string; body?: string; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Could not write the email");
        if (!cancelled) {
          setSubject(json.subject ?? "");
          setBody(json.body ?? "");
        }
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [c.id, step]);

  async function call(kind: string, url: string, init: RequestInit) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function record(method: "smtp" | "mail_app") {
    const ok = await call(method, `/api/pipeline/${c.id}/send`, {
      method: "POST",
      body: JSON.stringify({ step, to, subject, body, method }),
    });
    if (ok) {
      setNotice(method === "smtp" ? `Sent to ${to}. ${step < 2 ? `${STEPS[step + 1]} follow-up scheduled.` : "Sequence finished."}` : `Recorded. ${step < 2 ? `${STEPS[step + 1]} follow-up scheduled.` : "Sequence finished."}`);
      setOpened(false);
    }
  }

  const setStage = (stage: string) => call(stage, `/api/pipeline/${c.id}`, { method: "PATCH", body: JSON.stringify({ stage }) });

  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(31,36,51,.45)" }} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="composer-title">
      <aside className="flex h-full w-full max-w-[640px] flex-col overflow-y-auto shadow-2xl" style={{ background: "var(--color-bg)" }} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b px-5 py-4" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
          <div className="min-w-0 flex-1">
            <h2 id="composer-title" className="truncate text-lg font-semibold">{c.company.name}</h2>
            <a href={c.company.website} target="_blank" rel="noopener noreferrer" className="text-[13px] underline" style={{ color: "var(--color-brand)" }}>
              {c.company.domain}
            </a>
            {c.company.triggerKind ? (
              <p className="mt-1 text-[12px]" style={{ color: "var(--color-muted)" }}>
                <TriggerBadge kind={c.company.triggerKind} /> {c.company.triggerHeadline}
              </p>
            ) : null}
          </div>
          <button type="button" className="ch-btn text-[13px]" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="flex gap-1" role="tablist" aria-label="Sequence step">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={step === i}
                onClick={() => setStep(i)}
                className="flex-1 rounded-[9px] border px-3 py-2 text-[13px] font-semibold"
                style={step === i ? { background: "var(--color-fg)", color: "var(--color-bg)", borderColor: "var(--color-fg)" } : { borderColor: "var(--color-line)" }}
              >
                {s} {sentSteps.has(i) ? "✓" : ""}
                <span className="block text-[11px] font-normal opacity-70">{["first email", "follow-up", "last note"][i]}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="block text-[13px] font-semibold" htmlFor="to">To</label>
            <input id="to" className="ch-input" type="email" list="found-emails" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" />
            <datalist id="found-emails">
              {c.company.emails.map((e) => <option key={e} value={e} />)}
            </datalist>
            {c.company.emails.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>
                No public email on their site.{" "}
                {c.company.contactPage ? <a className="underline" href={c.company.contactPage} target="_blank" rel="noopener noreferrer">Use their contact form</a> : null}
                {c.company.contactPage && c.company.foundUrl ? " or " : ""}
                {c.company.foundUrl ? <a className="underline" href={c.company.foundUrl} target="_blank" rel="noopener noreferrer">reply to their post</a> : null}
                {c.company.phone ? ` · phone ${c.company.phone}` : ""}
              </p>
            ) : null}
            <label className="block pt-1 text-[13px] font-semibold" htmlFor="subject">Subject</label>
            <input id="subject" className="ch-input" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={loading} />
            <label className="block pt-1 text-[13px] font-semibold" htmlFor="body">Email</label>
            <textarea id="body" className="ch-input font-[inherit] leading-relaxed" rows={14} value={loading ? "Writing from their audit and news…" : body} onChange={(e) => setBody(e.target.value)} disabled={loading} />
          </div>

          {error ? <p className="rounded-[9px] px-3 py-2 text-sm" role="alert" style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}>{error}</p> : null}
          {notice ? <p className="rounded-[9px] px-3 py-2 text-sm" style={{ background: "var(--color-mint-bg)", color: "var(--color-mint)" }}>{notice}</p> : null}

          {closed ? (
            <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>This company is closed. Reopen it below to email again.</p>
          ) : opened ? (
            <div className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-brand)", background: "var(--color-brand-soft)" }}>
              <p className="text-[13px] font-semibold">Did you send it from your email?</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="ch-btn ch-btn-primary text-[13px]" disabled={busy !== null} onClick={() => void record("mail_app")}>
                  {busy === "mail_app" ? "Saving…" : "Yes, I sent it"}
                </button>
                <button type="button" className="ch-btn text-[13px]" onClick={() => setOpened(false)}>Not yet</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {smtp ? (
                <button type="button" className="ch-btn ch-btn-primary" disabled={busy !== null || loading || !to} onClick={() => void record("smtp")}>
                  {busy === "smtp" ? "Sending…" : "Send now"}
                </button>
              ) : null}
              {(["gmail", "outlook", "app"] as const).map((p) => (
                <a
                  key={p}
                  href={to && !loading ? composeUrl(p, to, subject, body) : undefined}
                  target={p === "app" ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  onClick={() => to && !loading && setOpened(true)}
                  aria-disabled={!to || loading}
                  className={`ch-btn text-[13px] ${!smtp && p === "gmail" ? "ch-btn-primary" : ""} ${!to || loading ? "pointer-events-none opacity-50" : ""}`}
                >
                  {p === "gmail" ? "Open in Gmail" : p === "outlook" ? "Open in Outlook" : "Open in email app"}
                </a>
              ))}
              <button type="button" className="ch-btn text-[13px]" disabled={loading} onClick={() => void navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => setNotice("Copied."))}>
                Copy
              </button>
              {!smtp ? (
                <p className="w-full text-[12px]" style={{ color: "var(--color-muted)" }}>
                  Opens a ready-to-send draft in your own email. To send from here instead, add SMTP details (see Templates).
                </p>
              ) : null}
            </div>
          )}

          <section>
            <h3 className="ch-label mb-2">History</h3>
            {c.emails.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>Nothing sent yet.</p>
            ) : (
              <ul className="space-y-2">
                {c.emails.map((e) => (
                  <li key={e.id} className="ch-card py-2.5">
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="ch-tag">{STEPS[e.step]}</span>
                      <span className="min-w-0 flex-1 truncate">to {e.to}</span>
                      <span style={{ color: "var(--color-muted)" }}>{e.method === "smtp" ? "sent here" : "sent from your email"} · {ago(e.sentAt)}</span>
                    </div>
                    <details className="mt-1">
                      <summary className="cursor-pointer truncate text-[13px] font-semibold">{e.subject}</summary>
                      <p className="mt-1 whitespace-pre-wrap text-[12px]">{e.body}</p>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <label className="ch-label mb-2 block" htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              className="ch-input text-[13px]"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== c.notes && void call("notes", `/api/pipeline/${c.id}`, { method: "PATCH", body: JSON.stringify({ notes }) })}
              placeholder="Call notes, who replied, next steps…"
            />
          </section>

          <section className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
            {closed || c.stage === "replied" ? (
              <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void setStage(c.emails.length ? "emailed" : "to_contact")}>Reopen</button>
            ) : (
              <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void setStage("replied")}>They replied</button>
            )}
            <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void setStage("won")} style={{ color: "var(--color-mint)" }}>Won</button>
            <button type="button" className="ch-btn text-[13px]" disabled={busy !== null} onClick={() => void setStage("lost")}>Lost</button>
            <span className="flex-1" />
            <button
              type="button"
              className="text-[13px] font-semibold"
              style={{ color: "var(--color-coral)" }}
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm(`Remove ${c.company.name} from the pipeline? It goes back to the Radar list.`)) {
                  void call("remove", `/api/pipeline/${c.id}`, { method: "DELETE" }).then((ok) => ok && onClose());
                }
              }}
            >
              Remove from pipeline
            </button>
          </section>
        </div>
      </aside>
    </div>
  );
}

export function PipelineBoard({ cards, smtp }: { cards: PipelineCard[]; smtp: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = cards.find((c) => c.id === openId) ?? null;
  const byColumn = useMemo(() => {
    const m = new Map<Column, PipelineCard[]>();
    for (const col of COLUMNS) m.set(col.key, []);
    for (const c of cards) m.get(c.column)?.push(c);
    return m;
  }, [cards]);
  const won = cards.filter((c) => c.stage === "won").length;
  const sent = cards.reduce((n, c) => n + c.emails.length, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["To contact", byColumn.get("to_contact")?.length ?? 0, "first email not sent"],
          ["Follow-ups due", byColumn.get("due")?.length ?? 0, "ready to send now"],
          ["Emails sent", sent, "across all companies"],
          ["Replied", byColumn.get("replied")?.length ?? 0, "conversations started"],
          ["Won", won, "new clients"],
        ].map(([label, value, hint]) => (
          <div key={label as string} className="ch-card py-3">
            <b className="block text-[22px] leading-none font-semibold" style={{ fontFamily: "var(--font-mono)" }}>{value}</b>
            <span className="mt-1 block text-[12px] font-semibold">{label}</span>
            <span className="block text-[11px]" style={{ color: "var(--color-muted)" }}>{hint}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = byColumn.get(col.key) ?? [];
          return (
            <section key={col.key} className="min-w-[220px] rounded-[14px] p-2" style={{ background: "var(--color-raise)" }}>
              <h2 className="flex items-center gap-2 px-1 pt-1 text-[12px] font-semibold tracking-wide uppercase" style={{ color: col.key === "due" ? "var(--color-brand)" : "var(--color-muted)" }}>
                {col.title}
                <span style={{ fontFamily: "var(--font-mono)" }}>{items.length}</span>
              </h2>
              <p className="mb-2 px-1 text-[11px]" style={{ color: "var(--color-muted)" }}>{col.hint}</p>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="rounded-[10px] border border-dashed px-3 py-6 text-center text-[12px]" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
                    Empty
                  </p>
                ) : (
                  items.map((c) => <Card key={c.id} c={c} onOpen={() => setOpenId(c.id)} />)
                )}
              </div>
            </section>
          );
        })}
      </div>

      {open ? <Composer key={open.id} c={open} smtp={smtp} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
