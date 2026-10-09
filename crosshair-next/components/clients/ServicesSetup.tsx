"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

interface Props {
  initial: { services: string[]; icp: string };
  /** First visit: a full onboarding card. Otherwise a one-line summary. */
  onboarding: boolean;
}

function Chips({ items, onRemove }: { items: string[]; onRemove: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-[13px]"
          style={{ background: "var(--color-raise)", borderColor: "var(--color-line)" }}
        >
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            onClick={() => onRemove(i)}
            className="grid h-5 w-5 place-items-center rounded-full"
            style={{ color: "var(--color-muted)" }}
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  );
}

function ChipInput({
  label,
  hint,
  placeholder,
  items,
  setItems,
}: {
  label: string;
  hint: string;
  placeholder: string;
  items: string[];
  setItems: (v: string[]) => void;
}) {
  const [value, setValue] = useState("");
  function add() {
    // Commas let people paste a list in one go.
    const parts = value.split(",").map((v) => v.trim()).filter(Boolean);
    const next = [...items];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    setItems(next.slice(0, 8));
    setValue("");
  }
  return (
    <div>
      <label className="block text-[13px] font-semibold">{label}</label>
      <p className="mb-1.5 text-[12px]" style={{ color: "var(--color-muted)" }}>
        {hint}
      </p>
      {items.length ? <div className="mb-2"><Chips items={items} onRemove={(i) => setItems(items.filter((_, x) => x !== i))} /></div> : null}
      <div className="flex gap-2">
        <input
          className="ch-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          aria-label={label}
        />
        <button type="button" className="ch-btn" onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}

/** "What do you sell?" The only thing a user must fill in before crawling. */
export function ServicesSetup({ initial, onboarding }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(onboarding);
  const [services, setServices] = useState(initial.services);
  const [icp, setIcp] = useState(initial.icp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (services.length === 0) {
      setError("Add at least one service you sell.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      const { data: member, error: mErr } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", auth.user.id)
        .limit(1)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!member) throw new Error("No workspace found for this account.");
      const { error: err } = await supabase
        .from("orgs")
        .update({ services, icp })
        .eq("id", member.org_id);
      if (err) throw err;
      // Scores depend on which flaws your services fix.
      await fetch("/api/companies/rescore", { method: "POST" }).catch(() => undefined);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="ch-card flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="ch-label">You sell</span>
        {services.length ? (
          services.map((s) => (
            <span key={s} className="ch-tag">
              {s}
            </span>
          ))
        ) : (
          <span className="text-[13px]" style={{ color: "var(--color-muted)" }}>
            nothing yet
          </span>
        )}
        <span className="flex-1" />
        <button type="button" className="text-[13px] font-semibold" style={{ color: "var(--color-brand)" }} onClick={() => setOpen(true)}>
          Edit
        </button>
      </section>
    );
  }

  return (
    <section className="ch-card space-y-4 p-5">
      {onboarding ? (
        <div>
          <h2 className="text-lg font-semibold">What do you sell?</h2>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            List your services. Crosshair audits company websites for the problems those services
            fix (slow, not mobile-friendly, poor SEO, no online booking…) and finds their public
            contact details, so every email you send is about their real problem.
          </p>
        </div>
      ) : (
        <h2 className="ch-label">Your services</h2>
      )}

      <ChipInput
        label="Services you offer"
        hint="Comma-separated. Web design, SEO, app development and AI automation each map to specific website checks."
        placeholder="e.g. web design, SEO, app development, AI automation"
        items={services}
        setItems={setServices}
      />
      <div>
        <label htmlFor="icp" className="block text-[13px] font-semibold">
          Who is a good customer? (optional)
        </label>
        <textarea
          id="icp"
          rows={2}
          className="ch-input mt-1"
          value={icp}
          onChange={(e) => setIcp(e.target.value)}
          placeholder="e.g. local clinics and restaurants with outdated websites"
        />
      </div>

      {error ? (
        <p className="rounded-[9px] px-3 py-2 text-sm" role="alert" style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}>
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" className="ch-btn ch-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : onboarding ? "Save and continue" : "Save"}
        </button>
        {!onboarding ? (
          <button type="button" className="ch-btn" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
        ) : null}
      </div>
    </section>
  );
}
