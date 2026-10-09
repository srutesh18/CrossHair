import Link from "next/link";

const STEPS = [
  ["Setup", "Your product, 2-3 competitors, docs, target customer"],
  ["Pain scan", "Finds public complaints, extracts person, company, pain type"],
  ["Trigger check", "Looks for real events at that company"],
  ["Qualify", "Scores the lead: Hot, Warm or Hold"],
  ["Write", "Matches the complaint to a real feature (RAG), drafts the email"],
  ["Follow up", "Day 3 proof, Day 7 close. A second pass checks every claim"],
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
                An AI sales agent that knows when not to send
              </span>
              <h1 className="mb-4 text-[clamp(2.3rem,5.4vw,3.8rem)] leading-[1.04] font-bold tracking-tight">
                Stop spraying. <em className="not-italic" style={{ color: "var(--color-brand)" }}>Start sniping.</em>
              </h1>
              <p className="mb-7 max-w-[44ch] text-lg" style={{ color: "var(--color-muted)" }}>
                Crosshair reads public complaints about your competitors, watches what changes at
                each company, and only then writes the email.
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
                ["All three Strong", "HOT", "Email drafted, grounded in your docs", "ch-pill-hot"],
                ["Exactly one Fair", "WARM", "A softer email, no hard ask", "ch-pill-warm"],
                ["Any None, or two Fair", "HOLD", "No email. Watching for a trigger.", "ch-pill-hold"],
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
          <h2 className="mb-2 text-2xl font-bold tracking-tight">Six steps. One decision.</h2>
          <p className="mb-7" style={{ color: "var(--color-muted)" }}>
            From a public complaint to a send or a hold, automatically.
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
            <span>Crosshair &middot; also known as Churn Sniper</span>
            <span>Public data only &middot; draft mode, nothing is really sent</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
