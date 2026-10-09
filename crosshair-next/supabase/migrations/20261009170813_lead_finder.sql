-- Lead Finder: crawled public posts ("signals"), classified by complaint
-- category and buying intent, before anyone turns them into a lead.

create type signal_status as enum ('new','promoted','dismissed');

-- Per-org crawl configuration (public URLs only).
alter table orgs add column if not exists forum_urls text[] not null default '{}';
alter table orgs add column if not exists crawl_urls text[] not null default '{}';

create table crawl_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  query text not null default '',
  sources text[] not null default '{}',
  stats jsonb not null default '{}',
  found int not null default 0,
  added int not null default 0,
  status text not null default 'running' check (status in ('running','done','failed')),
  error text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index crawl_runs_org_idx on crawl_runs (org_id, started_at desc);

create table signals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  run_id uuid references crawl_runs on delete set null,
  source text not null,
  source_name text not null default '',
  source_url text not null,
  author text not null default '',
  title text not null default '',
  body text not null,
  posted_at timestamptz,
  competitor text not null default '',
  category text not null default 'other',
  category_confidence real not null default 0,
  category_by text not null default 'rules' check (category_by in ('rules','typesafe')),
  intent smallint not null default 0 check (intent between 0 and 100),
  matched text[] not null default '{}',
  status signal_status not null default 'new',
  lead_id uuid references leads on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, source_url)
);
create index signals_org_list_idx on signals (org_id, status, posted_at desc);
create index signals_org_category_idx on signals (org_id, category);
create index signals_run_idx on signals (run_id);
create index signals_lead_idx on signals (lead_id);

alter table crawl_runs enable row level security;
alter table signals    enable row level security;

create policy crawl_runs_rw on crawl_runs for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
create policy signals_rw on signals for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
