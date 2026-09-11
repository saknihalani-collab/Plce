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
