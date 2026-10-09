import Link from "next/link";

const STEPS = [
  ["Tell it what you sell", "Web design, SEO, app development, AI automation, or anything else"],
  ["It scans by itself", "Reddit, Hacker News, community forums and company news, every time you press Scan"],
  ["Audits every site", "HTTPS, mobile, speed, broken links, SEO gaps, no online booking, each with evidence"],
  ["Finds how to reach them", "Public emails, phones, contact forms and socials from their own website"],
  ["Ranks the opportunities", "Pain they have + a reason to act now + a way to reach them"],
  ["Emails and follows up", "A written first email, Day 3 and Day 7 follow-ups, and a board to track replies"],
];

const SOURCES = [
  "Reddit", "Hacker News", "Bubble forum", "n8n community", "Make community",
  "TechCrunch", "tech.eu", "BetaKit", "Inc42", "PR Newswire", "Google News",
];

const CHECKS: Array<{ service: string; tag: string; pill: string; items: string[] }> = [
  { service: "Web design", tag: "WEB", pill: "ch-pill-hot", items: ["Not mobile-friendly", "Slow homepage (timed)", "No HTTPS", "© 2019 in the footer", "Broken links", "Outdated WordPress or jQuery"] },
  { service: "SEO", tag: "SEO", pill: "ch-pill-warm", items: ["No meta description", "No main heading", "Hidden from Google (noindex)", "No sitemap", "No schema.org business data", "No analytics"] },
  { service: "AI automation", tag: "AI", pill: "ch-pill-hold", items: ["No online booking for an appointment business", "No chat, chatbot or WhatsApp", "Only a phone number to reach them", "Contact form with no instant reply"] },
  { service: "App development", tag: "APP", pill: "ch-pill-sent", items: ["No customer login or portal", "No online ordering", "No mobile app for a shop or restaurant", "Member business with no account area"] },
];

const IDEAS = [
  ["Web design agencies", "Find businesses whose sites aren't mobile-friendly or load in 7 seconds, and lead with the number."],
  ["SEO consultants", "Pitch companies Google can't describe: missing meta descriptions, no headings, no sitemap."],
  ["AI automation builders", "Clinics, salons and restaurants with no online booking or chat are your front-desk pitch."],
  ["Freelance developers", "Startups that just raised a round need to ship faster; the trigger feed shows who, today."],
  ["Fractional CMOs", "A company that just hired a new CEO is re-thinking marketing. Be the first email."],
  ["Productised services", "Run a scan each morning, add the top five to your pipeline, send. Follow-ups queue themselves."],
];

const FAQ = [
  ["Does it send emails without me?", "No. Crosshair writes the email and schedules follow-ups; you review and press send, from Crosshair (with your own mailbox connected) or from Gmail and Outlook in one click."],
  ["Where does the data come from?", "Only public places: posts where owners share their own site, startup news, and the company's own website. Nothing behind a login, and sites that ask crawlers to stay away are skipped."],
  ["Will the emails be generic?", "Each one names the company's real problems with evidence (\"your homepage took 6.8s to load\") and, when there is news, why now (\"congrats on the Series A\")."],
  ["How do people opt out?", "Every email ends with an easy opt-out, and replying, winning or losing a deal stops the follow-ups for that company."],
];

function SectionTitle({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mb-7">
      <span className="ch-label">{kicker}</span>
      <h2 className="mt-1 text-[clamp(1.5rem,3vw,2.1rem)] leading-tight font-bold tracking-tight">{title}</h2>
      {sub ? <p className="mt-2 max-w-[60ch]" style={{ color: "var(--color-muted)" }}>{sub}</p> : null}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* ---------------- hero ---------------- */}
      <div
        className="px-5"
        style={{
          background:
            "radial-gradient(900px 520px at 78% 40%, color-mix(in srgb, var(--color-brand) 11%, transparent), transparent 70%), var(--color-bg)",
        }}
      >
        <div className="mx-auto max-w-[1160px]">
          <nav className="flex items-center justify-between gap-4 py-5">
            <span className="text-[28px] font-extrabold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Crosshair
            </span>
            <div className="hidden items-center gap-6 text-[14px] md:flex" style={{ color: "var(--color-muted)" }}>
              <a href="#how" className="hover:underline">How it works</a>
              <a href="#checks" className="hover:underline">What it checks</a>
              <a href="#ideas" className="hover:underline">Who it&apos;s for</a>
              <a href="#faq" className="hover:underline">FAQ</a>
            </div>
            <Link href="/finder" className="ch-btn ch-btn-primary">Open dashboard</Link>
          </nav>

          <div className="grid items-center gap-8 py-10 lg:grid-cols-2 lg:py-16">
            <div>
              <span
                className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] tracking-[0.08em] uppercase"
                style={{ fontFamily: "var(--font-mono)", color: "var(--color-muted)", borderColor: "var(--color-line)", background: "var(--color-surface)" }}
              >
                <i className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-brand)" }} />
                Finds clients whose websites need you
              </span>
              <h1 className="mb-4 text-[clamp(2.3rem,5.4vw,3.8rem)] leading-[1.04] font-bold tracking-tight">
                Find the flaws. <em className="not-italic" style={{ color: "var(--color-brand)" }}>Win the client.</em>
              </h1>
              <p className="mb-7 max-w-[46ch] text-lg" style={{ color: "var(--color-muted)" }}>
                Crosshair finds businesses on its own, audits their websites for the problems you fix, spots who just
                raised money or hired a new leader, and writes the email, with proof in every line.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/finder" className="ch-btn ch-btn-primary px-6 py-3 text-[15px]">Start scanning</Link>
                <a href="#example" className="ch-btn px-6 py-3 text-[15px]">See an example</a>
              </div>
            </div>

            <div className="grid gap-3">
              {[
                ["Not mobile-friendly · slow · no HTTPS", "WEB", "Pitch a redesign, with their load time as proof", "ch-pill-hot"],
                ["No meta description · no sitemap", "SEO", "Pitch SEO, with the exact gaps listed", "ch-pill-warm"],
                ["No online booking · no chat", "AI", "Pitch automation for their front desk", "ch-pill-hold"],
                ["Just raised a Series A · new CMO", "NOW", "The trigger: budget and a new decision-maker", "ch-pill-sent"],
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

      {/* ---------------- sources strip ---------------- */}
      <div className="border-y px-5 py-5" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-6 gap-y-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
          <span className="ch-label">Scans public</span>
          {SOURCES.map((s) => (
            <span key={s} className="font-semibold" style={{ color: "var(--color-fg)" }}>{s}</span>
          ))}
        </div>
      </div>

      <div className="px-5">
        <div className="mx-auto max-w-[1160px] space-y-20 py-16">
          {/* ---------------- how ---------------- */}
          <section id="how">
            <SectionTitle kicker="How it works" title="Six steps. Mostly automatic." sub="From a public post or a news headline to a company you can pitch with evidence." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map(([title, body], i) => (
                <div key={title} className="ch-card">
                  <span className="ch-label">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-1 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------- example ---------------- */}
          <section id="example">
            <SectionTitle kicker="Example" title="What one company looks like" sub="An illustration of a single result: the problems found, the reason to reach out now, and the email Crosshair drafts from them." />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="ch-card space-y-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <b className="block text-[16px]">Northwind Physio</b>
                    <span className="text-[13px]" style={{ color: "var(--color-brand)" }}>northwindphysio.com</span>
                  </div>
                  <div className="grid h-12 w-12 place-items-center rounded-full text-[15px] font-bold" style={{ border: "3px solid var(--color-mint)", fontFamily: "var(--font-mono)" }}>82</div>
                </div>
                <div className="rounded-[9px] px-3 py-2 text-[13px]" style={{ background: "var(--color-raise)" }}>
                  <b>Why now:</b> Northwind Physio opens a second clinic downtown
                </div>
                <ul className="space-y-1.5 text-[13px]">
                  {[
                    ["high", "Not mobile-friendly", "No mobile viewport tag; it shows as a shrunken desktop page on phones."],
                    ["high", "Slow homepage", "The homepage took 7.4s to load."],
                    ["medium", "No online booking", "The site talks about appointments but customers have to call."],
                    ["medium", "No meta description", "Google has no description to show under the result."],
                  ].map(([sev, t, e]) => (
                    <li key={t}>
                      <span className="font-semibold" style={{ color: sev === "high" ? "var(--color-coral)" : "var(--color-amber)" }}>{sev}</span> <b>{t}.</b>{" "}
                      <span style={{ color: "var(--color-muted)" }}>{e}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {["web design", "seo", "ai automation"].map((s) => <span key={s} className="ch-tag">{s}</span>)}
                  <span className="flex-1" />
                  <span className="text-[13px] font-semibold" style={{ color: "var(--color-brand)" }}>hello@northwindphysio.com</span>
                </div>
              </div>
              <div className="ch-card space-y-3">
                <div className="space-y-1 border-b pb-3 text-[13px]" style={{ borderColor: "var(--color-line)" }}>
                  <p><span style={{ color: "var(--color-muted)" }}>To:</span> hello@northwindphysio.com</p>
                  <p className="font-semibold">Quick note on northwindphysio.com</p>
                </div>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
{`Hi Northwind Physio team,

Congrats on the news (opening a second clinic downtown). Moments like this send a lot of new people to your website, so I took a quick look at it.

A couple of things stood out:
- Not mobile-friendly: it shows as a shrunken desktop page on phones.
- Slow homepage: the homepage took 7.4s to load.

We help clinics with web design, SEO and online booking, and these are quick wins. Would it help if I sent a short video walking through the fixes?`}
                </p>
                <div className="flex flex-wrap gap-2 text-[12px]">
                  {["Day 0 · this email", "Day 3 · follow-up", "Day 7 · last note"].map((d, i) => (
                    <span key={d} className="rounded-full px-2.5 py-1" style={{ background: i === 0 ? "var(--color-mint-bg)" : "var(--color-raise)", color: i === 0 ? "var(--color-mint)" : "var(--color-muted)" }}>{d}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- checks ---------------- */}
          <section id="checks">
            <SectionTitle kicker="What it checks" title="Every flaw maps to a service you sell" sub="Tell Crosshair what you offer and it scores companies on the problems you can actually fix." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CHECKS.map((c) => (
                <div key={c.service} className="ch-card">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`ch-pill ${c.pill}`}>{c.tag}</span>
                    <b>{c.service}</b>
                  </div>
                  <ul className="space-y-1 text-[13px]" style={{ color: "var(--color-muted)" }}>
                    {c.items.map((i) => <li key={i}>· {i}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------- scoring ---------------- */}
          <section>
            <SectionTitle kicker="Scoring" title="Pain + trigger + reach" sub="A company scores high when it has problems you fix, a reason to act now, and a public way to reach it." />
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Pain", "up to 75", "Flaws on their website that your services fix, weighted by severity: a site that isn't mobile-friendly counts more than a missing sitemap."],
                ["Trigger", "up to 15", "Fresh news: funding (they have budget) or a new executive (a new decision-maker). Hiring and expansion count too. Older news counts less."],
                ["Reach", "10", "A public email or phone on their own site. Without one, you can still use their contact form or reply where they posted."],
              ].map(([t, pts, body]) => (
                <div key={t} className="ch-card">
                  <div className="flex items-baseline justify-between">
                    <b className="text-[18px]">{t}</b>
                    <span className="text-[13px]" style={{ fontFamily: "var(--font-mono)", color: "var(--color-brand)" }}>{pts}</span>
                  </div>
                  <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------- ideas ---------------- */}
          <section id="ideas">
            <SectionTitle kicker="Ideas" title="Who it's for, and how they use it" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IDEAS.map(([who, how]) => (
                <div key={who} className="ch-card">
                  <b>{who}</b>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>{how}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------- faq ---------------- */}
          <section id="faq">
            <SectionTitle kicker="FAQ" title="Good questions" />
            <div className="grid gap-3 md:grid-cols-2">
              {FAQ.map(([q, a]) => (
                <details key={q} className="ch-card group" open>
                  <summary className="cursor-pointer font-semibold">{q}</summary>
                  <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>{a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* ---------------- cta ---------------- */}
          <section className="rounded-[18px] px-6 py-10 text-center text-white" style={{ background: "radial-gradient(120% 140% at 85% 30%, #183340 0%, #121c28 45%, #0c131c 100%)" }}>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Your next client already posted their website.
            </h2>
            <p className="mx-auto mt-2 max-w-[52ch] opacity-75">Press Scan, pick the companies that need you most, and send an email they&apos;ll actually read.</p>
            <Link href="/finder" className="mt-6 inline-flex rounded-full px-7 py-3 font-semibold" style={{ background: "#f2a07d", color: "#121c28" }}>
              Open the radar
            </Link>
          </section>

          <footer className="flex flex-wrap justify-between gap-2 border-t pt-5 text-[13px]" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
            <span>Crosshair</span>
            <span>Public data only &middot; nothing is sent without you</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
