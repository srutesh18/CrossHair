-- Crosshair schema: multi-tenant leads with RLS + pgvector RAG.
-- Run in the Supabase SQL editor, or: supabase db push

create extension if not exists vector;

create type tier        as enum ('HOT','WARM','HOLD');
create type rating      as enum ('strong','fair','none');
create type lead_status as enum ('new','approved','sent','replied','hold');

-- ---------- tenancy ----------
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_name text not null default 'Pellucid',
  icp text not null default '',
  competitors text[] not null default '{}',
  keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references orgs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member',
  primary key (org_id, user_id)
);

-- Helper used by every policy. security definer so it can read org_members
-- without recursing into that table's own RLS.
create or replace function auth_org_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from org_members where user_id = auth.uid();
$$;

-- ---------- domain ----------
create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  name text not null,
  role text not null default '',
  company_name text not null default '',
  company_size text not null default '',
  industry text not null default '',
  competitor text not null default '',
  pain_type text not null default '',
  said text not null,
  source_name text not null default '',
  source_url text not null default '',
  source_at timestamptz,
  tier tier,
  status lead_status not null default 'new',
  created_at timestamptz not null default now()
);
create index leads_org_tier_idx on leads (org_id, tier, created_at desc);
create unique index leads_org_source_idx on leads (org_id, source_url)
  where source_url <> '';

create table lead_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  lead_id uuid not null references leads on delete cascade,
  pass text not null check (pass in ('initial','refined')),
  pain_rating rating not null,    pain_reason text not null,
  fit_rating rating not null,     fit_reason text not null,
  trigger_rating rating not null, trigger_reason text not null,
  tier tier not null,
  note text not null default '',
  model text not null default '',
  created_at timestamptz not null default now()
);
create index lead_scores_lead_idx on lead_scores (lead_id, created_at desc);

create table trigger_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  lead_id uuid references leads on delete set null,
  company_name text not null,
  headline text not null,
  kind text not null default '',
  url text not null default '',
  source text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index trigger_events_org_idx on trigger_events (org_id, published_at desc);

create table email_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  lead_id uuid not null references leads on delete cascade,
  day smallint not null check (day in (0,3,7)),
  subject text not null,
  body text not null,
  feature text not null default '',
  docs_used jsonb not null default '[]',
  flagged_claims jsonb not null default '[]',
  approved_by uuid references auth.users,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, day)
);

create table docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  title text not null,
  slug text not null,
  content text not null,
  unique (org_id, slug)
);

create table doc_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  doc_id uuid not null references docs on delete cascade,
  content text not null,
  embedding vector(384)
);
create index doc_chunks_embedding_idx on doc_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------- row level security ----------
alter table orgs          enable row level security;
alter table org_members   enable row level security;
alter table leads         enable row level security;
alter table lead_scores   enable row level security;
alter table trigger_events enable row level security;
alter table email_drafts  enable row level security;
alter table docs          enable row level security;
alter table doc_chunks    enable row level security;

create policy orgs_rw on orgs for all
  using (id in (select auth_org_ids())) with check (id in (select auth_org_ids()));

create policy org_members_read on org_members for select
  using (user_id = auth.uid() or org_id in (select auth_org_ids()));

create policy leads_rw on leads for all
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
create policy lead_scores_rw on lead_scores for all
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
create policy trigger_events_rw on trigger_events for all
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
create policy email_drafts_rw on email_drafts for all
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
create policy docs_rw on docs for all
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
create policy doc_chunks_rw on doc_chunks for all
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));

-- ---------- RAG retrieval ----------
-- security invoker: the caller's RLS still applies, so one org can never
-- retrieve another org's doc chunks.
create or replace function match_doc_chunks(query_embedding vector(384), match_count int)
returns table (doc_id uuid, title text, content text, similarity float)
language sql stable security invoker set search_path = public as $$
  select c.doc_id, d.title, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from doc_chunks c
  join docs d on d.id = c.doc_id
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------- new signups get an org ----------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  insert into orgs (name) values (coalesce(new.email, 'My workspace'))
    returning id into new_org;
  insert into org_members (org_id, user_id, role) values (new_org, new.id, 'owner');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();
