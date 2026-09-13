# PL·CE

**Discover a space. Book a space. Run a space.**

A marketplace for creative studios and the operating system those studios
run on — one application, one database, three role-shaped surfaces.

- **PL·CE Discovery** — customers find and book studios
- **PL·CE Studio** — owners run bookings, calendar, customers, availability
- **PL·CE Admin** — the platform owner reviews, approves and curates the marketplace

The architecture, schema, route map and approval workflow are documented
in **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Running it

```bash
npm install
npm run dev
```

Open <http://localhost:3100> (or 3000 if you drop the `--port` flag).

**No configuration is needed.** With no credentials present, PL·CE boots
against a seeded in-memory database and every flow works for real:
applications are reviewed and approved, bookings are written and checked
for overlap, images are uploaded to disk, and the WhatsApp assistant
parses and books. Nothing is stubbed except the identity provider and the
outbound Meta API call.

### Signing in

The sign-in page lists four seeded identities. Each one lands you
somewhere different, which is the point — the product only makes sense
when you have seen all three sides of it.

| Who | Sees |
|---|---|
| **Priya Nair** — `priya@findplce.com` | PL·CE Admin, with applications waiting in the queue |
| **Kabir Shah** — `kabir@studio404.in` | A live studio with a month of bookings behind it |
| **Zoya Khan** — `zoya@terracesessions.in` | An owner who has had changes requested |
| **Rahul Menon** — `rahul@example.com` | A customer with bookings |

Any password of six characters or more works in demo mode.

### The loop worth walking

1. Sign in as **Priya**, open `/admin`, and approve an application.
2. Sign out, go to `/discover` — that studio is now on the marketplace.
3. Book it. Note the reference, e.g. `PLCE-8F42K`.
4. Sign in as **Kabir**, open `/studio` — bookings from every source land
   in the same calendar.
5. Open `/studio/whatsapp` and type *"Booking for 5 to 7 for Shivam"*. It asks
   which space, then which day, then books it — and never guesses either. Check
   `/studio/calendar` and `/studio/analytics` afterwards: the booking is there,
   its source is WhatsApp, and the activity log says what each message did.

Two boundaries worth poking at while you are in there:

- **Admin is private.** Nothing in the public UI links to `/admin`. Sign in as
  Kabir (a studio owner) and type the URL: you get a 404, not a redirect —
  because a redirect would confirm the page exists.
- **CRM access is not gated on approval.** Sign in as **Zoya**, whose listing is
  still awaiting changes. She gets her full calendar, customers and WhatsApp,
  with a banner saying the listing is not on Discovery. Approval controls
  publication, not whether someone may run their own studio.

---

## Going live

Everything below is a configuration change. No feature code moves.

### Database — Supabase

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Run the migrations in order:

```
supabase/migrations/0001_schema.sql     tables, enums, the overlap constraint
supabase/migrations/0002_rls.sql        row-level security and the approval guard
supabase/migrations/0003_views.sql      aggregate views for discovery and the CRM
supabase/migrations/0004_taxonomy.sql   starting categories and amenities
supabase/migrations/0005_whatsapp_provenance.sql   booking-event and message provenance
supabase/migrations/0006_whatsapp_verification.sql WhatsApp number verification, message idempotency
supabase/migrations/0007_whatsapp_verification_guard.sql  no client key may write verified_at
supabase/migrations/0008_organization_owner_can_read_own.sql  owner can read the org they just created
```

The moment credentials are present, `lib/data/index.ts` swaps the
in-memory repository for the Postgres one. A **production deployment
refuses to serve without credentials** unless `ALLOW_DEMO_MODE=true` — a
mistyped environment variable should fail loudly, not quietly serve a
fake marketplace that resets on every cold start.

### Deploying

**As it stands, this repository deploys as a demo.** `.env.production`
commits `ALLOW_DEMO_MODE=true`, so a host needs no configuration at all
and the site comes up against the seeded in-memory marketplace.

That data lives in the server's memory. Three consequences worth knowing
before handing the link to somebody:

- It resets on every cold start, so anything created disappears without
  warning after a quiet spell.
- Each serverless instance keeps its own copy, so under concurrent use
  two visitors can disagree about what exists.
- Uploaded images live in memory too, served by `/api/demo-media/[id]`,
  and are subject to both of the above.

The seed is deterministic, so the marketplace itself always looks the
same — it is a visitor's *own changes* that are fragile. Good for a link
someone clicks to look around; for a demo where the other person will
create things and expect them to still be there, use a real database.

**Sharing a demo link.** Nothing else is needed in the code — but check
the host is not gating it. On Vercel that is Settings → Deployment
Protection; anything other than *Disabled* puts a sign-in wall in front
of visitors, and preview deployments are protected by default on some
plans. Share the production URL, not a preview one.

**To go live** — about three minutes, and worth it before showing anyone
who will click around:

1. Create a Supabase project (the free tier is enough). **Note which
   region you pick** — step 4 has to agree with it.
2. SQL Editor → paste `supabase/setup.sql` → Run. That is every
   migration in order, in one file, including the `studio-images`
   storage bucket and the policies that let an owner upload to it.
3. Set on the host, then delete `.env.production`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Point the functions at the database's region. `vercel.json` pins
   `syd1`, which matches a Supabase project in `ap-southeast-2`. If your
   project lives elsewhere, change it.
5. Redeploy.

`NEXT_PUBLIC_*` variables are inlined at build time, so they have to
exist *before* the build — a host that already built without them needs
a redeploy, not a restart. The same is true of every other variable
here: Vercel injects them at deploy time, so adding one to a running
project changes nothing until the next deployment.

**On the region.** The app makes several sequential queries per request,
so function-to-database latency is multiplied, not paid once. Functions
in `iad1` against a database in `ap-southeast-2` put roughly 200ms of
Pacific between every one of them, which is enough to intermittently
exceed the timeout — and it fails as unrelated-looking symptoms across
signup, uploads and the WhatsApp webhook rather than as anything that
names latency. Keep the two together.

**On `SUPABASE_SERVICE_ROLE_KEY`.** Exactly one caller needs it: the
WhatsApp webhook, which has no browser session to derive authority from.
Everything else uses the anon key and goes through RLS. That makes its
absence invisible — the site works, signup works, listings work, and
only inbound WhatsApp fails, silently, because the repository throws
before any handler runs.

Three failure modes, all deliberate:

| Configuration | Result |
|---|---|
| Both Supabase variables | Live. Postgres, RLS, the lot. |
| Neither, `ALLOW_DEMO_MODE=true` | Demo marketplace. The current default. |
| Neither, no flag | Every request 500s; the log says which variables to set. |
| **Exactly one of the two** | **Always 500s, flag or no flag.** |

That last row is the one that matters once a demo flag is committed: one
variable set and the other missing is what a misspelled variable *name*
looks like, and `ALLOW_DEMO_MODE` is not allowed to excuse it. The error
names which half is missing.

The build itself needs nothing — `NEXT_PHASE` tells the guard it is
compiling, which is why CI and the host's build step both pass without
credentials and only a running server objects.

Create a public storage bucket named `studio-images` for listing
photography. Without Supabase, uploads are written to `public/uploads`.

### WhatsApp — Meta Cloud API

Set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`, then point the webhook
at:

```
https://your-domain/api/whatsapp/webhook
```

The endpoint refuses every request without a valid
`X-Hub-Signature-256`. Until it is configured, `/studio/whatsapp` runs
the same handler from the browser so the behaviour can be seen and
judged before a number is committed to Meta review.

### AI

Set `ANTHROPIC_API_KEY` to use Claude for intent extraction. Without it a
deterministic parser handles the documented phrasings and asks a
clarifying question whenever it is not certain — it degrades to
*asking*, never to guessing.

The model never writes to the database. It returns a structured intent
which is Zod-parsed, resolved against the studio's own spaces and
timezone, and executed by the same booking engine the website uses.

### Payments

`PAYMENTS_PROVIDER=razorpay` plus keys enables online payment. Without
them bookings are recorded as unpaid and settled at the studio, which is
how most Mumbai studios already work — the marketplace does not display a
payment it did not take.

---

## Shape of the code

```
src/
  app/          routes — thin: fetch, authorise, render
  features/     <domain>/components and actions.ts
  lib/
    auth/       gateway, session, permissions
    booking/    availability (pure) + engine (the only writer of bookings)
    data/       one repository interface, two implementations
    listing/    the approval state machine and the visibility rule
    ai/         provider-agnostic intent extraction
    whatsapp/   signature verification, conversation state, replies
    storage/ payments/ maps/   provider seams
  types/        domain.ts — the shared vocabulary
supabase/migrations/
```

Three rules hold it together:

1. **One source of truth.** Discovery, the CRM, Admin and WhatsApp are
   four interfaces onto one set of tables.
2. **One booking engine.** `createBooking()` is the only code that writes
   a booking, so double-booking is prevented once rather than four times
   — backed by a Postgres exclusion constraint for the concurrent case.
3. **One visibility predicate.** `status = 'approved' AND is_published
   AND NOT is_suspended`, stated in TypeScript, in both repositories, and
   as an RLS policy. An unapproved studio is not hidden from `/discover`;
   it is unreadable to an anonymous client.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Not built

Per the brief: no accounting, payroll, inventory, POS, loyalty, social
feed, bidding, subscriptions, marketing automation, multi-country tax, or
autonomous agents. Search-to-booking conversion and studio utilisation
need event tracking this build does not collect, so `/admin/analytics`
omits them rather than estimating them.
