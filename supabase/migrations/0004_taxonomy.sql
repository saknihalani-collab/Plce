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
