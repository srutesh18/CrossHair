"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Option {
  value: string;
  label: string;
}

/** Filters apply as soon as they change; the URL holds them so exports match. */
export function CompanyFilters({ services, flaws }: { services: string[]; flaws: Option[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "any" && value !== "0" && value !== "ready") next.set(key, value);
    else next.delete(key);
    router.replace(`/finder${next.toString() ? `?${next.toString()}` : ""}`);
  }

  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => set("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const select = (key: string, fallback: string, label: string, options: Option[]) => (
    <select
      value={params.get(key) ?? fallback}
      onChange={(e) => set(key, e.target.value)}
      className="ch-input w-auto min-w-[130px] flex-1 text-[13px]"
      aria-label={label}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search company, website, city"
        className="ch-input w-auto min-w-[180px] flex-[2] text-[13px]"
        aria-label="Search"
      />
      {services.length
        ? select("service", "", "Fixable with", [{ value: "", label: "Any service" }, ...services.map((s) => ({ value: s, label: `Needs ${s}` }))])
        : null}
      {select("flaw", "", "Flaw", [{ value: "", label: "Any flaw" }, ...flaws])}
      {select("trigger", "", "Trigger", [
        { value: "", label: "Any news" },
        { value: "any", label: "Has a trigger" },
        { value: "Funding", label: "Just raised money" },
        { value: "New executive", label: "New leader" },
        { value: "Hiring", label: "Hiring" },
        { value: "Expansion", label: "Expanding" },
      ])}
      {select("contact", "any", "Contact", [
        { value: "any", label: "Any contact" },
        { value: "email", label: "Has email" },
        { value: "phone", label: "Has phone" },
        { value: "none", label: "No contact found" },
      ])}
      {select("minScore", "0", "Score", [
        { value: "0", label: "Any score" },
        { value: "40", label: "Score 40+" },
        { value: "60", label: "Score 60+" },
        { value: "80", label: "Score 80+" },
      ])}
      {select("status", "ready", "Status", [
        { value: "ready", label: "To review" },
        { value: "contacted", label: "Contacted" },
        { value: "dismissed", label: "Dismissed" },
        { value: "failed", label: "Couldn't audit" },
        { value: "all", label: "All" },
      ])}
      {params.toString() ? (
        <button
          type="button"
          className="text-[13px] font-semibold"
          style={{ color: "var(--color-brand)" }}
          onClick={() => {
            setQ("");
            router.replace("/finder");
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
