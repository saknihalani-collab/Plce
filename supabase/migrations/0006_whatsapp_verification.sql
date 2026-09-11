-- ═══════════════════════════════════════════════════════════════
-- Proving a studio owns the number it claims
--
-- Until now, connecting WhatsApp meant typing a number into a form. The
-- row was created active, `verified_at` stayed null, and nothing checked
-- it — so the only thing standing between a stranger and a studio's
-- inbound bookings was knowing the number.
--
-- Two problems came with that:
--
--   1. An unproven claim was trusted. A message from the claimed number
--      resolved to the claiming organisation.
--   2. `phone` is globally unique, so a claim nobody could ever complete
--      permanently blocked the real owner from connecting it.
--
-- The fix is a possession challenge. PL·CE issues a short-lived code to
-- the signed-in owner; the owner sends it from the number itself. Meta
-- guarantees the sender, so completing the challenge proves the
-- authenticated PL·CE account controls that number — which is the only
-- claim the webhook ever needs to trust.
--
-- Unfinished claims expire, which is what stops squatting: a pending
-- claim holds the number for minutes, not forever.
-- ═══════════════════════════════════════════════════════════════

alter table whatsapp_accounts
  add column if not exists verification_code_hash  text,
  add column if not exists verification_expires_at timestamptz,
  add column if not exists verification_attempts   integer not null default 0;

comment on column whatsapp_accounts.verification_code_hash is
  'SHA-256 of "<phone>:<code>". The code itself is never stored, never logged, and never read back — it exists only in the owner''s browser and in the message they send.';
comment on column whatsapp_accounts.verification_expires_at is
  'When the pending challenge lapses. A lapsed claim releases the number for someone else to claim.';
comment on column whatsapp_accounts.verification_attempts is
  'Wrong codes tried against the current challenge. Bounded so a six-digit code cannot be guessed.';

-- The webhook looks up a pending challenge by sender number on every
-- message from an unrecognised phone, so it is worth an index.
create index if not exists whatsapp_accounts_pending_idx
  on whatsapp_accounts (phone)
  where verified_at is null;

-- ── Idempotency ────────────────────────────────────────────────
--
-- Meta retries anything it does not get a prompt 200 for, and a retried
-- "cancel Rahul's booking" must not cancel a second booking. The message
-- id Meta assigns is stable across those retries, so making it unique
-- turns the inbound log into a claim: the first delivery inserts, and a
-- duplicate loses the race at the database rather than in application
-- code that cannot see the other request.
--
-- Partial, because console test messages and older rows have no id.

create unique index if not exists whatsapp_messages_external_id_unique
  on whatsapp_messages (external_id)
  where external_id is not null;
