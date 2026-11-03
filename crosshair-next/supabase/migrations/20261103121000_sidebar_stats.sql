-- The sidebar needs six numbers and rendered on every page load, which meant
-- six separate round trips to Postgres before any page could paint. One
-- function returns them together.
--
-- security invoker: the caller's RLS still applies, so the counts only ever
-- cover their own workspace.

create or replace function sidebar_stats()
returns json
language sql stable security invoker set search_path = public as $$
  select json_build_object(
    'to_review',      (select count(*) from companies where status = 'audited'),
    'strong',         (select count(*) from companies where status = 'audited' and score >= 60),
    'due',            (select count(*) from outreach
                        where stage = 'emailed' and next_step <= 2 and next_action_at <= now()),
    'in_pipeline',    (select count(*) from outreach
                        where stage in ('to_contact', 'emailed', 'replied')),
    'sent_this_week', (select count(*) from outreach_emails
                        where sent_at >= date_trunc('week', now())),
    'last_scan',      (select coalesce(finished_at, started_at) from crawl_runs
                        where query = 'auto-discovery' order by started_at desc limit 1)
  );
$$;
