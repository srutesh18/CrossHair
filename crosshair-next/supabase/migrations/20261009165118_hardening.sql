-- Crosshair 0002: retrieval index, sending details, draft edits, org backfill.

-- ---------- RAG index ----------
-- ivfflat built on an empty table clusters nothing, and with lists = 100 and
-- the default probes = 1 a small corpus can return zero rows. hnsw has no
-- training step and is accurate at any size.
drop index if exists doc_chunks_embedding_idx;
create index doc_chunks_embedding_idx on doc_chunks
  using hnsw (embedding vector_cosine_ops);
create index if not exists doc_chunks_doc_idx on doc_chunks (doc_id);

-- ---------- sending ----------
-- A verified address a human entered. Real sending refuses without one.
alter table leads add column if not exists contact_email text not null default '';
-- Signature used in drafted emails ("Alex, <product>").
alter table orgs add column if not exists sender_name text not null default 'Alex';

-- ---------- scoring audit ----------
-- Typesafe AI's independent ratings + confidences, when the cross-check ran.
alter table lead_scores add column if not exists crosscheck jsonb;

-- ---------- human edits ----------
alter table email_drafts add column if not exists edited_at timestamptz;

-- ---------- lookups ----------
create index if not exists lead_scores_org_idx on lead_scores (org_id);
create index if not exists email_drafts_lead_idx on email_drafts (lead_id, day);
create index if not exists trigger_events_lead_idx on trigger_events (lead_id);

-- ---------- backfill ----------
-- Accounts created before 0001 ran never fired on_auth_user_created, so they
-- have no org. Give each one its own workspace, exactly as the trigger would.
do $$
declare u record; new_org uuid;
begin
  for u in
    select id, email from auth.users
    where id not in (select user_id from org_members)
  loop
    insert into orgs (name) values (coalesce(u.email, 'My workspace')) returning id into new_org;
    insert into org_members (org_id, user_id, role) values (new_org, u.id, 'owner');
  end loop;
end $$;
