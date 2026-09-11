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
