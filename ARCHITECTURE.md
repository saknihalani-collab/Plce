# PL·CE — Architecture

> Discover a space. Book a space. Run a space.

This document is the answer to the nine questions asked before implementation.
It is written to be read in order; each section assumes the one above it.

---

## 1. Repository audit

**There was no PL·CE repository.** The working directory
`N:\Claude Artifacts\Projects` contained two unrelated projects:

| Project | What it is | Relevance |
|---|---|---|
| `shon-portfolio` | Next.js portfolio site | None. Untouched. |
| `SpotJob` | Next.js 15 + React 19 + Tailwind v4 + Supabase marketplace ("local marketplace for short-term work") | **High** — same author's house stack and house architecture. |

`SpotJob` was read, not copied. What it establishes, and what PL·CE therefore
adopts rather than reinventing:

- **Stack**: Next.js 15 App Router, React 19, TypeScript (strict, with
  `noUncheckedIndexedAccess`), Tailwind v4 via `@tailwindcss/postcss`,
  Supabase (`@supabase/ssr`), Zod, `date-fns`, `lucide-react`, `sonner`.
- **Layout**: `src/app` (routes) · `src/features/<domain>` (feature code) ·
  `src/lib` (seams and infrastructure) · `src/types` (domain vocabulary).
- **The data seam**: one `DataRepository` interface, two implementations
  (Supabase and in-memory), chosen once in a composition root
  (`lib/data/index.ts`). Feature code never imports Supabase.
- **Demo mode**: with no credentials the app boots against a seeded in-memory
  database so it can be run and reviewed with `npm run dev` alone — and a
  *production* build refuses to start in that mode unless explicitly allowed,
  so a mistyped env var fails loudly instead of silently serving a fake
  marketplace.
- **Server actions** return a uniform `ActionResult<T>` rather than throwing,
  because a thrown error in a Server Action reaches the browser as an opaque
  digest.
- **Migrations** are hand-written SQL in `supabase/migrations`, with RLS
  treated as the real authorisation boundary and application checks existing
  to produce good error messages.
- **Design tokens** are hand-authored CSS variables surfaced to Tailwind via
  `@theme inline` — not a dumped shadcn default theme.

PL·CE follows all of the above. Nothing is shared at runtime; the two projects
stay independent.

### Visual identity

The brand audit of findplce.com gave the first build its palette: a dark ink
navy ground, warm cream type, terracotta, sage, Playfair Display and Inter.
That reading was accurate but the conclusion — dark operational surfaces,
light marketplace surfaces — was wrong for this product. It split PL·CE into
two products that happened to share a database.

The identity is now one material world, used at two temperaments.

**Materials.** The palette is taken from interior surfaces rather than from
software, because the product is about physical places.

| Token | Value | Role |
|---|---|---|
| `paper` | `#F6F3EC` | the ground, everywhere. Never pure white |
| `surface` | `#FDFBF6` | raised paper — inputs, the few real cards |
| `stone` / `stone-deep` | `#EBE5D9` / `#DED6C6` | recessed panels, the CRM rail |
| `ink` | `#1B1916` | type, and the primary button |
| `ink-muted` / `ink-soft` | `#5C574E` / `#8A8377` | secondary and tertiary type |
| `line-soft` / `line` / `line-strong` | `#E6DFD2` / `#D9D1C1` / `#C2B8A4` | hairlines, which carry the structure |
| `oak` | `#6F5540` | rare structural warmth |

**Signals.** Colour is only ever information. Each functional colour has one
meaning across all three surfaces:

| Token | Means |
|---|---|
| `olive` `#6B7A4F` | confirmed, paid, available, settled |
| `clay` `#B8603A` | money owed, needs attention — and the single emphatic accent on Discovery |
| `butter` `#A8791F` | waiting on someone; not yet confirmed |
| `cobalt` `#2F4F8F` | selected, active, focused |
| `alert` `#A83B2B` | errors and destruction only — never "unpaid" |

Clay carries both "attention" in the CRM and warmth on Discovery. The two
never appear on the same screen, and keeping money-owed in clay rather than
red is deliberate: a Tuesday with three unpaid bookings should not look like
an outage. Red is kept for things that have actually gone wrong.

**Type.** The serif carries PL·CE; the sans gets out of its way.

Fraunces is the display face — a variable serif whose optical-size axis lets
one voice work at a 7rem page opener and at a 1.5rem studio name. Its softness
and wonk axes are pinned to zero in `globals.css`, which strips the
warmth-for-its-own-sake and leaves something architectural; that is the
difference between a design publication and a friendly startup. Four display
steps exist (`--display-xl` through `--display-sm`) and no more, each a
different kind of statement rather than an arbitrary step on a ramp.

Instrument Sans is the working voice: navigation, labels, forms, the calendar,
supporting copy. The `.lede` class deliberately holds supporting copy at 17px —
the drop from a 7rem serif to a small grotesk is the contrast the identity
rests on, and if the lede grows the statement above it stops being a statement.

Times, prices in tables and booking references are set in the system monospace,
because digits in a column have to line up before they have to look good.

**Inverted rooms.** `.on-ink` redefines what the material tokens resolve to
rather than introducing new ones — `paper` stays "the ground", `ink` stays "the
type on it", and every component inside keeps working without knowing where it
was dropped. `.on-image` is the same inversion with no ground painted, for type
over photography. Without it, brand marks set in the light palette quietly
vanish against a dark frame: the wordmark's clay dot is 4px across and
disappears entirely on a grey ceiling.

**The dot.** `PL·CE` is "place" with the A replaced by a middot. The dot
recurs as the smallest primitive in the system: a status marker, a location
pin, a separator in metadata.

**Two temperaments, one world.** Discovery is contemporary interiors crossed
with Japanese spatial minimalism — photography-led, generous, editorial,
cards avoided in favour of images captioned on the page itself. Studio and
Admin are Swiss information design in the same materials — a hairline rail, a
dense grid, figures in ruled columns rather than in tiles. Owners sit in the
CRM for hours, which is the argument for warm paper rather than a dark
console, not against it.

The serif is the seam between them. It carries the landing page almost alone,
appears in the CRM only as page titles and studio names, and never turns the
calendar into a magazine.

**The landing page is a sequence, not a stack.** It answers, in order: what is
this, why does it exist, what am I making, where do I find it, what is a place,
how do I book, what if the place is mine, what about the booking that arrived by
text, how does it all connect, who else uses it, which door is mine. Material
alternates as you descend — paper, image, stone, paper, stone, paper, walnut,
paper, stone, paper, walnut — so it reads as movement through rooms rather than
as a scroll through panels.

The hero is typography first and the world second: a centred statement, one
call to action, then a full-bleed field of real listings that cross-fade with a
counter and a caption. Discovery is an asymmetric spread at three different
proportions rather than a card grid, and the single bento on the page is the
one composed centrepiece — photograph, location, live availability and price,
which are the four things anyone actually weighs when choosing where to work.

**Location is a property of a studio, not of PL·CE.** The brand is not tied to
one city, so no city appears in the hero, the metadata or the footer colophon.
Where a place is belongs on the place, and that is where it is shown — in the
gallery caption, on the card, in the footer's data-driven city list.

**One studio, not a taxonomy of rooms.** The product language stays "studio"
throughout. Fragmenting it into sets, rooms and spaces made the copy sound
busier without making it clearer.

Everything on the page is real: studios, categories, areas and availability come
from the database, categories with nothing in them are filtered out rather than
linking to empty searches, and the pull quote is an actual five-star review or
the section does not render. The two illustrated moments — the calendar
showcase and the WhatsApp sequence — are labelled depictions built from the same
tokens and status language as the real product, and carry no customer data. A
public page has no business rendering somebody's bookings.

**Motion.** One gesture, used everywhere: a short rise and fade as content is
reached. The WhatsApp section is the single animated moment, and it plays once
and stops on the finished booking rather than looping — a panel replaying
forever in the corner of the eye is the restlessness this design is trying to
avoid. Both the reveal and the sequence read geometry directly as well as
through an IntersectionObserver, because an observer that never delivers its
first callback would otherwise leave whole sections invisible.

---

## 2. Architecture proposal

One Next.js application, three role-shaped surfaces, one core.

```
                 src/app                          src/lib
   +-----------------------------------+   +------------------------+
   |  /              landing           |   |                        |
   |  /discover      marketplace       |-->|  data/repository.ts    |
   |  /studios/[id]  public listing    |   |   (the only seam)      |
   |  /studios/[id]/book  checkout     |   |        |               |
   |  /account/...   my bookings       |   |        +-- demo/       |
   +-----------------------------------+   |        +-- supabase/   |
   |  /list-your-studio  application   |   |                        |
   |  /studio/...    owner CRM         |-->|  booking/engine.ts     |
   +-----------------------------------+   |  booking/availability  |
   |  /admin/...     marketplace ops   |   |  listing/visibility    |
   +-----------------------------------+   |  auth/permissions      |
   |  /api/whatsapp/webhook            |-->|  ai/   whatsapp/       |
   +-----------------------------------+   +------------------------+
```

Three rules hold the whole thing together:

1. **One source of truth.** Discovery, the owner CRM, the admin panel and
   WhatsApp are four *interfaces* onto one set of tables. There is no
   marketplace database and separate CRM database.
2. **One booking engine.** No surface writes a `booking` row directly. All four
   call `createBooking()`, which is the only code that checks availability and
   the only code that inserts. Double-booking is prevented once, not four times.
3. **One visibility predicate.** `isPubliclyVisible(studio)` exists in exactly
   one place in TypeScript, *and* as a `where` clause in both repository
   implementations, *and* as an RLS policy in Postgres. An anonymous client
   physically cannot select a studio that is not approved-and-published.

**Directory layout**

```
src/
  app/          routes only — thin; they fetch, authorise, and render
  features/     <domain>/components, <domain>/actions.ts (server actions)
  lib/
    auth/       gateway (Supabase | demo), session, permissions
    data/       repository interface + two implementations
    booking/    availability + engine + booking rules
    listing/    application state machine + visibility rule
    ai/         provider-agnostic intent extraction
    whatsapp/   webhook verification, conversation state, reply rendering
    storage/    image upload abstraction
    payments/   Razorpay/Stripe abstraction (interface + demo provider)
    maps/       Mapbox/Google abstraction
  types/        domain.ts — the shared vocabulary
supabase/migrations/   hand-written SQL: schema, RLS, functions
```

### One deliberate deviation from the brief

The brief asks for the public studio page at `/studio/:studioId` *and* the
owner CRM at `/studio`. Those collide — `/studio/abc` cannot be both a public
listing and a CRM sub-route. Resolution:

- **`/studios/[id]`** — public listing (plural, matches `/discover`)
- **`/studio`** — the owner's operating system (singular: *your* studio)

`/studio/[id]` for a plausible studio id redirects to `/studios/[id]`, so any
link already in the wild keeps working.

---

## 3. Role and permission model

Roles are not a single column on `users`. Two different things are being
modelled, and conflating them causes the classic marketplace bug where an
admin can no longer be a customer.

```
users.platform_role        'customer' | 'admin'            <- who you are to PL·CE
organization_members.role  'owner' | 'manager' | 'staff'   <- what you are inside one studio business
```

Everyone is a customer. Being a studio owner means holding an
`organization_members` row. Being PL·CE staff means `platform_role = 'admin'`.
The two axes are orthogonal, so the platform owner can book a studio like
anyone else, and a studio owner can book someone else's studio.

**Permissions are derived, never stored as booleans on a session.**

```ts
type Permission =
  | 'studio.view'   | 'studio.edit'    | 'studio.submit'
  | 'booking.view'  | 'booking.create' | 'booking.edit' | 'booking.cancel'
  | 'customer.view' | 'customer.edit'
  | 'availability.edit'
  | 'billing.view'
  | 'org.manage_members'
  | 'whatsapp.manage'
  | 'admin.review' | 'admin.publish' | 'admin.users' | 'admin.taxonomy'
```

| | owner | manager | staff | admin | customer |
|---|---|---|---|---|---|
| view calendar | yes | yes | yes | yes | — |
| create / edit booking | yes | yes | yes | yes | own only |
| manage customers | yes | yes | yes | yes | — |
| edit availability | yes | yes | — | — | — |
| edit listing | yes | yes | — | yes | — |
| billing / revenue | yes | — | — | yes | — |
| manage members | yes | — | — | — | — |
| approve a listing | **no** | no | no | yes | no |

The one row that matters: **an owner cannot approve their own listing.** That
is not a UI omission. `approveApplication()` asserts
`actor.platformRole === 'admin'`, and the RLS policy on `studios` permits the
approving transition only for admins.

**Enforcement happens three times, on purpose:**

1. *Route* — layouts redirect, so nobody sees a shell they cannot use.
2. *Action* — every server action opens with a permission assertion against the
   session read server-side. **This is the real check.**
3. *Database* — RLS policies scope every private table by organisation, so even
   a leaked anon key cannot read another studio's customers.

Layer 1 is convenience. Layers 2 and 3 are security. Removing layer 1 would
change nothing about what is possible.

### PL·CE Admin is private, not merely unlinked

`/admin` appears in no public surface — not the header, the footer, the landing
page, the sitemap, or `robots.txt`. But hiding a link is not access control, so
the route is guarded server-side in `app/admin/layout.tsx`, and the two failure
modes are answered differently on purpose:

| Who | What happens | Why |
|---|---|---|
| Anonymous | Redirect to `/login?next=/admin` | They typed the URL; asking them to sign in reveals nothing they did not already know |
| Signed-in customer or studio owner | **404** | A redirect to `/` is an answer — it says "this exists and you may not have it". A 404 says nothing at all |

A studio owner cannot reach `/admin`, and neither can a customer. The only way
in is an authenticated account with `platform_role = 'admin'`.

*Known residual:* Next resolves a route segment's metadata alongside rendering,
so a signed-in non-admin who types `/admin` sees the 404 page with the admin
segment's `<title>`. The page content leaks nothing; the tab title is a small
tell. Closing it properly means moving the role check into middleware, which
costs a database read on every admin request — noted rather than done.

---

## 4. Database schema

Every private table carries `organization_id` and is scoped by it.

```
                    +-----------+
                    |   users   |  id = auth.users.id
                    | platform_ |  platform_role: customer | admin
                    |   role    |
                    +-----+-----+
                          |
              +-----------+------------+
              |                        |
     +--------v---------+      +-------v--------+
     | organization_    |      |   bookings     |  customer_user_id is nullable —
     |    members       |      |                |  WhatsApp / walk-in bookings
     | role: owner |    |      +-------+--------+  have no account
     |  manager | staff |              |
     +--------+---------+              |
              |                        |
     +--------v---------+              |
     |  organizations   |<-------------+--------------+
     |  (the tenant)    |              |              |
     +--------+---------+              |              |
              |                        |       +------v------+
     +--------v---------+              |       |  customers  |  per-org CRM record
     |     studios      |              |       +-------------+
     | status           |              |
     | is_published     |              |
     | is_suspended     |              |
     | category_id -----+--> categories|
     +--------+---------+              |
              |                        |
     +--------v---------+              |
     |      spaces      |<-------------+
     +--------+---------+
              |
   +----------+-----------+--------------+-----------------+
   |          |           |              |                 |
availability_ blocked_   space_        studio_          studio_
  rules       times     amenities      images          applications
                           |                                |
                      amenities                   studio_application_events
```

**Full table list**

| Table | Purpose | Tenant column |
|---|---|---|
| `users` | identity + `platform_role` | — |
| `organizations` | the studio business = the tenant | (is the tenant) |
| `organization_members` | membership + role | `organization_id` |
| `categories` | admin-managed taxonomy | — |
| `amenities` | admin-managed taxonomy | — |
| `studios` | listing + lifecycle state | `organization_id` |
| `studio_images` | cover + gallery, ordered | `organization_id` |
| `spaces` | bookable resources within a studio | `organization_id` |
| `space_amenities` | join | via space |
| `studio_applications` | the review record | `organization_id` |
| `studio_application_events` | immutable audit of the review | `organization_id` |
| `customers` | per-studio CRM contact | `organization_id` |
| `bookings` | the one booking table | `organization_id` |
| `booking_events` | immutable booking history | `organization_id` |
| `availability_rules` | weekly opening hours per space | `organization_id` |
| `blocked_times` | one-off closures / holds | `organization_id` |
| `payments` | payment attempts against a booking | `organization_id` |
| `reviews` | customer to studio, booking-gated | `organization_id` |
| `notifications` | in-app, per user | user-scoped |
| `whatsapp_accounts` | which number belongs to which org | `organization_id` |
| `whatsapp_messages` | inbound/outbound log + parsed intent | `organization_id` |
| `whatsapp_conversations` | pending clarification state | `organization_id` |
| `admin_actions` | who did what to the marketplace | platform-wide |

**The state columns that matter**

```sql
create type listing_status as enum (
  'draft','submitted','under_review','changes_requested',
  'approved','rejected','suspended','unpublished'
);

create table studios (
  ...
  status        listing_status not null default 'draft',
  is_published  boolean not null default false,
  is_suspended  boolean not null default false,
  published_at  timestamptz,
  ...
);
```

Three columns, not one, because they answer three different questions: *did
PL·CE approve this?* / *does the owner want it visible?* / *has PL·CE pulled
it?* An approved studio the owner has temporarily hidden is not the same thing
as a suspended one, and squashing them into a single enum loses the ability to
restore the right state.

**Booking overlap is prevented in the database, not only in code:**

```sql
create extension if not exists btree_gist;

alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    space_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending','confirmed'));
```

The engine checks availability and returns a clean, human error; this
constraint is what makes the check *true* under concurrency. Two people paying
for the same Saturday slot at the same instant is exactly the race an
application-level check loses.

---

## 5. Route map

**Public**

| Route | |
|---|---|
| `/` | landing — "Find your space. Run your space." |
| `/discover` | marketplace: search, filters, sort |
| `/studios/[id]` | public listing detail |
| `/studios/[id]/book` | booking flow (date, time, details, pay) |
| `/bookings/[ref]` | confirmation / lookup by `PLCE-XXXXX` |
| `/list-your-studio` | owner acquisition + application wizard |
| `/login`, `/signup` | auth |

**Customer** (signed in): `/account`, `/account/bookings`

**Studio owner** — `/studio/*`, gated on org membership

| Route | |
|---|---|
| `/studio` | dashboard: today's timeline, revenue, occupancy, attention |
| `/studio/schedule` | **the primary operational screen** — day (resource columns), week, month |
| `/studio/calendar` | redirects to `/studio/schedule`, carrying view and date |
| `/studio/bookings` | list, filter, create, edit, cancel |
| `/studio/customers`, `/studio/customers/[id]` | CRM |
| `/studio/spaces` | spaces, pricing, capacity |
| `/studio/availability` | weekly hours + blocked time |
| `/studio/analytics` | the studio's own numbers, including where bookings come from |
| `/studio/listing` | edit listing (routes changes through review) |
| `/studio/application` | application status, admin feedback, resubmit |
| `/studio/whatsapp` | connect number, message log |
| `/studio/settings` | organisation, members |

**Admin** — `/admin/*`, gated on `platform_role = 'admin'`

| Route | |
|---|---|
| `/admin` | overview + action queue |
| `/admin/applications`, `/admin/applications/[id]` | review queue, review page |
| `/admin/studios`, `/admin/studios/[id]` | live inventory, edit / suspend / unpublish |
| `/admin/bookings` | platform-wide bookings |
| `/admin/users` | users, roles |
| `/admin/categories`, `/admin/amenities` | taxonomy CRUD |
| `/admin/analytics` | marketplace metrics |
| `/admin/audit` | admin action log |
| `/admin/settings` | featured-studio curation and platform connections |
| `/admin/settings` | featured studios, marketplace settings |

**API**

| `GET /api/whatsapp/webhook` | Meta subscription handshake |
|---|---|
| `POST /api/whatsapp/webhook` | inbound messages (signature-verified) |

### The CRM is calendar-first

`/studio/schedule` is the screen an owner runs the studio from, and Day is
always the landing view — week and month are for planning, not operating.

Everything the screen is showing lives in the URL: `?view=day&date=…&space=…
&booking=…`. That makes a schedule shareable, refresh-safe, and back-button
correct, and it means the booking drawer is *server-rendered from the same
query the grid used* rather than fetched separately. The drawer cannot
disagree with the calendar behind it because there is only one read.

One status language, resolved in `features/studio/lib/booking-status.ts`:

| Tone | Means | Where it shows |
|---|---|---|
| sage | confirmed and paid — nothing to do | chip wash, dot, list row |
| terracotta | confirmed but money outstanding | chip wash, dot, list row |
| amber | not yet confirmed | chip wash, dot, list row |
| muted | cancelled or no-show — must not compete | chip wash, dot, list row |

Booking status and payment status are never merged into one badge: a booking
can be confirmed and unpaid, or pending and paid, and collapsing the pair is
how an owner ends up chasing the wrong person.

Empty hours on the grid are links that carry the date, space and time into
the booking form, so the fastest path to a booking is clicking the gap you
are already looking at.

---

---

## 6. Booking architecture

Four sources, one engine, one availability calculation.

```
  Discovery       Studio CRM        Admin          WhatsApp
  (customer)      (owner/staff)     (platform)     (owner, natural language)
      |                |                |               |
      |                |                |        parse -> structured intent
      |                |                |               |
      +----------------+--------+-------+---------------+
                                |
                    +-----------v------------+
                    |  BookingEngine         |
                    |                        |
                    |  1. authorise actor    |
                    |  2. normalise times    |  studio tz -> ISO instants
                    |  3. load rules         |  hours, min duration,
                    |                        |  notice, increments
                    |  4. compute availability
                    |  5. price it           |  space rate x hours
                    |  6. resolve customer   |  find-or-create in org CRM
                    |  7. insert + event     |  exclusion constraint is
                    |                        |  the final arbiter
                    |  8. notify             |
                    +-----------+------------+
                                |
                     bookings . booking_events
                                |
        +-----------------------+-----------------------+
    customer                owner calendar          WhatsApp reply
   confirmation             (same row)              (same row)
```

Availability is a pure function, which is what makes it trustworthy:

```ts
availabilityFor({ space, date, rules, blocked, bookings, now }): Slot[]
```

No I/O, no clock reads inside it. The caller supplies everything, so the same
function answers "what can this customer book?", "is this owner's WhatsApp
request possible?" and "should this calendar cell be grey?" — and cannot
disagree with itself between them.

`createBooking` is the *only* function in the codebase that inserts into
`bookings`. Grep enforces that as well as review does.

---

## 7. Studio approval workflow

```
 OWNER                          PL·CE ADMIN                    PUBLIC
   |
   +- signs up
   +- /list-your-studio ----------------------------+
   |   (autosaved DRAFT — never a throwaway form)   |
   |                                                |
   +- submit --> status: SUBMITTED ---------------->|  appears in
   |             event: application.submitted       |  /admin/applications
   |                                                |  and the dashboard queue
   |                                                |
   |                          admin opens it -------+
   |                          status: UNDER_REVIEW  |
   |                          event: review_started |
   |                                                |
   |            +------------ REQUEST CHANGES ------+
   |            |  status: CHANGES_REQUESTED        |
   |<-----------+  admin_feedback: "..."            |
   |  owner sees feedback on /studio/application    |
   |  edits, resubmits ----> SUBMITTED (loop)       |
   |                                                |
   |            +------------ REJECT ---------------+
   |<-----------+  status: REJECTED + reason        |
   |                                                |
   |            +------------ APPROVE --------------+
   |<-----------+  status: APPROVED                 |
   |               is_published: true               |
   |               published_at: now()              |
   |               event: application.approved      |
   |               admin_actions: approved_studio   |
   |                                                v
   |                                        VISIBLE ON /discover
   |                                        owner gains /studio CRM
   |
   |  later: admin may SUSPEND (is_suspended = true)
   |         or UNPUBLISH (is_published = false)
   |         — all data is retained in both cases
```

Transitions are a table, not scattered `if`s:

```ts
const ALLOWED: Record<ListingStatus, ListingStatus[]> = {
  draft:             ['submitted'],
  submitted:         ['under_review', 'changes_requested', 'approved', 'rejected'],
  under_review:      ['changes_requested', 'approved', 'rejected'],
  changes_requested: ['submitted'],
  approved:          ['under_review', 'suspended', 'unpublished'],
  rejected:          ['submitted'],
  suspended:         ['approved', 'unpublished'],
  unpublished:       ['approved', 'suspended'],
};
```

An illegal transition is a thrown `RepositoryError`, not a silent write.

### CRM access and marketplace publication are independent

Approval controls exactly one thing: whether a studio appears on `/discover`.
It does **not** gate the owner's own operating system.

```
listing status          →  is it on /discover?
organisation membership →  can they open /studio?
```

An owner whose listing is still in review already has a diary, customers who
call, and bookings to keep straight. Locking them out of their own calendar
until PL·CE gets round to reviewing them would be the product telling them
their business does not start until we say so. So `/studio` opens as soon as
there is a studio to manage, and every screen inside it carries a banner naming
the listing's actual state.

The two states are separate columns, separate guards, and separate code:
`requireStudioContext` (membership) versus `isPubliclyVisible` (publication).

**Public visibility is one predicate, enforced at the bottom:**

```sql
status = 'approved' and is_published and not is_suspended
```

It lives in `lib/listing/visibility.ts`, in every discovery query in both
repository implementations, and in the RLS policy that lets `anon` select from
`studios`. Frontend filtering is a rendering detail, not a guard — a draft
studio is not merely hidden from `/discover`, it is unreadable to an anonymous
client.

**Owner edits after approval** are classified, not waved through:

| Field | Effect |
|---|---|
| operating hours, blocked time, internal notes, space capacity | live immediately |
| studio name, description, category, location, cover image, public pricing | written to a pending-changes payload; sets `has_pending_changes` and queues an admin review. The live listing keeps showing approved values until an admin accepts. |

---

## 8. WhatsApp architecture

```
  Owner's phone
       |  "Book Main Studio tomorrow 3 to 6 for Rahul"
       v
  Meta Cloud API
       |  POST /api/whatsapp/webhook
       v
  +-------------------------------------------------------------+
  | 1. VERIFY   X-Hub-Signature-256 (HMAC-SHA256, app secret).  |
  |             Unsigned or mismatched -> 401, nothing runs.     |
  +-------------------------------------------------------------+
  | 2. IDENTIFY from-number -> whatsapp_accounts -> organisation.|
  |             Unknown number -> polite decline. Identity is    |
  |             never taken from the message body.               |
  +-------------------------------------------------------------+
  | 3. INTERPRET  message + conversation state + the org's real  |
  |             space names -> AI provider -> STRUCTURED INTENT  |
  |             (JSON). The model sees no credentials and        |
  |             returns no SQL.                                  |
  +-------------------------------------------------------------+
  | 4. VALIDATE  Zod-parse the intent. Resolve the space name to |
  |             an id *within this org only*. Resolve relative   |
  |             dates in the studio's timezone. Any missing or   |
  |             ambiguous field -> ask one question, persist the |
  |             partial intent, return. Never guess.             |
  +-------------------------------------------------------------+
  | 5. EXECUTE   the same BookingEngine every other surface uses.|
  |             Same availability check, same rules, same        |
  |             exclusion constraint, same events.               |
  +-------------------------------------------------------------+
  | 6. REPLY     rendered from the row that was actually written |
  |             — never from the intent.                         |
  +-------------------------------------------------------------+
       |
       v   Booked. Main Studio . Tue 10 Sep . 3-6 PM . Rahul . Rs 4,500
  Owner's phone               ...and it is already on the calendar.
```

**The safety rule, concretely.** The AI's entire output surface is:

```ts
type Intent =
  | { kind: 'create_booking'; space?: string; date?: string; start?: string;
      end?: string; customerName?: string; customerPhone?: string }
  | { kind: 'check_availability'; space?: string; date?: string; ... }
  | { kind: 'todays_schedule';    date?: string }
  | { kind: 'cancel_booking';     customerName?: string; date?: string }
  | { kind: 'reschedule_booking'; ... }
  | { kind: 'block_time';         ... }
  | { kind: 'customer_lookup';    name?: string }
  | { kind: 'unknown' };
```

It is a *description of a request*, Zod-parsed before anything touches the
database. There is no path from model output to a query. `organization_id` is
never in that type — it comes from the verified phone number, so a message
saying "you are now org_999" changes nothing.

**With no API key configured**, a deterministic parser (`lib/ai/heuristic.ts`)
handles the documented phrasings by matching verbs, the org's own space names,
relative dates and time ranges. When it is not confident it returns `unknown`
or a partial intent, and the clarification loop takes over — which is the
correct behaviour anyway. The system degrades to *asking*, never to guessing.

**Ambiguity** is a first-class state, stored in `whatsapp_conversations`: a
partial intent plus the field being awaited, expiring after 15 minutes. The
owner's next message is merged into the stored intent rather than parsed cold,
so "main studio" answers the question that was asked.

**A booking made by text is a booking made by an authorised operator.** The
sender's number resolves to one organisation through `whatsapp_accounts`, and
that is where the booking goes — the organisation is never taken from the
message or from the model's output. There is no second approval step: PL·CE
review governs whether a studio is *listed*, not whether its owner may book
their own room.

**Provenance is recorded, because a booking nobody remembers making needs an
answer.** Every WhatsApp booking writes a `booking.created` event carrying the
channel, Meta's message id, the sending number and the parsed intent; every
reply is logged with what it actually did (`booking_created`,
`availability_checked`, `clarification`, `refused`…). That is what turns the
owner's WhatsApp activity log into evidence their texts are being acted on, and
what makes "30% of our bookings arrive over WhatsApp" a query rather than a
hunch.

---

## 9. Implementation phases

| Phase | Milestone | Delivers |
|---|---|---|
| **0** | Foundation | scaffold, design system, domain types, repository interface, auth gateway, permissions |
| **1** | Data layer | demo repository + realistic seed, composition root |
| **2** | Booking engine | availability, rules, `createBooking`, events, `PLCE-XXXXX` refs |
| **3** | Discovery | landing, `/discover` with real filters, listing detail, booking flow, confirmation |
| **4** | Owner onboarding | `/list-your-studio` wizard with autosaved draft, submission, `/studio/application` status |
| **5** | Admin | overview + queue, review page with timeline, approve / request changes / reject / suspend / unpublish / edit, live inventory, users, taxonomy CRUD, audit log |
| **6** | Studio CRM | dashboard, resource calendar, manual booking, customers, spaces, availability, listing edit with change classification |
| **7** | WhatsApp | webhook + signature verification, intent extraction, clarification loop, engine execution, replies |
| **8** | Persistence | SQL migrations: schema, RLS, exclusion constraint, functions |
| **9** | Polish | notifications, reviews, analytics, empty / loading / error states |

Phase 5 lands before Phase 6 deliberately: the approval loop is what makes the
marketplace real, and a CRM for a studio nobody approved is a demo.

---

## Non-goals for this build

Per the brief: no accounting, payroll, inventory, POS, loyalty, social feed,
bidding, subscriptions, marketing automation, multi-country tax, or autonomous
AI agents. Payments are an abstraction with a demo provider — the seam is real,
the charge is not.
