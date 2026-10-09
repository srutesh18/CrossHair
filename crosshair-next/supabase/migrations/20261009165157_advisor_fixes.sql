-- Crosshair: fixes from the Supabase security + performance advisors.

-- handle_new_user only ever runs as the auth.users trigger; nobody should be
-- able to call it through /rest/v1/rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- auth_org_ids is called by every RLS policy, so signed-in users need it (it
-- only returns their own org ids). Anonymous callers never do.
revoke execute on function public.auth_org_ids() from public, anon;
grant execute on function public.auth_org_ids() to authenticated;

-- Evaluate auth.uid() once per query, not once per row.
drop policy if exists org_members_read on org_members;
create policy org_members_read on org_members for select
  using (user_id = (select auth.uid()) or org_id in (select auth_org_ids()));

-- Cover the remaining foreign keys (cascading deletes + RLS filters use them).
create index if not exists doc_chunks_org_idx on doc_chunks (org_id);
create index if not exists email_drafts_org_idx on email_drafts (org_id);
create index if not exists email_drafts_approved_by_idx on email_drafts (approved_by);
create index if not exists org_members_user_idx on org_members (user_id);
