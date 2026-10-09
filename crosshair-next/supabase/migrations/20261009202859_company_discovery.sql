-- Automatic discovery: companies found in public posts where owners share
-- their own website (Reddit, Hacker News launches, community forums).
alter table companies drop constraint if exists companies_source_check;
alter table companies add constraint companies_source_check
  check (source in ('manual','csv','google_places','reddit','hn','forum'));

-- Where we found them: the post, its title, who posted it, when.
alter table companies add column if not exists found_url text not null default '';
alter table companies add column if not exists found_title text not null default '';
alter table companies add column if not exists found_author text not null default '';
alter table companies add column if not exists found_at timestamptz;
