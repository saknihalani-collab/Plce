-- ═══════════════════════════════════════════════════════════════
-- PL·CE — complete database setup
--
-- Every migration in supabase/migrations, concatenated in order, so a
-- new Supabase project can be brought up in one paste:
--
--   1. supabase.com → New project (the free tier is enough)
--   2. SQL Editor → New query → paste this whole file → Run
--      This creates the `studio-images` storage bucket too, with the
--      policies that let an owner upload to their own studio's folder.
--   3. Project Settings → API → copy the Project URL and the anon key
--   4. On the host, set:
--        NEXT_PUBLIC_SUPABASE_URL=<project url>
--        NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
--      and delete .env.production
--   5. Redeploy — NEXT_PUBLIC_* variables are baked in at build time,
--      so a restart is not enough
--
-- This file is generated. Edit the numbered migrations, not this.
--
-- Running it twice is not safe: the table definitions are not guarded
-- with IF NOT EXISTS. Use it on a fresh project.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 0001_schema.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════
-- PL·CE — core schema
--
-- One database behind four interfaces: Discovery, the Studio CRM, the
-- Admin panel and WhatsApp. The shape below is what makes that possible
-- rather than aspirational —
--
--   • `organizations` is the tenant. Every private table carries
--     `organization_id` and is scoped by it in RLS (0002).
--   • `studios` separates *ownership* from *publication*: status,
--     is_published and is_suspended answer three different questions and
--     are three different columns.
--   • `bookings` is one table. A booking made on the marketplace, typed
--     into the calendar, or texted over WhatsApp is the same row.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
-- Needed for the booking overlap constraint: gist indexes cannot mix a
-- scalar equality with a range overlap without it.
create extension if not exists "btree_gist";

-- ── Enums ──────────────────────────────────────────────────────
-- Enums where the values change on a release cadence; text + check
-- where they are audit strings that grow often.

create type platform_role as enum ('customer', 'admin');
create type org_role      as enum ('owner', 'manager', 'staff');

create type listing_status as enum (
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
  'suspended',
  'unpublished'
);

create type booking_status as enum (
  'pending', 'confirmed', 'completed', 'cancelled', 'no_show'
);

create type payment_status as enum ('unpaid', 'partial', 'paid', 'refunded');

create type booking_source as enum (
  'plce', 'whatsapp', 'instagram', 'phone', 'walk_in', 'manual', 'admin'
);

create type amenity_group as enum ('comfort', 'technical', 'space', 'facilities');

-- ── Shared trigger ─────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── users ──────────────────────────────────────────────────────
-- `id` is the Supabase auth user id, so there is exactly one profile per
-- credential and resolving "who is asking" needs no join.
--
-- platform_role is who someone is to PL·CE. It is deliberately NOT where
-- studio ownership lives — that is a row in organization_members — so
-- that an admin can still be a customer and an owner can still book
-- someone else's studio.

create table users (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text        not null unique,
  full_name      text        not null,
  phone          text,
  avatar_url     text,
  platform_role  platform_role not null default 'customer',
  suspended_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index users_platform_role_idx on users (platform_role) where platform_role = 'admin';

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

/**
 * The profile row is created by the database, not by the application.
 *
 * A second network call from the app that can fail halfway would leave an
 * account that can sign in but has no profile — a state worth making
 * impossible rather than handling.
 */
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── organizations ──────────────────────────────────────────────
-- The tenant. A studio business, which may run more than one studio.

create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  owner_user_id uuid        not null references users (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index organizations_owner_idx on organizations (owner_user_id);

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

create table organization_members (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references users (id) on delete cascade,
  role            org_role not null default 'staff',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx on organization_members (user_id);

/**
 * Membership lookup used by nearly every RLS policy.
 *
 * SECURITY DEFINER on purpose: a policy on `bookings` that reads
 * `organization_members` would otherwise recurse into that table's own
 * policies. STABLE so the planner calls it once per query, not once per
 * row.
 */
create or replace function is_org_member(org uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = org and user_id = auth.uid()
  );
$$;

create or replace function org_role_of(org uuid)
returns org_role
language sql
stable
security definer set search_path = public
as $$
  select role from organization_members
  where organization_id = org and user_id = auth.uid();
$$;

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from users
    where id = auth.uid() and platform_role = 'admin'
  );
$$;

-- ── taxonomy ───────────────────────────────────────────────────
-- Admin-managed at runtime. Adding a category must never be a deploy.

create table categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text        not null unique,
  name        text        not null,
  description text,
  is_active   boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table amenities (
  id          uuid primary key default gen_random_uuid(),
  slug        text          not null unique,
  name        text          not null,
  "group"     amenity_group not null default 'comfort',
  is_active   boolean       not null default true,
  sort_order  integer       not null default 0,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

-- ── studios ────────────────────────────────────────────────────
-- The listing. Three lifecycle columns, not one:
--
--   status        did PL·CE approve this listing?
--   is_published  does the owner want it visible?
--   is_suspended  has PL·CE pulled it?
--
-- An approved studio the owner has paused is not the same thing as a
-- suspended one, and collapsing them loses the ability to restore the
-- right state.

create table studios (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  slug             text not null unique,

  name             text not null,
  tagline          text,
  description      text not null default '',
  category_id      uuid not null references categories (id) on delete restrict,

  city             text not null,
  area             text not null,
  address_line     text not null default '',
  postal_code      text,
  lat              double precision,
  lng              double precision,
  timezone         text not null default 'Asia/Kolkata',

  contact_name     text not null default '',
  contact_phone    text not null default '',
  contact_email    text not null default '',
  instagram        text,
  website          text,

  rules                text[] not null default '{}',
  cancellation_policy  text   not null default '',
  equipment            text[] not null default '{}',
  notes                text,

  -- Studio-wide booking policy.
  min_notice_minutes  integer not null default 60,
  max_advance_days    integer not null default 180,
  slot_minutes        integer not null default 30,
  auto_confirm        boolean not null default true,

  status          listing_status not null default 'draft',
  is_published    boolean not null default false,
  is_suspended    boolean not null default false,
  is_featured     boolean not null default false,

  -- Public-facing edits an owner made to an approved listing, held until
  -- an admin accepts them. The live columns above keep serving until then.
  has_pending_changes boolean not null default false,
  pending_changes     jsonb,

  published_at  timestamptz,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint studios_slot_minutes_sane check (slot_minutes in (15, 30, 60)),
  constraint studios_published_only_when_approved
    check (is_published = false or status in ('approved', 'suspended'))
);

create index studios_org_idx      on studios (organization_id);
create index studios_status_idx   on studios (status);
create index studios_category_idx on studios (category_id);
create index studios_city_idx     on studios (lower(city));

-- The index that serves `/discover`. Partial, because the marketplace
-- only ever queries the publicly visible subset.
create index studios_public_idx on studios (city, category_id)
  where status = 'approved' and is_published and not is_suspended;

create trigger studios_set_updated_at
  before update on studios
  for each row execute function set_updated_at();

create table studio_images (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios (id) on delete cascade,
  url         text not null,
  alt         text not null default '',
  is_cover    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index studio_images_studio_idx on studio_images (studio_id, sort_order);

-- At most one cover per studio, enforced rather than remembered.
create unique index studio_images_one_cover on studio_images (studio_id) where is_cover;

-- ── spaces ─────────────────────────────────────────────────────
-- The bookable resource. `organization_id` is denormalised from the
-- studio so that RLS on spaces, bookings and blocked_times can be a
-- single-column check instead of a join.

create table spaces (
  id               uuid primary key default gen_random_uuid(),
  studio_id        uuid not null references studios (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,

  name         text not null,
  description  text,
  capacity     integer not null default 1,
  size_sqft    integer,

  hourly_rate    integer not null,
  half_day_rate  integer,
  full_day_rate  integer,
  currency       text not null default 'INR',

  min_booking_minutes  integer not null default 60,
  buffer_minutes       integer not null default 15,

  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint spaces_rates_positive check (
    hourly_rate >= 0
    and (half_day_rate is null or half_day_rate >= 0)
    and (full_day_rate is null or full_day_rate >= 0)
  ),
  constraint spaces_duration_sane check (
    min_booking_minutes between 15 and 1440 and buffer_minutes between 0 and 240
  )
);

create index spaces_studio_idx on spaces (studio_id, sort_order);
create index spaces_org_idx    on spaces (organization_id);

create trigger spaces_set_updated_at
  before update on spaces
  for each row execute function set_updated_at();

create table space_amenities (
  space_id    uuid not null references spaces (id) on delete cascade,
  amenity_id  uuid not null references amenities (id) on delete cascade,
  primary key (space_id, amenity_id)
);

create index space_amenities_amenity_idx on space_amenities (amenity_id);

-- ── applications ───────────────────────────────────────────────
-- The review record. One per studio, and it outlives the decision — a
-- rejected application is kept so the timeline and the reason survive.

create table studio_applications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  studio_id        uuid not null unique references studios (id) on delete cascade,

  status            listing_status not null default 'draft',
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       uuid references users (id) on delete set null,
  admin_feedback    text,
  rejection_reason  text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index studio_applications_status_idx on studio_applications (status, submitted_at desc);
create index studio_applications_org_idx    on studio_applications (organization_id);

create trigger studio_applications_set_updated_at
  before update on studio_applications
  for each row execute function set_updated_at();

-- Append-only. The admin review page reads its timeline from here, so
-- these rows are the history rather than a rendering of it.
create table studio_application_events (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references studio_applications (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,
  type             text not null,
  actor_id         uuid references users (id) on delete set null,
  actor_name       text not null,
  message          text,
  created_at       timestamptz not null default now(),

  constraint studio_application_events_type_known check (
    type in (
      'application.created', 'application.submitted', 'application.review_started',
      'application.changes_requested', 'application.resubmitted', 'application.approved',
      'application.rejected', 'application.suspended', 'application.unpublished',
      'application.republished', 'application.edited'
    )
  )
);

create index studio_application_events_app_idx
  on studio_application_events (application_id, created_at);

-- ── customers ──────────────────────────────────────────────────
-- Per-organisation CRM contacts. Not users: most people who book a studio
-- over WhatsApp or walk in have no PL·CE account, and the studio still
-- needs a record of them. `user_id` links the two when they are the same
-- person.

create table customers (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  user_id          uuid references users (id) on delete set null,

  name    text not null,
  phone   text,
  email   text,
  notes   text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index customers_org_idx   on customers (organization_id);
create index customers_phone_idx on customers (organization_id, phone);
create index customers_user_idx  on customers (user_id);

-- A phone number identifies one contact within one studio. Across
-- studios the same number is a different row on purpose: customer lists
-- are the studio's own, not a shared marketplace directory.
create unique index customers_org_phone_unique
  on customers (organization_id, phone) where phone is not null;

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- ── availability ───────────────────────────────────────────────

create table availability_rules (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  space_id         uuid not null references spaces (id) on delete cascade,
  weekday          smallint not null,
  opens_at         text not null default '09:00',
  closes_at        text not null default '21:00',
  is_closed        boolean not null default false,

  constraint availability_rules_weekday_range check (weekday between 0 and 6),
  unique (space_id, weekday)
);

create index availability_rules_space_idx on availability_rules (space_id);

create table blocked_times (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  space_id         uuid not null references spaces (id) on delete cascade,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  reason           text,
  created_by       uuid references users (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint blocked_times_range check (ends_at > starts_at)
);

create index blocked_times_space_idx on blocked_times (space_id, starts_at);

-- ── bookings ───────────────────────────────────────────────────
-- The one booking table. Every source writes here through the engine.

create table bookings (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  organization_id  uuid not null references organizations (id) on delete cascade,
  studio_id        uuid not null references studios (id) on delete cascade,
  space_id         uuid not null references spaces (id) on delete restrict,

  customer_id       uuid not null references customers (id) on delete restrict,
  -- Null for WhatsApp, phone and walk-in bookings: there is a customer,
  -- but no PL·CE account behind them.
  customer_user_id  uuid references users (id) on delete set null,

  starts_at  timestamptz not null,
  ends_at    timestamptz not null,

  status          booking_status not null default 'pending',
  payment_status  payment_status not null default 'unpaid',
  source          booking_source not null default 'plce',

  guest_count   integer,
  price_amount  integer not null default 0,
  currency      text not null default 'INR',
  notes         text,

  created_by           uuid references users (id) on delete set null,
  cancelled_at         timestamptz,
  cancellation_reason  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint bookings_range check (ends_at > starts_at),
  constraint bookings_price_positive check (price_amount >= 0)
);

create index bookings_org_idx      on bookings (organization_id, starts_at desc);
create index bookings_space_idx    on bookings (space_id, starts_at);
create index bookings_customer_idx on bookings (customer_id);
create index bookings_user_idx     on bookings (customer_user_id, starts_at desc);
create index bookings_studio_idx   on bookings (studio_id, starts_at);

/**
 * The constraint that actually prevents double-booking.
 *
 * The engine checks availability first and returns a human error, which
 * is what people see. This is what makes that check *true* under
 * concurrency: two customers paying for the same Saturday slot in the
 * same instant is exactly the race an application-level check loses.
 *
 * Cancelled and no-show bookings are excluded, so cancelling a booking
 * immediately frees the slot.
 */
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    space_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'completed'));

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

create table booking_events (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,
  type             text not null,
  actor_id         uuid references users (id) on delete set null,
  actor_name       text not null,
  message          text,
  created_at       timestamptz not null default now(),

  constraint booking_events_type_known check (
    type in (
      'booking.created', 'booking.confirmed', 'booking.rescheduled',
      'booking.cancelled', 'booking.completed', 'booking.no_show',
      'booking.payment_updated', 'booking.note_added'
    )
  )
);

create index booking_events_booking_idx on booking_events (booking_id, created_at);

-- ── payments ───────────────────────────────────────────────────
-- Provider-agnostic. The abstraction lives in `src/lib/payments`; this
-- table records attempts against a booking whichever provider made them.

create table payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  booking_id       uuid not null references bookings (id) on delete cascade,
  provider         text not null default 'razorpay',
  provider_ref     text,
  amount           integer not null,
  currency         text not null default 'INR',
  status           text not null default 'created',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint payments_status_known check (
    status in ('created', 'authorized', 'captured', 'failed', 'refunded')
  )
);

create index payments_booking_idx on payments (booking_id);

-- ── reviews ────────────────────────────────────────────────────
-- Booking-gated: one review per booking, and only for a booking that
-- actually happened. Enforced by the unique constraint plus a check in
-- the repository; a review with no booking behind it cannot be inserted.

create table reviews (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  studio_id        uuid not null references studios (id) on delete cascade,
  booking_id       uuid not null unique references bookings (id) on delete cascade,
  author_user_id   uuid not null references users (id) on delete cascade,
  rating           smallint not null,
  body             text not null default '',
  is_hidden        boolean not null default false,
  created_at       timestamptz not null default now(),

  constraint reviews_rating_range check (rating between 1 and 5)
);

create index reviews_studio_idx on reviews (studio_id, created_at desc);

-- ── notifications ──────────────────────────────────────────────

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null default '',
  href        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);

-- ── whatsapp ───────────────────────────────────────────────────
-- The number is the identity anchor. An inbound message is trusted to be
-- from an organisation because Meta signed the request and the sender
-- resolves here — never because the message body says so.

create table whatsapp_accounts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  phone            text not null unique,
  display_name     text not null default '',
  is_active        boolean not null default true,
  verified_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index whatsapp_accounts_org_idx on whatsapp_accounts (organization_id);

create table whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  direction        text not null,
  phone            text not null,
  body             text not null,
  -- The structured intent the message produced, kept so the AI layer is
  -- auditable after the fact.
  intent           jsonb,
  booking_id       uuid references bookings (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint whatsapp_messages_direction check (direction in ('inbound', 'outbound'))
);

create index whatsapp_messages_org_idx on whatsapp_messages (organization_id, created_at desc);

-- A half-finished request waiting on one more answer. Expiring rows
-- rather than long-lived state: an abandoned conversation must not
-- silently complete a booking twenty minutes later.
create table whatsapp_conversations (
  organization_id  uuid not null references organizations (id) on delete cascade,
  phone            text not null,
  intent           jsonb not null,
  awaiting         text not null,
  expires_at       timestamptz not null,
  updated_at       timestamptz not null default now(),
  primary key (organization_id, phone)
);

-- ── admin audit ────────────────────────────────────────────────
-- Platform-wide, not tenant-scoped, and never written by a studio.

create table admin_actions (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid not null references users (id) on delete restrict,
  admin_name      text not null,
  action          text not null,
  entity_type     text not null,
  entity_id       uuid not null,
  entity_label    text not null default '',
  previous_state  jsonb,
  new_state       jsonb,
  note            text,
  created_at      timestamptz not null default now(),

  constraint admin_actions_entity_known check (
    entity_type in ('studio', 'application', 'user', 'category', 'amenity', 'booking')
  )
);

create index admin_actions_entity_idx on admin_actions (entity_id, created_at desc);
create index admin_actions_admin_idx  on admin_actions (admin_user_id, created_at desc);

-- ───────────────────────────────────────────────────────────────
-- 0002_rls.sql
-- ───────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────
-- 0003_views.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════
-- Aggregates
--
-- `/discover` needs a price, a capacity, a rating and a booking count for
-- every card, and needs to sort by them. Fetching those per studio would
-- be an N+1 on the most-visited page in the product; computing them with
-- one join would multiply rows and quietly break the average.
--
-- Scalar subqueries, one per measure, avoid both.
-- ═══════════════════════════════════════════════════════════════

create view studio_aggregates
with (security_invoker = on)
as
select
  s.id as studio_id,
  (select avg(r.rating)::numeric(3,2)
     from reviews r where r.studio_id = s.id and not r.is_hidden) as rating_average,
  (select count(*)
     from reviews r where r.studio_id = s.id and not r.is_hidden) as rating_count,
  (select count(*)
     from bookings b where b.studio_id = s.id and b.status <> 'cancelled') as booking_count,
  (select min(sp.hourly_rate)
     from spaces sp where sp.studio_id = s.id and sp.is_active) as price_from,
  (select max(sp.capacity)
     from spaces sp where sp.studio_id = s.id and sp.is_active) as capacity_max,
  (select count(*)
     from spaces sp where sp.studio_id = s.id and sp.is_active) as space_count,
  (select coalesce(sum(b.price_amount), 0)
     from bookings b where b.studio_id = s.id and b.status <> 'cancelled') as revenue,
  (select coalesce(array_agg(distinct a.slug), '{}')
     from spaces sp
     join space_amenities sa on sa.space_id = sp.id
     join amenities a on a.id = sa.amenity_id
    where sp.studio_id = s.id) as amenity_slugs
from studios s;

/**
 * `security_invoker = on` matters here.
 *
 * A view in Postgres runs as its owner by default, which would let an
 * anonymous client read aggregate facts — how many bookings, what
 * revenue — about studios it cannot see. With invoker security the
 * view is evaluated under the caller's own policies, so a draft studio
 * contributes nothing to what an anonymous client can read.
 */

-- ── Customer aggregates for the CRM list ───────────────────────

create view customer_aggregates
with (security_invoker = on)
as
select
  c.id as customer_id,
  (select count(*) from bookings b
    where b.customer_id = c.id and b.status <> 'cancelled') as total_bookings,
  (select coalesce(sum(b.price_amount), 0) from bookings b
    where b.customer_id = c.id and b.status <> 'cancelled') as total_spend,
  (select max(b.starts_at) from bookings b
    where b.customer_id = c.id and b.status <> 'cancelled' and b.starts_at < now()) as last_booking_at,
  (select min(b.starts_at) from bookings b
    where b.customer_id = c.id and b.status <> 'cancelled' and b.starts_at >= now()) as next_booking_at
from customers c;

-- ───────────────────────────────────────────────────────────────
-- 0004_taxonomy.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════
-- Starting taxonomy
--
-- A fresh PL·CE deployment needs categories and amenities to exist
-- before the first studio can apply — the application form is built from
-- them. These are starting values, not fixed ones: everything below is
-- editable at `/admin/categories` and `/admin/amenities` without a
-- deploy, which is the whole point of them being tables.
-- ═══════════════════════════════════════════════════════════════

insert into categories (slug, name, description, sort_order) values
  ('photography', 'Photography',        'Daylight studios, cycloramas and product tables.', 0),
  ('video',       'Video',              'Film-ready spaces with grid, blackout and load-in.', 1),
  ('podcast',     'Podcast',            'Treated rooms built for two to six voices.', 2),
  ('music',       'Music',              'Live rooms, vocal booths and mix suites.', 3),
  ('dance',       'Dance',              'Sprung floors, mirrors and sound.', 4),
  ('rehearsal',   'Rehearsal',          'Black boxes and band rooms by the hour.', 5),
  ('event',       'Event',              'Launches, screenings, shoots with an audience.', 6),
  ('workspace',   'Creative workspace', 'Desks, ateliers and maker rooms.', 7),
  ('other',       'Other',              'Everything that does not fit a box yet.', 8)
on conflict (slug) do nothing;

insert into amenities (slug, name, "group", sort_order) values
  ('ac',            'Air conditioning', 'comfort',    0),
  ('wifi',          'Wi-Fi',            'comfort',    1),
  ('parking',       'Parking',          'comfort',    2),
  ('changing-room', 'Changing room',    'comfort',    3),
  ('makeup-area',   'Makeup area',      'comfort',    4),
  ('kitchen',       'Kitchen',          'comfort',    5),
  ('lounge',        'Lounge',           'comfort',    6),
  ('soundproofing', 'Soundproofing',    'technical',  7),
  ('equipment',     'Equipment on site','technical',  8),
  ('green-screen',  'Green screen',     'technical',  9),
  ('lighting-rig',  'Lighting rig',     'technical', 10),
  ('backdrops',     'Backdrop system',  'technical', 11),
  ('monitor',       'Client monitor',   'technical', 12),
  ('natural-light', 'Natural light',    'space',     13),
  ('cyclorama',     'Cyclorama',        'space',     14),
  ('high-ceiling',  'High ceiling',     'space',     15),
  ('blackout',      'Full blackout',    'space',     16),
  ('freight-lift',  'Freight lift',     'facilities',17),
  ('storage',       'Storage',          'facilities',18),
  ('restrooms',     'Restrooms',        'facilities',19)
on conflict (slug) do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0005_whatsapp_provenance.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════
-- Provenance for owner-created bookings
--
-- A booking made over WhatsApp is a real booking with real money
-- attached, created by a sentence someone typed while holding a light
-- stand. When an owner asks three weeks later "who booked this?", the
-- answer has to be better than "WhatsApp".
--
-- So the event carries the message id and the structured intent that
-- produced it, and the message carries what the assistant actually did.
-- Together they turn "62% of bookings came from WhatsApp" into a query
-- rather than a guess — and turn a disputed booking into something that
-- can be traced back to its sentence.
-- ═══════════════════════════════════════════════════════════════

alter table booking_events
  add column if not exists metadata jsonb;

comment on column booking_events.metadata is
  'How the event came about: for WhatsApp, the message id and the parsed intent.';

alter table whatsapp_messages
  add column if not exists outcome text,
  add column if not exists external_id text;

comment on column whatsapp_messages.outcome is
  'What the assistant did in response — drives the owner''s activity log.';
comment on column whatsapp_messages.external_id is
  'Meta''s own message id, for tracing a booking back to a delivery.';

alter table whatsapp_messages
  add constraint whatsapp_messages_outcome_known check (
    outcome is null or outcome in (
      'booking_created', 'booking_cancelled', 'booking_moved',
      'availability_checked', 'schedule_sent', 'time_blocked',
      'customer_found', 'clarification', 'refused', 'help'
    )
  );

-- The activity log reads newest-first per organisation, and analytics
-- counts outcomes; both are served by this.
create index if not exists whatsapp_messages_outcome_idx
  on whatsapp_messages (organization_id, outcome, created_at desc);

-- "Which bookings came from WhatsApp?" is asked often enough to index.
create index if not exists bookings_source_idx
  on bookings (organization_id, source);

-- ───────────────────────────────────────────────────────────────
-- 0006_whatsapp_verification.sql
-- ───────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────
-- 0007_whatsapp_verification_guard.sql
-- ───────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────
-- 0008_organization_owner_can_read_own.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════
-- An owner can see the organisation they just created
--
-- `organizations_select_member` allowed a read to members and to PL·CE,
-- and to nobody else — including the person whose name is in
-- `owner_user_id`. Membership is the only way in, and membership does
-- not exist yet at the moment an organisation is created.
--
-- That made the first step of listing a studio impossible:
--
--   1. insert into organizations … returning *
--        The insert succeeds. PostgREST filters RETURNING through the
--        select policy, which matches nothing, so the caller gets no row
--        back for an organisation that now exists.
--
--   2. insert into organization_members …
--        `organization_members_bootstrap` exists precisely to allow this
--        first membership, and checks it by reading the organisation:
--
--            exists (select 1 from organizations
--                    where id = organization_id
--                      and owner_user_id = auth.uid())
--
--        That subquery is evaluated under RLS as the caller. The caller
--        cannot see the organisation. The check fails, Postgres raises
--        42501, and the wizard reports "You do not have permission to do
--        that" to somebody doing the one thing the policy was written to
--        permit.
--
-- This is the recursion the schema already guards against elsewhere —
-- it is why `is_org_member` is SECURITY DEFINER — reintroduced by a raw
-- subquery inside a policy.
--
-- The fix is the clause that was missing rather than a new mechanism:
-- an organisation is readable by the person who owns it. That is plainly
-- intended, widens nothing beyond the owner's own row, and lets both
-- steps above succeed. Once the membership row lands, `is_org_member`
-- carries everything afterwards as before.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists organizations_select_member on organizations;

create policy organizations_select_member on organizations
  for select to authenticated
  using (
    is_org_member(id)
    -- The bootstrap case: created, not yet joined.
    or owner_user_id = (select auth.uid())
    or is_platform_admin()
  );

-- ───────────────────────────────────────────────────────────────
-- 0009_studio_images_storage.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════
-- Storage for listing photographs
--
-- `studio-images` was documented as a manual dashboard step and never
-- created by a migration, so whether it existed — and what it allowed —
-- depended on someone remembering a comment in setup.sql. A bucket
-- created through the dashboard arrives with row level security on and
-- no policies at all, which reads as "public bucket, uploads denied":
-- anyone can fetch an object, nobody can write one.
--
-- That is what the wizard hit. `storage.from(...).upload(...)` runs as
-- the signed-in user, not the service role, so it is `authenticated`
-- that needs permission, and `authenticated` had none.
--
-- Objects are written as `<studio-slug>/<uuid>.<ext>`, so the first path
-- segment names the studio and the policies below can ask the obvious
-- question: does the caller belong to the organisation that owns it?
-- `is_org_member` is SECURITY DEFINER, so the lookup does not recurse
-- through the studios policy the way a raw subquery would — the same
-- trap migration 0008 had to dig the wizard out of.
--
-- Reads stay open because a marketplace listing is public by
-- definition; the photographs are the product. Writes are scoped to the
-- studio's own folder, so an owner can add and remove their own
-- photographs and nobody else's.
-- ═══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('studio-images', 'studio-images', true)
on conflict (id) do update set public = true;

/*
  Resolves the studio a storage object belongs to, from the folder it
  sits in. Returns false for a path that names no studio, so a stray
  object at the bucket root is never writable.
*/
create or replace function owns_studio_folder(object_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from studios
    where slug = split_part(object_name, '/', 1)
      and is_org_member(organization_id)
  );
$$;

comment on function owns_studio_folder(text) is
  'True when the caller belongs to the organisation owning the studio named by the first segment of a storage object path.';

drop policy if exists studio_images_public_read on storage.objects;
drop policy if exists studio_images_owner_insert on storage.objects;
drop policy if exists studio_images_owner_delete on storage.objects;

-- A listing's photographs are the public face of it.
create policy studio_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'studio-images');

create policy studio_images_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studio-images'
    and owns_studio_folder(name)
  );

-- Removing a photograph should take the object with it, not just the row.
create policy studio_images_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'studio-images'
    and owns_studio_folder(name)
  );
