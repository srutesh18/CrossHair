-- WhatsApp as an outreach channel, plus review velocity for local businesses.
--
-- Local businesses are reached on WhatsApp far more reliably than by cold
-- email, and the number is already captured from Google Places and tel: links.
-- WhatsApp messages are sent by the user from their own account via a wa.me
-- link, so there is no API, no cost and no sending reputation to protect.

alter table outreach_emails drop constraint if exists outreach_emails_method_check;
alter table outreach_emails add constraint outreach_emails_method_check
  check (method in ('smtp', 'mail_app', 'whatsapp'));

-- A WhatsApp message has a phone instead of an address, and no subject.
alter table outreach_emails alter column to_email set default '';
alter table outreach_emails add column if not exists to_phone text not null default '';

-- Review velocity: new Google reviews since the last audit is the local
-- equivalent of a funding round - it shows the business is alive and spending.
alter table companies add column if not exists reviews_prev int;
alter table companies add column if not exists reviews_checked_at timestamptz;
