-- Triggers: recent news that makes now the right time to reach out
-- (funding, a new executive, a hiring push, an expansion).
alter table companies drop constraint if exists companies_source_check;
alter table companies add constraint companies_source_check
  check (source in ('manual','csv','google_places','reddit','hn','forum','news'));

alter table companies add column if not exists trigger_kind text not null default '';
alter table companies add column if not exists trigger_headline text not null default '';
alter table companies add column if not exists trigger_url text not null default '';
alter table companies add column if not exists trigger_at timestamptz;
create index if not exists companies_org_trigger_idx on companies (org_id, trigger_at desc) where trigger_kind <> '';
