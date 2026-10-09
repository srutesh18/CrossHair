"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_SEQUENCE,
  STEP_LABEL,
  TEMPLATE_VARS,
  render,
  varsFor,
  type Sequence,
  type TemplateCompany,
} from "@/lib/templates";

interface Props {
  initial: { sequence: Sequence; custom: boolean; senderName: string; signature: string; productName: string };
  services: string[];
  sample: TemplateCompany | null;
}

const FALLBACK_SAMPLE: TemplateCompany = {
  name: "Acme Dental",
  domain: "acmedental.com",
  flaws: [
    { key: "slow", area: "design", severity: "high", title: "Slow homepage", evidence: "The homepage took 7.4s to load." },
    { key: "no_meta_description", area: "seo", severity: "medium", title: "No meta description", evidence: "Google has no description to show under the result, so it guesses one." },
  ],
  services_matched: ["web design", "seo"],
  trigger_headline: "Acme Dental opens a second clinic downtown",
  trigger_kind: "Expansion",
};

export function TemplatesEditor({ initial, services, sample }: Props) {
  const router = useRouter();
  const [seq, setSeq] = useState<Sequence>(initial.sequence);
  const [senderName, setSenderName] = useState(initial.senderName);
  const [signature, setSignature] = useState(initial.signature);
  const [productName, setProductName] = useState(initial.productName);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const company = sample ?? FALLBACK_SAMPLE;
  const vars = useMemo(
    () => varsFor(company, { services, sender: senderName, signature }),
    [company, services, senderName, signature],
  );
  const current = seq[step] ?? DEFAULT_SEQUENCE[0];

  function update(field: "subject" | "body", value: string) {
    const next = [...seq] as Sequence;
    next[step] = { ...current, [field]: value };
    setSeq(next);
    setSaved(false);
  }

  function insertVar(name: string) {
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    if (!el) return update("body", current.body + token);
    const start = el.selectionStart ?? current.body.length;
    const end = el.selectionEnd ?? start;
    update("body", current.body.slice(0, start) + token + current.body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save(sequence: Sequence | null) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence, senderName, signature, productName }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`);
      if (!sequence) setSeq(DEFAULT_SEQUENCE);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="ch-card grid gap-3 sm:grid-cols-2">
          <h2 className="ch-label sm:col-span-2">Sender</h2>
          <label className="text-[13px] font-semibold">
            Your name
            <input className="ch-input mt-1 font-normal" value={senderName} onChange={(e) => { setSenderName(e.target.value); setSaved(false); }} />
          </label>
          <label className="text-[13px] font-semibold">
            Your company
            <input className="ch-input mt-1 font-normal" value={productName} onChange={(e) => { setProductName(e.target.value); setSaved(false); }} placeholder="e.g. Brightline Studio" />
          </label>
          <label className="text-[13px] font-semibold sm:col-span-2">
            Signature
            <textarea className="ch-input mt-1 font-normal" rows={2} value={signature} onChange={(e) => { setSignature(e.target.value); setSaved(false); }} placeholder={"Brightline Studio · brightline.design\n+1 555 0100"} />
          </label>
        </section>

        <section className="ch-card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="ch-label mr-auto">Email sequence</h2>
            {initial.custom ? <span className="ch-tag">customised</span> : <span className="ch-tag">default</span>}
          </div>
          <div className="flex gap-1" role="tablist">
            {STEP_LABEL.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={step === i}
                onClick={() => setStep(i)}
                className="flex-1 rounded-[9px] border px-2 py-2 text-[12px] font-semibold"
                style={step === i ? { background: "var(--color-fg)", color: "var(--color-bg)", borderColor: "var(--color-fg)" } : { borderColor: "var(--color-line)" }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block text-[13px] font-semibold">
            Subject
            <input className="ch-input mt-1 font-normal" value={current.subject} onChange={(e) => update("subject", e.target.value)} />
          </label>
          <label className="block text-[13px] font-semibold">
            Email
            <textarea ref={bodyRef} className="ch-input mt-1 font-mono text-[12.5px] leading-relaxed font-normal" rows={16} value={current.body} onChange={(e) => update("body", e.target.value)} />
          </label>
          <div>
            <p className="mb-1.5 text-[12px]" style={{ color: "var(--color-muted)" }}>
              Click to insert. <code>{"{{#trigger}}…{{/trigger}}"}</code> shows only when they are in the news; <code>{"{{^trigger}}…{{/trigger}}"}</code> only when not.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARS.map(([name, desc]) => (
                <button key={name} type="button" title={desc} onClick={() => insertVar(name)} className="rounded-full border px-2.5 py-0.5 text-[12px]" style={{ borderColor: "var(--color-line)", fontFamily: "var(--font-mono)" }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="rounded-[9px] px-3 py-2 text-sm" role="alert" style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}>{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ch-btn ch-btn-primary" disabled={busy} onClick={() => void save(seq)}>
              {busy ? "Saving…" : "Save templates"}
            </button>
            <button type="button" className="ch-btn" disabled={busy} onClick={() => { if (window.confirm("Reset all three emails to the defaults?")) void save(null); }}>
              Reset to defaults
            </button>
            {saved ? <span className="text-[13px]" style={{ color: "var(--color-mint)" }}>Saved. New emails use these.</span> : null}
          </div>
        </section>
      </div>

      <section className="space-y-2 xl:sticky xl:top-0 xl:self-start">
        <h2 className="ch-label">Live preview · {STEP_LABEL[step]}</h2>
        <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>
          Written for {sample ? <b>{company.name}</b> : <>a sample company</>}
          {sample ? ", one of your audited companies" : " (audit some companies on the Radar to preview a real one)"}.
        </p>
        <article className="ch-card space-y-3">
          <div className="space-y-1 border-b pb-3 text-[13px]" style={{ borderColor: "var(--color-line)" }}>
            <p><span style={{ color: "var(--color-muted)" }}>From:</span> {senderName || "You"}{productName ? ` · ${productName}` : ""}</p>
            <p><span style={{ color: "var(--color-muted)" }}>To:</span> {company.domain}</p>
            <p className="font-semibold">{render(current.subject, vars)}</p>
          </div>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{render(current.body, vars)}</p>
        </article>
      </section>
    </div>
  );
}
