-- Services-first lead finding: the user lists what they sell; the crawler
-- looks for people asking for it, alongside complaints about competitors.
alter table orgs add column if not exists services text[] not null default '{}';
alter table signals add column if not exists service text not null default '';
create index if not exists signals_org_service_idx on signals (org_id, service);
