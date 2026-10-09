-- Scope every policy to signed-in users. Anonymous requests then match no
-- policy and see zero rows, instead of erroring on auth_org_ids(), which
-- anon can no longer execute.

drop policy if exists orgs_rw on orgs;
create policy orgs_rw on orgs for all to authenticated
  using (id in (select auth_org_ids())) with check (id in (select auth_org_ids()));

drop policy if exists org_members_read on org_members;
create policy org_members_read on org_members for select to authenticated
  using (user_id = (select auth.uid()) or org_id in (select auth_org_ids()));

drop policy if exists leads_rw on leads;
create policy leads_rw on leads for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));

drop policy if exists lead_scores_rw on lead_scores;
create policy lead_scores_rw on lead_scores for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));

drop policy if exists trigger_events_rw on trigger_events;
create policy trigger_events_rw on trigger_events for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));

drop policy if exists email_drafts_rw on email_drafts;
create policy email_drafts_rw on email_drafts for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));

drop policy if exists docs_rw on docs;
create policy docs_rw on docs for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));

drop policy if exists doc_chunks_rw on doc_chunks;
create policy doc_chunks_rw on doc_chunks for all to authenticated
  using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));
