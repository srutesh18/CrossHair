"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Option {
  value: string;
  label: string;
}

/** Filters apply as soon as they change; the URL holds them, so exports match. */
export function FilterBar({
  categories,
  sources,
  services,
  competitors,
}: {
  categories: Option[];
  sources: Option[];
  services: string[];
  competitors: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all" && value !== "0") next.set(key, value);
    else next.delete(key);
    router.replace(`/finder${next.toString() ? `?${next.toString()}` : ""}`);
  }

  // Debounced free-text search.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => set("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const value = (key: string, fallback: string) => params.get(key) ?? fallback;
  const select = (key: string, fallback: string, label: string, options: Option[]) => (
    <select
      value={value(key, fallback)}
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

  const active = params.toString() !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search posts or people"
        className="ch-input w-auto min-w-[180px] flex-[2] text-[13px]"
        aria-label="Search"
      />
      {select("category", "all", "Category", [{ value: "all", label: "All categories" }, ...categories])}
      {services.length
        ? select("service", "", "Service", [{ value: "", label: "Any service" }, ...services.map((s) => ({ value: s, label: s }))])
        : null}
      {competitors.length
        ? select("competitor", "", "Competitor", [{ value: "", label: "Any competitor" }, ...competitors.map((c) => ({ value: c, label: c }))])
        : null}
      {select("source", "all", "Source", [{ value: "all", label: "All sources" }, ...sources])}
      {select("minIntent", "0", "Intent", [
        { value: "0", label: "Any intent" },
        { value: "35", label: "Intent 35+" },
        { value: "50", label: "Intent 50+" },
        { value: "70", label: "Intent 70+" },
      ])}
      {select("days", "0", "Posted", [
        { value: "0", label: "Any time" },
        { value: "7", label: "Last 7 days" },
        { value: "30", label: "Last 30 days" },
        { value: "90", label: "Last 90 days" },
        { value: "365", label: "Last year" },
      ])}
      {select("status", "new", "Status", [
        { value: "new", label: "To review" },
        { value: "promoted", label: "Scored leads" },
        { value: "dismissed", label: "Dismissed" },
        { value: "all", label: "All" },
      ])}
      {active ? (
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
