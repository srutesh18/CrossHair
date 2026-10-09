# Crosshair

**Find people who need what you sell, and know when *not* to send an email.**

Tell Crosshair the services you sell (and, optionally, your competitors). It
crawls public communities for people asking for those services or unhappy with
a competitor, sorts every post into a category with a buying-intent score, and
lists them in a filterable table. Pick who to contact and export them; email,
call (Sarvam) and LinkedIn (n8n) automation are on the way.

The app lives in [`crosshair-next/`](crosshair-next/): Next.js 15, Supabase
(Postgres, Auth, RLS, pgvector), Groq for AI writing, Typesafe AI for
classification, and Crawlee for open-source web crawling.

See [`crosshair-next/README.md`](crosshair-next/README.md) for setup.

```bash
cd crosshair-next
npm install
cp .env.example .env.local   # add your own keys
npm run db:migrate           # or apply supabase/migrations in the SQL editor
npm run dev                  # http://localhost:3000
```

Public data only. Draft mode by default: nothing is sent without a human.
