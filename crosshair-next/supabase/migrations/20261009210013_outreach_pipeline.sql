-- Outreach pipeline: companies the user chose to contact, the email sequence
-- (Day 0 / 3 / 7) and every email sent.

create table outreach (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  company_id uuid not null references companies on delete cascade,
  stage text not null default 'to_contact'
    check (stage in ('to_contact','emailed','replied','won','lost')),
  next_step smallint not null default 0 check (next_step between 0 and 3), -- 3 = sequence finished
  next_action_at timestamptz default now(),
  last_contacted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, company_id)
);
create index outreach_org_stage_idx on outreach (org_id, stage, next_action_at);
create index outreach_company_idx on outreach (company_id);

create table outreach_emails (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  outreach_id uuid not null references outreach on delete cascade,
  step smallint not null check (step between 0 and 2),
  to_email text not null,
  subject text not null,
  body text not null,
  method text not null check (method in ('smtp','mail_app')),
  status text not null default 'sent' check (status in ('sent','failed')),
  error text not null default '',
  sent_at timestamptz not null default now()
);
create index outreach_emails_outreach_idx on outreach_emails (outreach_id, sent_at);
create index outreach_emails_org_idx on outreach_emails (org_id);

-- Email sequence and signature per workspace (null = built-in defaults).
alter table orgs add column if not exists email_templates jsonb;
alter table orgs add column if not exists signature text not null default '';

alter table outreach enable row level security;
alter table outreach_emails enable row level security;
create policy outreach_rw on outreach for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
create policy outreach_emails_rw on outreach_emails for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
