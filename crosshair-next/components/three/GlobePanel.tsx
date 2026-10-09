"use client";

import dynamic from "next/dynamic";

const Globe3D = dynamic(() => import("./Globe3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[13px] text-white/40">Loading globe…</div>,
});

const CHIPS: Array<{ tag: string; text: string; color: string; pos: string }> = [
  { tag: "WEB", text: "Not mobile-friendly · 7.4s load", color: "#f2a07d", pos: "left-4 top-6" },
  { tag: "NOW", text: "Series A raised this week", color: "#3ddc97", pos: "right-4 top-[38%]" },
  { tag: "SEO", text: "No meta description", color: "#f2b544", pos: "left-6 bottom-8" },
];

/** Dark panel with the interactive globe and a few floating "found" chips. */
export function GlobePanel({ className = "", chips = true }: { className?: string; chips?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[22px] ${className}`}
      style={{ background: "radial-gradient(120% 120% at 70% 20%, #1b3a48 0%, #121c28 50%, #0b111a 100%)", boxShadow: "0 30px 60px -30px rgba(18,28,40,.7)" }}
    >
      <Globe3D />
      {chips
        ? CHIPS.map((c) => (
            <div
              key={c.tag}
              className={`pointer-events-none absolute ${c.pos} flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] text-white shadow-lg`}
              style={{ background: "rgba(18,28,40,.72)", borderColor: "rgba(255,255,255,.14)", backdropFilter: "blur(6px)" }}
            >
              <b className="rounded-full px-1.5 text-[10px]" style={{ background: c.color, color: "#121c28" }}>{c.tag}</b>
              {c.text}
            </div>
          ))
        : null}
      <p className="pointer-events-none absolute right-4 bottom-3 text-[11px] text-white/40">Drag to spin</p>
    </div>
  );
}
