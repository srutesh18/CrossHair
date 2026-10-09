"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BoltIcon, CrosshairMark, LogoutIcon, MailIcon, PipelineIcon, RadarIcon, SearchIcon } from "./Icons";

export interface SidebarStats {
  toReview: number;
  strong: number;
  due: number;
  inPipeline: number;
  sentThisWeek: number;
  weeklyGoal: number;
  lastScan: string | null;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function NavItem({ href, label, icon, badge, hot }: { href: string; label: string; icon: React.ReactNode; badge?: number; hot?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="group relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[14px] font-medium whitespace-nowrap transition hover:bg-white/[.07] hover:text-white"
      style={active ? { background: "linear-gradient(90deg, rgba(242,160,125,.18), rgba(255,255,255,.04))", color: "#fff" } : undefined}
    >
      {active ? <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full" style={{ background: "#f2a07d" }} /> : null}
      <span className="grid h-5 w-5 place-items-center opacity-90">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge ? (
        <span
          className="rounded-full px-1.5 py-px text-[11px] font-semibold"
          style={hot ? { background: "#f2a07d", color: "#1f2433" } : { background: "rgba(255,255,255,.12)", color: "#fff" }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** A small live radar: sweeping beam, rings, a few pinging contacts. */
function MiniRadar({ blips }: { blips: number }) {
  const dots = [
    [28, 34], [66, 24], [74, 62], [38, 70], [52, 46], [20, 54],
  ].slice(0, Math.max(2, Math.min(6, Math.ceil(blips / 5))));
  return (
    <div className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-full" style={{ background: "radial-gradient(circle, #183340 0%, #0e1a24 70%)", boxShadow: "inset 0 0 0 1px rgba(61,220,151,.25)" }}>
      {[0.33, 0.66].map((r) => (
        <span key={r} className="absolute rounded-full border" style={{ inset: `${(1 - r) * 50}%`, borderColor: "rgba(61,220,151,.2)" }} />
      ))}
      <span className="absolute inset-0 ch-sweep" style={{ background: "conic-gradient(from 0deg, rgba(242,160,125,.55), rgba(242,160,125,0) 22%)" }} />
      {dots.map(([x, y], i) => (
        <span key={i} className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
          <span className="absolute -m-[3px] h-[6px] w-[6px] rounded-full ch-ping" style={{ background: "#3ddc97", animationDelay: `${i * 0.35}s` }} />
          <span className="absolute -m-[3px] h-[6px] w-[6px] rounded-full" style={{ background: "#3ddc97" }} />
        </span>
      ))}
      <span className="absolute top-1/2 left-1/2 -m-[3px] h-[6px] w-[6px] rounded-full" style={{ background: "#f2a07d" }} />
    </div>
  );
}

function GoalRing({ value, goal }: { value: number; goal: number }) {
  const pct = Math.min(1, value / Math.max(1, goal));
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" role="img" aria-label={`${value} of ${goal} emails this week`}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="#3ddc97" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 20 20)" />
      <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{value}</text>
    </svg>
  );
}

export function Sidebar({ email, stats }: { email: string | null; stats: SidebarStats | null }) {
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  const initials = (email ?? "?").replace(/@.*/, "").split(/[._-]/).map((p) => p[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "?";

  return (
    <aside
      className="relative flex flex-row items-center gap-1 overflow-x-auto p-3 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:gap-0 md:overflow-y-auto md:p-4"
      style={{ background: "linear-gradient(180deg, #1f2433 0%, #191d2a 60%, #141824 100%)", color: "var(--color-side-fg)" }}
    >
      <Link href="/" className="hidden items-center gap-2.5 px-2 pb-5 md:flex">
        <CrosshairMark className="h-8 w-8" />
        <span className="text-[22px] font-extrabold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }}>
          Crosshair
        </span>
      </Link>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("ch:palette"))}
        className="mb-3 hidden items-center gap-2 rounded-[11px] border px-3 py-2 text-[13px] transition hover:border-white/25 hover:text-white md:flex"
        style={{ borderColor: "rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)" }}
      >
        <SearchIcon className="h-4 w-4" />
        <span className="flex-1 text-left">Search or jump…</span>
        <kbd className="rounded px-1.5 text-[11px]" style={{ background: "rgba(255,255,255,.1)", fontFamily: "var(--font-mono)" }}>{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      <nav className="flex flex-row gap-1 md:flex-col">
        <NavItem href="/finder" label="Radar" icon={<RadarIcon className="h-5 w-5" />} badge={stats?.toReview} />
        <NavItem href="/pipeline" label="Pipeline" icon={<PipelineIcon className="h-5 w-5" />} badge={stats?.due || stats?.inPipeline} hot={Boolean(stats?.due)} />
        <NavItem href="/templates" label="Templates" icon={<MailIcon className="h-5 w-5" />} />
      </nav>

      {stats ? (
        <div className="mt-5 hidden space-y-3 md:block">
          <div className="rounded-[14px] p-3" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
            <div className="flex items-center gap-3">
              <MiniRadar blips={stats.toReview} />
              <div className="min-w-0 text-[12px]">
                <p className="flex items-center gap-1.5 font-semibold text-white">
                  <span className="relative inline-flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full ch-ping" style={{ background: "#3ddc97" }} />
                    <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#3ddc97" }} />
                  </span>
                  Live
                </p>
                <p className="mt-0.5" suppressHydrationWarning>Last scan {ago(stats.lastScan)}</p>
                <Link href="/finder?scan=1" className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: "#f2a07d", color: "#1f2433" }}>
                  <BoltIcon className="h-3.5 w-3.5" /> Scan now
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-[14px] p-3" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
            <p className="mb-2 text-[11px] tracking-[0.12em] uppercase opacity-70" style={{ fontFamily: "var(--font-mono)" }}>Today</p>
            <Link href="/pipeline" className="flex items-center justify-between rounded-[9px] px-2 py-1.5 text-[13px] hover:bg-white/[.06]">
              <span>Follow-ups due</span>
              <b className={stats.due ? "text-[#f2a07d]" : "text-white"}>{stats.due}</b>
            </Link>
            <Link href="/finder?minScore=60" className="flex items-center justify-between rounded-[9px] px-2 py-1.5 text-[13px] hover:bg-white/[.06]">
              <span>Strong opportunities</span>
              <b className="text-[#3ddc97]">{stats.strong}</b>
            </Link>
            <Link href="/pipeline" className="flex items-center justify-between rounded-[9px] px-2 py-1.5 text-[13px] hover:bg-white/[.06]">
              <span>In the pipeline</span>
              <b className="text-white">{stats.inPipeline}</b>
            </Link>
          </div>

          <div className="flex items-center gap-3 rounded-[14px] p-3" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
            <GoalRing value={stats.sentThisWeek} goal={stats.weeklyGoal} />
            <div className="text-[12px]">
              <p className="font-semibold text-white">Weekly goal</p>
              <p>{stats.sentThisWeek} of {stats.weeklyGoal} emails sent</p>
            </div>
          </div>
        </div>
      ) : null}

      {email ? (
        <form action="/auth/signout" method="post" className="mt-auto hidden items-center gap-2.5 border-t pt-4 md:flex" style={{ borderColor: "rgba(255,255,255,.08)" }}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: "linear-gradient(135deg, #d2441f, #f2a07d)" }}>
            {initials}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px]" title={email}>{email}</span>
          <button type="submit" className="rounded-[8px] p-1.5 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
            <LogoutIcon className="h-4 w-4" />
          </button>
        </form>
      ) : null}
    </aside>
  );
}
