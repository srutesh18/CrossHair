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

## Find leads (`/finder`, the home screen)

The user flow:

1. **Say what you sell.** The first screen asks for your services (and,
   optionally, competitors and who a good customer is). Nothing else is needed.
2. **Find leads.** One click crawls the public sources below for people
   *asking for* your services ("looking for a…", "can anyone recommend…") and
   people *unhappy with* a competitor.
3. **Review the table.** Every post gets a category and a 0-100 buying-intent
   score. Filter by text, category, service, competitor, source, intent, date
   and status; sort by intent or recency.
4. **Pick who to contact.** Tick rows, then **Export selected** (CSV), or
   **Score** a row to run the full Pain/Fit/Trigger pipeline and add it to your
   pipeline (this step uses Groq).
5. **Reach out.** Email automation, call automation (Sarvam AI) and LinkedIn
   DM automation (n8n) are shown on the selection bar and are **work in
   progress**: clicking them explains what they will do and sends nothing.

Crawling and categorising need **no Groq key**.

| Source | How | Default |
|---|---|---|
| Reddit | public search RSS, last year | on |
| Hacker News | Algolia API, exact-phrase, last year | on |
| Stack Exchange | public API: Stack Overflow, Software Recs, Web Apps, Super User | on |
| GitHub Issues | public search API (set `GITHUB_TOKEN` for higher limits) | off (best for dev-tool competitors) |
| Discourse forums | `/search.json` on each forum URL in Setup | when set |
| Web crawl | **Crawlee** `CheerioCrawler` on the pages in Setup, same-site links 1 deep, honours robots.txt | when set |

How a post is judged (`lib/crawl/classify.ts`):
- **Kept** only if it is in English, names a competitor/keyword/search term,
  and reads like a complaint. Searches pair each competitor with complaint
  words ("alternative", "slow", "expensive"…).
- **Category**: looking to hire / buy, switching, pricing, performance, reliability, support,
  integrations, usability, missing feature. Keyword rules first; Typesafe AI
  re-checks the strongest 30 and wins when ≥50% confident (it may upgrade a
  post to *switching* but never downgrade an explicit "alternatives to …").
- **Intent**: hire/buy or switching +40, other complaint +20, matches one of
  your services +15, named competitor +15,
  strong frustration +15, asking for recommendations +15, business context +10;
  sellers advertising or launching ("[For Hire]", "Show HN", "I built") are
  capped at 20 so they never outrank a real buyer.

Filters: text, category, source, competitor, minimum intent, posted within,
status (inbox / made into leads / dismissed), sort by intent or recency. The
CSV export follows the same filters.

```bash
# Run the crawler from the terminal without the app (writes nothing):
npm run crawl:preview -- --services "web design,seo audit"
npm run crawl:preview -- --competitors "Tableau,Power BI,Looker" --keywords "slow dashboards"
npm run crawl:preview -- --query "looker alternative" --sources hn,stackexchange,github
npm run crawl:preview -- --competitors "Tableau" --crawl "https://example.com/forum" --sources web
```

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
