# Crosshair — Next.js

**An AI sales agent that knows when *not* to send an email.**
*Don't email more. Email right.*

| Tier | Rule | Action |
|------|------|--------|
| **HOT**  | all three Strong | draft Day 0 / 3 / 7 |
| **WARM** | exactly one Fair, no None | softer draft, no hard ask |
| **HOLD** | any None, or two+ Fair | **no email, ever** |

The tier is computed in `lib/tier.ts`, never by a model. A second pass
(`refineDecision`) can confirm or correct the ratings, and the tier is always
recomputed from the final ratings. If that pass demotes a lead to Hold, its
drafts are deleted.

## Stack

- **Next.js 15** App Router + React 19 + TypeScript (strict) + **Tailwind v4**
- Route handlers validated with **Zod**, no separate server
- **Supabase**: Postgres + Auth + RLS, **pgvector** (HNSW) for RAG
- **Groq** (`openai/gpt-oss-120b`) for every generation step
- **Typesafe AI** (`jev-latest`) as an independent, calibrated cross-check on ratings
- **Transformers.js** `all-MiniLM-L6-v2` (384-dim, q8) for embeddings, local and free
- Exports: papaparse (CSV), exceljs (XLSX), @react-pdf/renderer (PDF)
- Sources: Reddit public search, Google News RSS, public pages (cheerio)

## Local setup

```bash
npm install
cp .env.example .env.local     # fill in the values (see below)
npm run db:migrate             # creates the schema in Supabase
npm run dev                    # http://localhost:3000
```

Then sign up at `/login`. The first screen asks what services you sell; that
is all the crawler needs. To draft emails, upload docs about your product in
**Setup** (drafting refuses to run until at least one doc is embedded, so the
writer can never invent a feature).

| Variable | Where | Needed for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API keys | everything |
| `GROQ_API_KEY` | console.groq.com → API Keys | all AI steps |
| `TYPESAFE_AI_API_KEY` | Typesafe AI dashboard | optional rating cross-check |
| `SUPABASE_DB_URL` | Supabase → Connect → Session pooler | `npm run db:migrate` (local only) |
| `SUPABASE_SECRET_KEY` | Supabase → API keys → secret | `npm run embed:docs` (local only) |
| `SEND_ENABLED` + `SMTP_*`, `SEND_FROM`, `UNSUBSCRIBE_URL` | your mail provider | real sending (off by default) |

### Scripts

```bash
npm run db:migrate     # apply pending supabase/migrations/*.sql
npm run db:status      # list applied / pending migrations
npm run embed:docs -- --email you@company.com   # embed your own docs/*.md from the CLI
npm run typecheck
npm run build
```

Migrations are recorded in `supabase_migrations.schema_migrations`, the table
the Supabase CLI uses, so `supabase db push` agrees with `db:migrate`. You can
also paste each file into the Supabase SQL editor, in order.

| Migration | What it does |
|---|---|
| `…_init.sql` | schema, RLS on every table, `match_doc_chunks`, new-signup → own org trigger |
| `…_hardening.sql` | HNSW vector index, contact email, sender name, cross-check audit, draft edits, backfills orgs for accounts created before init |
| `…_advisor_fixes.sql` | Supabase advisor fixes: locks down `SECURITY DEFINER` functions, per-query `auth.uid()`, foreign-key indexes |
| `…_policies_authenticated_only.sql` | every RLS policy scoped `to authenticated`; anonymous requests see zero rows |
| `…_lead_finder.sql` | `signals` + `crawl_runs` tables (RLS), forum and crawl URLs per workspace |
| `…_services_first.sql` | `services` per workspace, `service` matched on each signal |
| `…_neutral_defaults.sql` | neutral default product name |
| `…_companies.sql` | `companies` table (RLS): website, contacts, flaws with evidence, score, status |
| `…_company_discovery.sql` | discovery sources (reddit / hn / forum) and where each company was found |
| `…_company_triggers.sql` | news triggers on companies (kind, headline, link, date) |
| `…_outreach_pipeline.sql` | `outreach` (stage, next step, next action date, notes) and `outreach_emails` (every email sent), RLS; templates and signature on orgs |

All of them are applied to project `kvhqpgflvvdxxoebgjvv`. New migrations should use
the same `YYYYMMDDHHMMSS_name.sql` naming.

## Deploy to Vercel

1. Push the repo and import it in Vercel with **Root Directory = `crosshair-next`**
   (framework preset: Next.js, no other build settings needed).
2. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GROQ_API_KEY`, and optionally
   `TYPESAFE_AI_API_KEY`, `TYPESAFE_AI_MODEL=jev-latest`. Do **not** add
   `SUPABASE_DB_URL` or `SUPABASE_SECRET_KEY`; they are for local scripts only.
3. In Supabase → Authentication → URL Configuration, set **Site URL** to your
   Vercel URL and add `https://<your-domain>/auth/callback` (and
   `http://localhost:3000/auth/callback`) to **Redirect URLs**, so confirmation
   emails land back in the app.
4. Run `npm run db:migrate` once from your machine (migrations are not run on
   deploy).
5. Check `https://<your-domain>/api/health`. It returns `"ok": true` when
   Supabase, the schema and the Groq key are all in place.

Notes for serverless:
- The embedding model (~23 MB) downloads to `/tmp` on a cold start, so the first
  doc upload or draft after a deploy is a few seconds slower.
- `next.config.ts` keeps only the linux-x64 onnxruntime binary, so the functions
  that embed are ~50 MB, well under Vercel's 250 MB limit.
- Long routes declare `maxDuration` (scan 300 s, draft 180 s). Vercel's default
  fluid compute allows this on every plan.

## Security

- AI keys are read server-side only (`lib/ai/provider.groq.ts`, `lib/ai/typesafe.ts`),
  never logged or returned. `/api/health` reports what is *set*, never values.
- Every query runs as the signed-in user, so **RLS scopes all rows to their org**.
  Exports, doc uploads and the RAG lookup all run under that session.
- Draft mode is the default. `SEND_ENABLED=false` means Approve only records the
  approval. Real sending needs `SEND_ENABLED=true`, SMTP credentials, an
  `UNSUBSCRIBE_URL` and a human-entered contact email. **Hold leads can never be
  approved or sent**, and a Day 0 draft with claims flagged by the second pass
  must be edited by a human before it can be approved.

## AI layer

`lib/ai.ts` is the only place generation happens. Four typed functions, each
Zod-validated in and out, with a 60 s timeout and one retry:

| Function | Returns |
|---|---|
| `analyzeComplaint()` | person, company, competitor, pain type |
| `scoreLead()` | pain / fit / trigger, each Strong-Fair-None **with a one-line reason**, then cross-checked |
| `draftEmails()` | Day 0 / 3 / 7, grounded in retrieved docs, signed with your sender + product name |
| `refineDecision()` | confirmed or corrected ratings + flagged invented claims |

**Cross-check.** After Groq rates a lead, Typesafe AI answers the same three
questions as calibrated choice probabilities. A rating is lowered only when
Typesafe is at least 75% confident in a *lower* rating; it never raises one.
Its answers are stored on `lead_scores.crosscheck` and shown under each score.
If Typesafe is unreachable, Groq's ratings stand.

There is deliberately **no sample-data fallback**: on failure the UI shows a real
error rather than presenting invented leads as real.

## Radar (`/finder`, the home screen)

**Automatic discovery.** Press **Scan now** (the first scan starts by itself).
Crosshair searches public posts where business owners share their own website
and adds each site as a company, then audits it. No manual lists needed:

| Source | What it reads |
|---|---|
| Reddit | business and feedback communities (r/smallbusiness, r/Entrepreneur, r/web_design, r/SEO, r/shopify, r/SaaS, r/sideproject…) for "my website", "my store", "roast", "feedback", "I built", "launched" |
| Hacker News | "Show HN" launches from the last 30 days, plus "feedback on my website" posts |
| Communities | Bubble, n8n and Make.com forums: members' posts that mention their site |
| Company news | TechCrunch, tech.eu, BetaKit, Inc42, PR Newswire and Google News (last 30 days): funding rounds, new CEO/CMO/CTO, hiring pushes, expansions |

**Triggers (why now).** A news headline is parsed into a company and a trigger
(`lib/sources/companyNews.ts`), e.g. "AI chip maker SambaNova raises $1B" →
SambaNova, Funding. Its website is found by trying likely domains and accepting
one only if the site's own title names every word of the company (one-word
names must also match the headline's topic, so "TODAY raises €2.8M" never
resolves to today.com); Wikidata is a checked fallback. Investment funds are
skipped. Recent funding or a new executive adds up to +15 to the score: they
have budget and a new decision-maker now.

The owner's site is the first link that isn't a platform (Reddit, YouTube,
GitHub, app stores, link shorteners…). Businesses (stores, services, clients,
B2B) are ranked before hobby projects. Each company keeps where it was found
(post, title, author), so replying to their post is a contact route too.

A **3D radar** (three.js / React Three Fiber) shows every company as a beacon:
nearer the centre and taller = better opportunity; colour = score; the beam
speeds up while scanning. The audit then runs as below.

### Find clients flow

Crosshair finds **companies whose websites have problems your services fix**,
proves each problem with evidence, and collects the public contact details on
their own site, so every message is about their real problem and goes to an
address they published.

1. **Say what you sell.** The first screen asks for your services (and,
   optionally, who a good customer is). Web design, SEO, app development and AI
   automation each map to a set of website checks.
2. **Add companies**: automatically by scanning (above), or by hand from the
   "add a website yourself" link:
   - **Search Google**: "dentists" in "Austin, TX" (Places API, needs
     `GOOGLE_API_KEY`). Businesses with no website are added too: that is the
     biggest flaw of all.
   - **Paste websites**: one per line, or "Name, website".
   - **Upload CSV**: a `website` column, optionally `name`, `email`, `phone`.
3. **Automatic audit.** New companies are audited in small batches with a
   progress bar. Per site:
   - homepage fetched over https (falls back to http, which is itself a flaw),
     timed; robots.txt honoured (a site that disallows crawlers is skipped);
   - **Crawlee** visits the contact / about pages for public emails (including
     Cloudflare-protected ones and schema.org data), phone links, contact forms
     and social profiles;
   - up to 8 internal links are checked for 404s, plus `/sitemap.xml`;
   - optional Google PageSpeed mobile score (same `GOOGLE_API_KEY`).
4. **Review the table.** Score, company, flaws (click a row for every flaw and
   its evidence), which of your services fix them, best contact. Filter by text,
   service, flaw, contact (has email / phone / none), score and status; sort by
   score or newest.
5. **Act on a selection.** Export selected (CSV with emails, phones and the top
   flaws as evidence), mark contacted, dismiss, delete. **Email**, **Call
   (Sarvam AI)** and **LinkedIn DM (n8n)** are work in progress: they explain
   what they will do and send nothing.

### What the audit checks (`lib/audit/checks.ts`)

| Area (fixed by) | Flaws |
|---|---|
| Website (web design) | no website, site down, no HTTPS, not mobile-friendly, slow homepage, poor PageSpeed, © year 2+ years old, broken links, outdated WordPress/jQuery/Flash, hard to contact |
| SEO | no or weak title, no meta description, no H1, noindex, no sitemap, images without alt text, no schema.org data, very little text, no analytics |
| Automation (AI automation) | no online booking (only for appointment businesses: clinics, salons, restaurants…, judged from the site's title, description, headings and menu), no chat or WhatsApp |
| App / portal (app development) | no customer login, online ordering or app (only for shops, restaurants, member businesses) |

**Score** (`lib/audit/score.ts`) = pain + trigger + reach: high 25, medium 12,
low 5 for each flaw in an area your services cover (capped at 75); +15 for
funding or a new executive in the last 30 days (+10 hiring/expansion, half
after 30 days, none after 90); +10 when an email or phone was found.
Changing your services re-scores every company.

## Pipeline & email (`/pipeline`)

On the Radar, tick companies and press **Add to pipeline & email**. The board has
five columns: **To contact → Follow-up due → Waiting → Replied → Won / lost**.

Click a company to open the composer:
- the email for **Day 0 / Day 3 / Day 7**, written from its real flaws (with
  evidence) and its news trigger, fully editable;
- **Send now** when SMTP is configured, or **Open in Gmail / Outlook / your
  email app** (a ready draft) and then **"Yes, I sent it"** to log it;
- sending a step schedules the next one (Day 3 after 3 days, Day 7 after 4
  more); **They replied / Won / Lost** stop the follow-ups; history and notes
  are kept per company.

## Templates (`/templates`)

Edit the 3-step sequence, your name, company and signature, with a live preview
written for one of your real audited companies. Variables: `{{company}}`,
`{{domain}}`, `{{trigger}}`, `{{flaw_1}}`, `{{evidence_1}}`, `{{flaw_1_lower}}`,
`{{flaw_2}}`, `{{evidence_2}}`, `{{services}}`, `{{sender}}`, `{{signature}}`;
`{{#trigger}}…{{/trigger}}` shows only when there is news, `{{^trigger}}…{{/trigger}}`
only when not. Every default email ends with an opt-out line.

Direct sending needs `SEND_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS` (Gmail: an app password), `SEND_FROM` and
`UNSUBSCRIBE_URL` in `.env.local`. Without them the Gmail / Outlook / email-app
buttons work out of the box.

## Data sources

Public data only. No LinkedIn, nothing behind a login, no G2/Capterra scraping.
A scan queries the selected complaint sources in parallel; if one fails the
others still run, and the failure is shown per source.

| Source | How | Notes |
|---|---|---|
| **Reddit** | public search RSS feed | The JSON API now answers 403 to unauthenticated clients, so the RSS feed is used. It rate-limits (429) after a few rapid requests; wait a minute. |
| **Hacker News** | Algolia search API | Free, no key, stories + comments from the last 30 days. One search per competitor. |
| **Google News RSS** | trigger lookup per company | Only headlines that actually name the company count as a trigger. |
| **Public company pages** | cheerio, on demand | |

## Running locally

Supabase, Groq, Typesafe and the sources are online services; the app and the
embedding model run on your machine.

```bash
npm run dev    # http://localhost:3000, then check /api/health
```

For local testing it is easiest to turn off **Confirm email** in Supabase →
Authentication → Sign In / Providers → Email, so new sign-ups can log in
straight away.
