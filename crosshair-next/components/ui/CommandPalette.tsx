"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowIcon, BoltIcon, MailIcon, PipelineIcon, RadarIcon, SearchIcon } from "./Icons";

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: (go: (href: string) => void) => void;
}

const COMMANDS: Command[] = [
  { id: "scan", label: "Scan now", hint: "Find new companies from all sources", icon: <BoltIcon className="h-4 w-4" />, run: (go) => go("/finder?scan=1") },
  { id: "radar", label: "Go to Radar", hint: "All companies and the 3D radar", icon: <RadarIcon className="h-4 w-4" />, run: (go) => go("/finder") },
  { id: "strong", label: "Show strong opportunities", hint: "Score 60 or more", icon: <RadarIcon className="h-4 w-4" />, run: (go) => go("/finder?minScore=60") },
  { id: "news", label: "Show companies in the news", hint: "Funding, new leaders, hiring", icon: <RadarIcon className="h-4 w-4" />, run: (go) => go("/finder?trigger=any") },
  { id: "email", label: "Companies with an email", hint: "Reachable right away", icon: <MailIcon className="h-4 w-4" />, run: (go) => go("/finder?contact=email") },
  { id: "pipeline", label: "Go to Pipeline", hint: "Emails and follow-ups", icon: <PipelineIcon className="h-4 w-4" />, run: (go) => go("/pipeline") },
  { id: "templates", label: "Edit email templates", hint: "Day 0 / 3 / 7 sequence", icon: <MailIcon className="h-4 w-4" />, run: (go) => go("/templates") },
  { id: "home", label: "Open the landing page", hint: "What Crosshair does", icon: <ArrowIcon className="h-4 w-4" />, run: (go) => go("/") },
];

/** ⌘K / Ctrl+K: jump anywhere or run an action from the keyboard. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ch:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ch:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setIndex(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? COMMANDS.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(t)) : COMMANDS;
  }, [q]);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center px-4 pt-[14vh]" style={{ background: "rgba(20,24,36,.5)", backdropFilter: "blur(3px)" }} onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="ch-rise w-full max-w-[560px] overflow-hidden rounded-[16px] border shadow-2xl" style={{ background: "var(--color-surface)", borderColor: "var(--color-line)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4" style={{ borderColor: "var(--color-line)" }}>
          <SearchIcon className="h-4 w-4 opacity-60" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                results[index]?.run(go);
              }
            }}
            placeholder="Type a command or page…"
            className="w-full bg-transparent py-3.5 text-[15px] outline-none"
            aria-label="Command"
          />
          <kbd className="rounded border px-1.5 text-[11px]" style={{ borderColor: "var(--color-line)", fontFamily: "var(--font-mono)" }}>esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? <li className="px-3 py-6 text-center text-[13px]" style={{ color: "var(--color-muted)" }}>No matches</li> : null}
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => c.run(go)}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left"
                style={i === index ? { background: "var(--color-brand-soft)" } : undefined}
              >
                <span className="grid h-8 w-8 place-items-center rounded-[8px]" style={{ background: i === index ? "var(--color-surface)" : "var(--color-raise)", color: "var(--color-brand)" }}>{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[14px]">{c.label}</b>
                  <span className="block text-[12px]" style={{ color: "var(--color-muted)" }}>{c.hint}</span>
                </span>
                {i === index ? <ArrowIcon className="h-4 w-4 opacity-60" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
