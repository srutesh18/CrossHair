# Crosshair

**Find companies whose websites have problems you fix, and reach them with proof.**

Tell Crosshair the services you sell. Add companies (search Google for "dentists
in Austin", paste websites, or upload a CSV). Crosshair audits each website for
flaws your services fix (no HTTPS, not mobile-friendly, slow, poor SEO, no
online booking…), collects the public contact details on the site, scores the
opportunity, and lists everything in a filterable table. Pick who to contact and
export them; email, call (Sarvam) and LinkedIn (n8n) automation are on the way.

The app lives in [`crosshair-next/`](crosshair-next/): Next.js 15, Supabase
(Postgres, Auth, RLS, pgvector), Crawlee for open-source crawling, Google
Places / PageSpeed (optional), Groq and Typesafe AI for scoring and drafting.

See [`crosshair-next/README.md`](crosshair-next/README.md) for setup.

```bash
cd crosshair-next
npm install
cp .env.example .env.local   # add your own keys
npm run db:migrate           # or apply supabase/migrations in the SQL editor
npm run dev                  # http://localhost:3000
```

Public data only. Draft mode by default: nothing is sent without a human.
