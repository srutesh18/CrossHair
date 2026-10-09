-- Company prospecting: businesses whose websites are audited for flaws that
-- the user's services fix, with the public contact details found on the site.

create type company_status as enum ('new','audited','failed','contacted','dismissed');

create table companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  name text not null default '',
  website text not null default '',          -- normalised origin, '' when none
  domain text not null default '',           -- dedupe key, '' when no website
  source text not null default 'manual' check (source in ('manual','csv','google_places')),
  search_query text not null default '',
  address text not null default '',
  category text not null default '',
  rating real,
  rating_count int,
  phone text not null default '',
  emails text[] not null default '{}',
  contact_page text not null default '',
  socials jsonb not null default '{}',
  flaws jsonb not null default '[]',          -- [{key,title,evidence,severity,area}]
  services_matched text[] not null default '{}',
  score smallint not null default 0 check (score between 0 and 100),
  status company_status not null default 'new',
  audit_error text not null default '',
  audited_at timestamptz,
  created_at timestamptz not null default now()
);
-- One row per website per org; companies without a website dedupe by name.
create unique index companies_org_domain_idx on companies (org_id, domain) where domain <> '';
create unique index companies_org_name_nosite_idx on companies (org_id, lower(name)) where domain = '';
create index companies_org_list_idx on companies (org_id, status, score desc);

alter table companies enable row level security;
create policy companies_rw on companies for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
