-- ═══════════════════════════════════════════════════════════════
-- Row-level security
--
-- The client talks to Postgres through PostgREST, so these policies —
-- not the application code — are the authorisation boundary. The checks
-- in `src/lib/auth/session.ts` exist to produce good error messages and
-- to stop people seeing shells they cannot use. The rules below are what
-- actually holds.
--
-- Three things are enforced here and nowhere else that matters:
--
--   1. An anonymous client can read a studio only when it is approved,
--      published and not suspended.
--   2. A studio owner can read and write only their own organisation's
--      rows.
--   3. Only a PL·CE admin can move a listing into an approving state —
--      so an owner cannot approve their own studio even by talking to
--      the database directly.
-- ═══════════════════════════════════════════════════════════════

alter table users                     enable row level security;
alter table organizations             enable row level security;
alter table organization_members      enable row level security;
alter table categories                enable row level security;
alter table amenities                 enable row level security;
alter table studios                   enable row level security;
alter table studio_images             enable row level security;
alter table spaces                    enable row level security;
alter table space_amenities           enable row level security;
alter table studio_applications       enable row level security;
alter table studio_application_events enable row level security;
alter table customers                 enable row level security;
alter table bookings                  enable row level security;
alter table booking_events            enable row level security;
alter table availability_rules        enable row level security;
alter table blocked_times             enable row level security;
alter table payments                  enable row level security;
alter table reviews                   enable row level security;
alter table notifications             enable row level security;
alter table whatsapp_accounts         enable row level security;
alter table whatsapp_messages         enable row level security;
alter table whatsapp_conversations    enable row level security;
alter table admin_actions             enable row level security;

-- ── users ──────────────────────────────────────────────────────
-- You can read yourself. An admin can read everyone. Nobody else can
-- enumerate the user table — a marketplace's user list is not public.

create policy users_select_self on users
  for select to authenticated
  using (id = (select auth.uid()) or is_platform_admin());

create policy users_update_self on users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy users_admin_manage on users
  for update to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

/**
 * platform_role is not self-service.
 *
 * Without this, `users_update_self` would let anyone grant themselves
 * the admin role with a single PATCH — the most valuable privilege
 * escalation in the product.
 */
create or replace function guard_platform_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.platform_role is distinct from old.platform_role and not is_platform_admin() then
    raise exception 'Only PL·CE administrators can change a platform role'
      using errcode = '42501';
  end if;
  if new.suspended_at is distinct from old.suspended_at and not is_platform_admin() then
    raise exception 'Only PL·CE administrators can suspend an account'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_guard_platform_role
  before update on users
  for each row execute function guard_platform_role();

-- ── organisations and membership ───────────────────────────────

create policy organizations_select_member on organizations
  for select to authenticated
  using (is_org_member(id) or is_platform_admin());

create policy organizations_insert_self on organizations
  for insert to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy organizations_update_owner on organizations
  for update to authenticated
  using (org_role_of(id) = 'owner' or is_platform_admin())
  with check (org_role_of(id) = 'owner' or is_platform_admin());

create policy organization_members_select on organization_members
  for select to authenticated
  using (is_org_member(organization_id) or user_id = (select auth.uid()) or is_platform_admin());

create policy organization_members_manage on organization_members
  for all to authenticated
  using (org_role_of(organization_id) = 'owner' or is_platform_admin())
  with check (org_role_of(organization_id) = 'owner' or is_platform_admin());

/**
 * The bootstrap case: creating your own organisation.
 *
 * `organization_members_manage` requires you to already be the owner,
 * which you cannot be until this row exists. This policy allows exactly
 * the first insert — yourself, as owner, into an organisation you own.
 */
create policy organization_members_bootstrap on organization_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from organizations
      where id = organization_id and owner_user_id = (select auth.uid())
    )
  );

-- ── taxonomy ───────────────────────────────────────────────────
-- Readable by everyone including anonymous visitors, since the filters
-- on `/discover` are built from it. Writable only by PL·CE.

create policy categories_select_all on categories for select to anon, authenticated using (true);
create policy amenities_select_all  on amenities  for select to anon, authenticated using (true);

create policy categories_admin_write on categories
  for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

create policy amenities_admin_write on amenities
  for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

-- ── studios ────────────────────────────────────────────────────
-- The public visibility rule, as policy. This is the same predicate as
-- `isPubliclyVisible` in `src/lib/listing/visibility.ts` and the same
-- one in both repository implementations. Changing one without the
-- others is the bug this triple-statement is designed to make obvious.

create policy studios_select_public on studios
  for select to anon, authenticated
  using (status = 'approved' and is_published and not is_suspended and archived_at is null);

create policy studios_select_own on studios
  for select to authenticated
  using (is_org_member(organization_id) or is_platform_admin());

create policy studios_insert_member on studios
  for insert to authenticated
  with check (
    is_org_member(organization_id)
    and org_role_of(organization_id) in ('owner', 'manager')
  );

create policy studios_update_member on studios
  for update to authenticated
  using (
    (is_org_member(organization_id) and org_role_of(organization_id) in ('owner', 'manager'))
    or is_platform_admin()
  )
  with check (
    (is_org_member(organization_id) and org_role_of(organization_id) in ('owner', 'manager'))
    or is_platform_admin()
  );

/**
 * Approval authority, enforced in the database.
 *
 * RLS can say who may update a row; it cannot easily say which *column
 * transitions* are legal. This trigger does, and it is the reason an
 * owner cannot approve their own listing even with a direct PostgREST
 * call and a valid token.
 *
 * The owner keeps exactly one lever over visibility — pausing an
 * already-approved listing by clearing is_published. That is a pause,
 * not an approval, and it cannot make anything live.
 */
create or replace function guard_listing_lifecycle()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'submitted' then
      if not (is_org_member(new.organization_id) or is_platform_admin()) then
        raise exception 'Only this studio''s team can submit it for review'
          using errcode = '42501';
      end if;
    elsif not is_platform_admin() then
      raise exception 'Only PL·CE can move a listing to %', new.status
        using errcode = '42501';
    end if;
  end if;

  if new.is_suspended is distinct from old.is_suspended and not is_platform_admin() then
    raise exception 'Only PL·CE can suspend or restore a listing'
      using errcode = '42501';
  end if;

  if new.is_featured is distinct from old.is_featured and not is_platform_admin() then
    raise exception 'Only PL·CE can feature a listing'
      using errcode = '42501';
  end if;

  -- Publishing is only ever possible from an approved state. The table
  -- constraint says the same thing; this produces the better message.
  if new.is_published and not old.is_published and new.status <> 'approved' then
    raise exception 'A listing can only be published once PL·CE has approved it'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger studios_guard_lifecycle
  before update on studios
  for each row execute function guard_listing_lifecycle();

-- ── studio images, spaces, amenities ───────────────────────────
-- Visible wherever the studio is visible; writable by its team.

create policy studio_images_select on studio_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from studios s
      where s.id = studio_id
        and (
          (s.status = 'approved' and s.is_published and not s.is_suspended)
          or is_org_member(s.organization_id)
          or is_platform_admin()
        )
    )
  );

create policy studio_images_write on studio_images
  for all to authenticated
  using (
    exists (
      select 1 from studios s
      where s.id = studio_id
        and (is_org_member(s.organization_id) or is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from studios s
      where s.id = studio_id
        and (is_org_member(s.organization_id) or is_platform_admin())
    )
  );

create policy spaces_select on spaces
  for select to anon, authenticated
  using (
    exists (
      select 1 from studios s
      where s.id = studio_id
        and (s.status = 'approved' and s.is_published and not s.is_suspended)
    )
    or is_org_member(organization_id)
    or is_platform_admin()
  );

create policy spaces_write on spaces
  for all to authenticated
  using (
    (is_org_member(organization_id) and org_role_of(organization_id) in ('owner', 'manager'))
    or is_platform_admin()
  )
  with check (
    (is_org_member(organization_id) and org_role_of(organization_id) in ('owner', 'manager'))
    or is_platform_admin()
  );

create policy space_amenities_select on space_amenities
  for select to anon, authenticated using (true);

create policy space_amenities_write on space_amenities
  for all to authenticated
  using (
    exists (
      select 1 from spaces sp
      where sp.id = space_id
        and (is_org_member(sp.organization_id) or is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from spaces sp
      where sp.id = space_id
        and (is_org_member(sp.organization_id) or is_platform_admin())
    )
  );

-- ── applications ───────────────────────────────────────────────
-- Never public. The owner sees their own; PL·CE sees all.

create policy studio_applications_select on studio_applications
  for select to authenticated
  using (is_org_member(organization_id) or is_platform_admin());

create policy studio_applications_insert on studio_applications
  for insert to authenticated
  with check (is_org_member(organization_id));

create policy studio_applications_update on studio_applications
  for update to authenticated
  using (is_org_member(organization_id) or is_platform_admin())
  with check (is_org_member(organization_id) or is_platform_admin());

create policy studio_application_events_select on studio_application_events
  for select to authenticated
  using (is_org_member(organization_id) or is_platform_admin());

-- Append-only: there is no update or delete policy, so the timeline
-- cannot be rewritten after the fact by anyone at all.
create policy studio_application_events_insert on studio_application_events
  for insert to authenticated
  with check (is_org_member(organization_id) or is_platform_admin());

-- ── customers ──────────────────────────────────────────────────
-- The tenant boundary that matters most commercially. A studio's
-- customer list is theirs; no other organisation can read a row of it,
-- and neither can an anonymous client.

create policy customers_tenant on customers
  for all to authenticated
  using (is_org_member(organization_id) or is_platform_admin())
  with check (is_org_member(organization_id) or is_platform_admin());

-- ── availability ───────────────────────────────────────────────
-- Opening hours are public — the booking form needs them before anyone
-- signs in. Blocked time is not: when a studio is closed for a private
-- reason, that reason is the studio's business.

create policy availability_rules_select on availability_rules
  for select to anon, authenticated using (true);

create policy availability_rules_write on availability_rules
  for all to authenticated
  using (
    (is_org_member(organization_id) and org_role_of(organization_id) in ('owner', 'manager'))
    or is_platform_admin()
  )
  with check (
    (is_org_member(organization_id) and org_role_of(organization_id) in ('owner', 'manager'))
    or is_platform_admin()
  );

create policy blocked_times_tenant on blocked_times
  for all to authenticated
  using (is_org_member(organization_id) or is_platform_admin())
  with check (is_org_member(organization_id) or is_platform_admin());

-- ── bookings ───────────────────────────────────────────────────
-- Three readers: the studio, the customer who made it, and PL·CE.
-- Notably absent: anonymous. Availability on the public booking form is
-- computed server-side, so `/discover` never needs to read a booking row
-- — and therefore never learns who booked what.

create policy bookings_select on bookings
  for select to authenticated
  using (
    is_org_member(organization_id)
    or customer_user_id = (select auth.uid())
    or is_platform_admin()
  );

create policy bookings_insert on bookings
  for insert to authenticated
  with check (
    is_org_member(organization_id)
    or customer_user_id = (select auth.uid())
    or is_platform_admin()
  );

create policy bookings_update on bookings
  for update to authenticated
  using (is_org_member(organization_id) or is_platform_admin())
  with check (is_org_member(organization_id) or is_platform_admin());

create policy booking_events_select on booking_events
  for select to authenticated
  using (is_org_member(organization_id) or is_platform_admin());

create policy booking_events_insert on booking_events
  for insert to authenticated
  with check (is_org_member(organization_id) or is_platform_admin());

create policy payments_tenant on payments
  for all to authenticated
  using (is_org_member(organization_id) or is_platform_admin())
  with check (is_org_member(organization_id) or is_platform_admin());

-- ── reviews ────────────────────────────────────────────────────

create policy reviews_select_public on reviews
  for select to anon, authenticated
  using (not is_hidden);

create policy reviews_insert_author on reviews
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and exists (
      select 1 from bookings b
      where b.id = booking_id
        and b.customer_user_id = (select auth.uid())
        and b.status = 'completed'
    )
  );

create policy reviews_moderate on reviews
  for update to authenticated
  using (is_platform_admin() or is_org_member(organization_id))
  with check (is_platform_admin() or is_org_member(organization_id));

-- ── notifications ──────────────────────────────────────────────

create policy notifications_own on notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_mark_read on notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Notifications are written by the server (service role) and by actions
-- running as a member of the organisation the event belongs to.
create policy notifications_insert on notifications
  for insert to authenticated with check (true);

-- ── whatsapp ───────────────────────────────────────────────────
-- The webhook runs as the service role and bypasses all of this. These
-- policies cover what the owner sees in `/studio/whatsapp`.

create policy whatsapp_accounts_tenant on whatsapp_accounts
  for all to authenticated
  using (is_org_member(organization_id) or is_platform_admin())
  with check (
    (is_org_member(organization_id) and org_role_of(organization_id) in ('owner', 'manager'))
    or is_platform_admin()
  );

create policy whatsapp_messages_tenant on whatsapp_messages
  for select to authenticated
  using (is_org_member(organization_id) or is_platform_admin());

create policy whatsapp_conversations_tenant on whatsapp_conversations
  for select to authenticated
  using (is_org_member(organization_id) or is_platform_admin());

-- ── admin audit ────────────────────────────────────────────────
-- Readable only by PL·CE, and by nobody at all through an update or
-- delete: the audit log has no policy permitting either, which is the
-- point of having one.

create policy admin_actions_select on admin_actions
  for select to authenticated
  using (is_platform_admin());

create policy admin_actions_insert on admin_actions
  for insert to authenticated
  with check (is_platform_admin() and admin_user_id = (select auth.uid()));
