-- Web search as a discovery source.
--
-- Google Programmable Search is free with no billing account, unlike the
-- Places API, so it is the way to find businesses by city and trade without
-- putting a card on file.

alter table companies drop constraint if exists companies_source_check;
alter table companies add constraint companies_source_check
  check (source in ('manual', 'csv', 'google_places', 'reddit', 'hn', 'forum', 'news', 'search'));

-- The queries a workspace searches for. Empty means "build them from services".
alter table orgs add column if not exists search_queries text[] not null default '{}';
