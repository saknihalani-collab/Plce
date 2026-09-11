-- ═══════════════════════════════════════════════════════════════
-- Owners cannot verify their own WhatsApp numbers
--
-- `whatsapp_accounts_tenant` is written `for all to authenticated`,
-- which includes UPDATE. That is correct for the columns an owner has
-- business touching — the display name, the active flag, and the
-- challenge they start themselves — and wrong for exactly one column.
--
-- Without this guard, an owner could reach PostgREST directly:
--
--     PATCH /rest/v1/whatsapp_accounts?id=eq.<their-own-row>
--     { "verified_at": "2026-01-01T00:00:00Z" }
--
-- …and the policy would allow it, because it genuinely is their row.
-- They would then own a verified number they had never proved they
-- control, and every inbound message from it would resolve to their
-- organisation. That is precisely the takeover the possession challenge
-- exists to prevent, so the challenge cannot be the only thing
-- preventing it.
--
-- `verified_at` is therefore writable by the webhook and nobody else.
-- The webhook holds the service role; browsers hold `authenticated` or
-- `anon`. Blocking those two roles leaves the server free to do its job
-- and leaves no client able to assert its own identity.
--
-- Same shape as `guard_listing_lifecycle`, which stops an owner
-- approving their own listing. A privileged state transition belongs to
-- the party that can verify it, and the database should be the thing
-- that says so — not only the application code above it.
--
-- SECURITY INVOKER on purpose: the check reads `current_user`, which
-- under SECURITY DEFINER would report the function's owner rather than
-- the caller and would quietly never fire.
-- ═══════════════════════════════════════════════════════════════

create or replace function guard_whatsapp_verification()
returns trigger
language plpgsql
as $$
declare
  -- The two roles PostgREST assumes for a browser-held key. Anything
  -- else is the server: `service_role` for the webhook, `postgres` for
  -- migrations and the SQL editor.
  client_role boolean := current_user in ('authenticated', 'anon');
begin
  if not client_role then
    return new;
  end if;

  if tg_op = 'INSERT' and new.verified_at is not null then
    raise exception 'A WhatsApp number cannot be created already verified'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.verified_at is distinct from old.verified_at then
    raise exception 'A WhatsApp number is verified by sending PL·CE a code from it, not by setting a column'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_accounts_guard_verification on whatsapp_accounts;

create trigger whatsapp_accounts_guard_verification
  before insert or update on whatsapp_accounts
  for each row execute function guard_whatsapp_verification();

comment on function guard_whatsapp_verification() is
  'Stops a client-held key writing whatsapp_accounts.verified_at. Only the webhook, holding the service role, may complete a possession challenge.';
