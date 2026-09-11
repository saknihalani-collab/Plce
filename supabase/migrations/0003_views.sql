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
