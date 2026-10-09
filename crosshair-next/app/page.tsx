import Link from "next/link";

const STEPS = [
  ["Tell it what you sell", "Web design, SEO, app development, AI automation, or anything else"],
  ["It scans by itself", "Reddit, Hacker News and community forums, for owners sharing their own websites"],
  ["Audits every site", "HTTPS, mobile, speed, broken links, SEO gaps, no online booking, with evidence"],
  ["Finds how to reach them", "Public emails, phones, contact forms and socials from their own site"],
  ["Ranks the opportunities", "Scored by how much of what's wrong your services fix"],
  ["You pick who to contact", "Filter, select, export. Email, call and LinkedIn automation coming"],
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <div
        className="px-5"
        style={{
          background:
            "radial-gradient(900px 520px at 78% 40%, color-mix(in srgb, var(--color-brand) 11%, transparent), transparent 70%), var(--color-bg)",
        }}
      >
        <div className="mx-auto max-w-[1160px]">
          <nav className="flex items-center justify-between py-5">
            <span
              className="text-[28px] font-extrabold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Crosshair
            </span>
            <Link href="/finder" className="ch-btn ch-btn-primary">
              Open dashboard
            </Link>
          </nav>

          <div className="grid items-center gap-8 py-10 lg:grid-cols-2 lg:py-16">
            <div>
              <span
                className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] uppercase tracking-[0.08em]"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-muted)",
                  borderColor: "var(--color-line)",
                  background: "var(--color-surface)",
                }}
              >
                <i
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--color-brand)" }}
                />
                Finds clients whose websites need you
              </span>
              <h1 className="mb-4 text-[clamp(2.3rem,5.4vw,3.8rem)] leading-[1.04] font-bold tracking-tight">
                Find the flaws. <em className="not-italic" style={{ color: "var(--color-brand)" }}>Win the client.</em>
              </h1>
              <p className="mb-7 max-w-[44ch] text-lg" style={{ color: "var(--color-muted)" }}>
                Crosshair finds businesses on its own, audits their websites for the problems you
                fix, and tells you exactly how to reach them, with proof for every pitch.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/finder" className="ch-btn ch-btn-primary px-6 py-3 text-[15px]">
                  Open dashboard
                </Link>
                <Link href="#how" className="ch-btn px-6 py-3 text-[15px]">
                  How it works
                </Link>
              </div>
            </div>

            <div className="grid gap-3">
              {[
                ["Not mobile-friendly · slow · no HTTPS", "WEB", "Pitch a redesign, with their load time as proof", "ch-pill-hot"],
                ["No meta description · no sitemap", "SEO", "Pitch SEO, with the exact gaps listed", "ch-pill-warm"],
                ["No online booking · no chat", "AI", "Pitch automation for their front desk", "ch-pill-hold"],
              ].map(([rule, tier, note, pill]) => (
                <div key={tier} className="ch-card flex items-center gap-4">
                  <span className={`ch-pill ${pill}`}>{tier}</span>
                  <div className="min-w-0">
                    <b className="block text-sm">{rule}</b>
                    <small style={{ color: "var(--color-muted)" }}>{note}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5" id="how">
        <div className="mx-auto max-w-[1160px] py-14">
          <h2 className="mb-2 text-2xl font-bold tracking-tight">Six steps. Mostly automatic.</h2>
          <p className="mb-7" style={{ color: "var(--color-muted)" }}>
            From a public post to a company you can pitch with evidence.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <div key={title} className="ch-card">
                <span className="ch-label">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-1 font-semibold">{title}</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
          <footer
            className="mt-12 flex flex-wrap justify-between gap-2 border-t pt-5 text-[13px]"
            style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}
          >
            <span>Crosshair</span>
            <span>Public data only &middot; nothing is sent without you</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
