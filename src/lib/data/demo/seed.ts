import type { DemoDatabase } from '@/lib/data/demo/store';
import { newBookingReference } from '@/lib/ids';
import { addDaysToDateString, todayInZone, zonedToInstant } from '@/lib/time';
import type {
  AmenityGroup,
  AvailabilityRule,
  Booking,
  BookingSource,
  BookingStatus,
  Customer,
  ListingStatus,
  PaymentStatus,
  Space,
  Studio,
  StudioApplication,
  StudioApplicationEvent,
  Weekday,
  WhatsAppOutcome,
} from '@/types/domain';
import { DEFAULT_BOOKING_RULES } from '@/types/domain';

/**
 * The demo marketplace.
 *
 * Not decoration. This seed exists so that every state the product can be
 * in is reachable without first spending an hour typing: a queue with
 * real applications waiting, a studio that has had changes requested and
 * is showing the admin's actual words back to its owner, a suspended
 * listing, an unpublished one, and a working studio with a month of
 * bookings behind it and a fortnight ahead.
 *
 * Every row here goes through the same tables, the same visibility rule
 * and the same booking engine as a row created by a real person. Nothing
 * in the UI reads this file.
 */

const TZ = 'Asia/Kolkata';

/* ── Deterministic randomness ───────────────────────────────────── */

/** mulberry32 — so two runs of the demo tell the same story. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(20260909);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const chance = (probability: number) => random() < probability;
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

/* ── Time helpers, anchored to "now" ────────────────────────────── */

const NOW = new Date();
const TODAY = todayInZone(TZ, NOW);

/** Local wall-clock on a day relative to today, as a UTC instant. */
function at(dayOffset: number, time: string): string {
  return zonedToInstant(addDaysToDateString(TODAY, dayOffset), time, TZ).toISOString();
}

/** A timestamp `daysAgo` days back, for created_at columns. */
function ago(days: number, hours = 10): string {
  return at(-days, `${String(hours).padStart(2, '0')}:00`);
}

/* ── Taxonomy ───────────────────────────────────────────────────── */

const CATEGORY_SEED: Array<[slug: string, name: string, description: string]> = [
  ['photography', 'Photography', 'Daylight studios, cycloramas and product tables.'],
  ['video', 'Video', 'Film-ready spaces with grid, blackout and load-in.'],
  ['podcast', 'Podcast', 'Treated rooms built for two to six voices.'],
  ['music', 'Music', 'Live rooms, vocal booths and mix suites.'],
  ['dance', 'Dance', 'Sprung floors, mirrors and sound.'],
  ['rehearsal', 'Rehearsal', 'Black boxes and band rooms by the hour.'],
  ['event', 'Event', 'Launches, screenings, shoots with an audience.'],
  ['workspace', 'Creative workspace', 'Desks, ateliers and maker rooms.'],
  ['other', 'Other', 'Everything that does not fit a box yet.'],
];

const AMENITY_SEED: Array<[slug: string, name: string, group: AmenityGroup]> = [
  ['ac', 'Air conditioning', 'comfort'],
  ['wifi', 'Wi-Fi', 'comfort'],
  ['parking', 'Parking', 'comfort'],
  ['changing-room', 'Changing room', 'comfort'],
  ['makeup-area', 'Makeup area', 'comfort'],
  ['kitchen', 'Kitchen', 'comfort'],
  ['lounge', 'Lounge', 'comfort'],
  ['soundproofing', 'Soundproofing', 'technical'],
  ['equipment', 'Equipment on site', 'technical'],
  ['green-screen', 'Green screen', 'technical'],
  ['lighting-rig', 'Lighting rig', 'technical'],
  ['backdrops', 'Backdrop system', 'technical'],
  ['monitor', 'Client monitor', 'technical'],
  ['natural-light', 'Natural light', 'space'],
  ['cyclorama', 'Cyclorama', 'space'],
  ['high-ceiling', 'High ceiling', 'space'],
  ['blackout', 'Full blackout', 'space'],
  ['freight-lift', 'Freight lift', 'facilities'],
  ['storage', 'Storage', 'facilities'],
  ['restrooms', 'Restrooms', 'facilities'],
];

/* ── Photography ────────────────────────────────────────────────── */

/**
 * Cover and gallery photography, per studio.
 *
 * Each set was chosen by looking at the images, not by guessing from the
 * id: a marketplace where the photography does not match the listing
 * reads as fake immediately, and on an image-led product that is the
 * first thing anyone judges. The first entry is always the cover.
 */
/*
  Cover images lead their set — `isCover` is `index === 0`, and the cover
  is what the marketplace, the landing page, the hero rotation and the
  sign-in screen all show. So the first image in each set has to read as
  a *room*: the space itself, with light and depth in it.

  Everything else earns its place further down the gallery. A camera body
  on black, a projector beam, a dancer mid-leap — good photographs, all
  useless as covers, because none of them tell you anything about whether
  you could work there. A hero that cross-fades from an architectural
  interior to a portrait of a person stops being about places.

  A few sets share a photograph. These are stand-in stock images in demo
  data, and only the published studios surface publicly — where, after
  this ordering, every cover is a different room.
*/
const IMAGE_SETS: Record<string, string[]> = {
  // Daylight photography floor: bright volume first, then the kit.
  studio404: [
    'photo-1497366216548-37526070297c',
    'photo-1516035069371-29a1b244cc32',
    'photo-1504198458649-3128b932f49e',
  ],
  // Film hall: the dressed set first, then the equipment that fills it.
  cyc: [
    'photo-1524758631624-e2822e304c36',
    'photo-1478720568477-152d9b164e26',
    'photo-1485846234645-a62644f84728',
    'photo-1500462918059-b1a0cb512f1d',
  ],
  sound: [
    'photo-1598488035139-bdbb2231ce04',
    'photo-1514320291840-2e0a9bf2a9ae',
    'photo-1471478331149-c72f17e33c73',
    'photo-1508700115892-45ecd05ae2ad',
  ],
  // Sprung floor: the empty room and its light, then the work in it.
  dance: [
    'photo-1519710164239-da123dc03ef4',
    'photo-1547153760-18fc86324498',
    'photo-1518611012118-696072aa579a',
    'photo-1493225457124-a3eb161ffa5f',
  ],
  // Dressed apartment set.
  film: ['photo-1524758631624-e2822e304c36', 'photo-1485846234645-a62644f84728'],
  blackbox: ['photo-1503095396549-807759245b35', 'photo-1500462918059-b1a0cb512f1d'],
  terrace: ['photo-1533174072545-7a4b6ad7a6c3', 'photo-1414235077428-338989a2e8c0'],
  jazz: ['photo-1511192336575-5a79af67a629', 'photo-1493225457124-a3eb161ffa5f'],
  // Product photography loft: the room, then the tabletop set-up.
  loft: ['photo-1497366754035-f200968a6e72', 'photo-1493934558415-9d19f0b2b4d2'],
  atelier: ['photo-1519710164239-da123dc03ef4', 'photo-1521737604893-d14cc237f11d'],
};

function imageUrl(id: string): string {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=70`;
}

/* ── People ─────────────────────────────────────────────────────── */

interface PersonSeed {
  key: string;
  fullName: string;
  email: string;
  phone: string;
  platformRole?: 'customer' | 'admin';
}

const PEOPLE: PersonSeed[] = [
  { key: 'admin', fullName: 'Priya Nair', email: 'priya@findplce.com', phone: '+919820100100', platformRole: 'admin' },
  { key: 'kabir', fullName: 'Kabir Shah', email: 'kabir@studio404.in', phone: '+919820100201' },
  { key: 'devika', fullName: 'Devika Rao', email: 'devika@thecyc.in', phone: '+919820100202' },
  { key: 'meher', fullName: 'Meher Irani', email: 'meher@soundroom.in', phone: '+919820100203' },
  { key: 'tanvi', fullName: 'Tanvi Desai', email: 'tanvi@loopdance.in', phone: '+919820100204' },
  { key: 'arjun', fullName: 'Arjun Menon', email: 'arjun@frameandfield.in', phone: '+919820100205' },
  { key: 'rohan', fullName: 'Rohan Pillai', email: 'rohan@blackbox.in', phone: '+919820100206' },
  { key: 'zoya', fullName: 'Zoya Khan', email: 'zoya@terracesessions.in', phone: '+919820100207' },
  { key: 'imran', fullName: 'Imran Sheikh', email: 'imran@halfnote.in', phone: '+919820100208' },
  { key: 'nisha', fullName: 'Nisha Kamath', email: 'nisha@pixelloft.in', phone: '+919820100209' },
  { key: 'farid', fullName: 'Farid Contractor', email: 'farid@ateliernine.in', phone: '+919820100210' },
  { key: 'rahul', fullName: 'Rahul Menon', email: 'rahul@example.com', phone: '+919820100301' },
  { key: 'ananya', fullName: 'Ananya Gupta', email: 'ananya@example.com', phone: '+919820100302' },
  { key: 'ishaan', fullName: 'Ishaan Verma', email: 'ishaan@example.com', phone: '+919820100303' },
  { key: 'sara', fullName: 'Sara Fernandes', email: 'sara@example.com', phone: '+919820100304' },
  { key: 'nikhil', fullName: 'Nikhil Joshi', email: 'nikhil@example.com', phone: '+919820100305' },
];

/** Walk-in and WhatsApp names — people with no PL·CE account. */
const OFF_PLATFORM_NAMES = [
  'Aditya Rane',
  'Kritika Bose',
  'Vivek Nambiar',
  'Fatima Ali',
  'Joel D’Souza',
  'Sneha Kulkarni',
  'Yash Bhatia',
  'Maya Thomas',
];

/* ── Studio blueprints ──────────────────────────────────────────── */

interface SpaceSeed {
  name: string;
  description: string;
  capacity: number;
  sizeSqft: number;
  hourlyRate: number;
  halfDayRate?: number;
  fullDayRate?: number;
  minBookingMinutes?: number;
  bufferMinutes?: number;
  amenitySlugs: string[];
}

interface StudioSeed {
  key: string;
  ownerKey: string;
  orgName: string;
  name: string;
  tagline: string;
  description: string;
  categorySlug: string;
  city: string;
  area: string;
  addressLine: string;
  postalCode: string;
  lat: number;
  lng: number;
  instagram?: string;
  website?: string;
  images: string[];
  rules: string[];
  cancellationPolicy: string;
  equipment: string[];
  spaces: SpaceSeed[];
  status: ListingStatus;
  isPublished: boolean;
  isSuspended: boolean;
  isFeatured?: boolean;
  /** Days ago the application was created. */
  appliedDaysAgo: number;
  adminFeedback?: string;
  rejectionReason?: string;
  /** How busy the demo calendar should be. 0 = no bookings. */
  bookingDensity: number;
  closedWeekdays?: Weekday[];
  opensAt?: string;
  closesAt?: string;
}

const STUDIOS: StudioSeed[] = [
  {
    key: 'studio404',
    ownerKey: 'kabir',
    orgName: 'Studio 404 Collective',
    name: 'Studio 404',
    tagline: 'Daylight, cyc and a podcast room, five minutes from Bandra station.',
    description:
      'A working photography studio in a converted textile floor. Two big north-facing windows, a 20-foot cyclorama that takes a car if you fold the mirrors in, and a treated podcast room at the back for when the shoot turns into an interview. We keep the place quiet and the chai coming.',
    categorySlug: 'photography',
    city: 'Mumbai',
    area: 'Bandra West',
    addressLine: '3rd Floor, Sunder Mahal, Hill Road',
    postalCode: '400050',
    lat: 19.0544,
    lng: 72.8296,
    instagram: 'studio404.mumbai',
    website: 'https://studio404.in',
    images: IMAGE_SETS.studio404!,
    rules: [
      'No smoking anywhere on the floor.',
      'Shoes off on the cyc.',
      'Load-in and load-out are inside your booked hours.',
      'Music down after 9 PM — there are flats above us.',
    ],
    cancellationPolicy:
      'Free cancellation up to 48 hours before your slot. Inside 48 hours we hold 50%, and no-shows are charged in full.',
    equipment: [
      'Godox AD600 Pro x3',
      '120cm octabox, 60cm softbox, strip box',
      'C-stands and sandbags',
      'Manfrotto tripod + geared head',
      'Seamless paper: white, grey, black, terracotta',
      'Shure SM7B x2 and a Rodecaster Pro II',
    ],
    spaces: [
      {
        name: 'Main Studio',
        description: 'North light, 1400 sq ft, blackout curtains if you want to kill it.',
        capacity: 25,
        sizeSqft: 1400,
        hourlyRate: 1500,
        halfDayRate: 5400,
        fullDayRate: 9600,
        minBookingMinutes: 120,
        bufferMinutes: 30,
        amenitySlugs: ['ac', 'wifi', 'natural-light', 'high-ceiling', 'backdrops', 'lighting-rig', 'changing-room', 'makeup-area', 'equipment', 'restrooms'],
      },
      {
        name: 'Cyclorama',
        description: '20ft white cyc, three-wall coving, drive-in access via the freight lift.',
        capacity: 30,
        sizeSqft: 900,
        hourlyRate: 2000,
        halfDayRate: 7200,
        fullDayRate: 13000,
        minBookingMinutes: 120,
        bufferMinutes: 45,
        amenitySlugs: ['ac', 'wifi', 'cyclorama', 'high-ceiling', 'blackout', 'lighting-rig', 'freight-lift', 'equipment'],
      },
      {
        name: 'Podcast Room',
        description: 'Treated four-mic room with a Rodecaster and a client monitor.',
        capacity: 6,
        sizeSqft: 220,
        hourlyRate: 900,
        halfDayRate: 3200,
        minBookingMinutes: 60,
        bufferMinutes: 15,
        amenitySlugs: ['ac', 'wifi', 'soundproofing', 'equipment', 'monitor', 'lounge'],
      },
    ],
    status: 'approved',
    isPublished: true,
    isSuspended: false,
    isFeatured: true,
    appliedDaysAgo: 96,
    bookingDensity: 1,
    opensAt: '08:00',
    closesAt: '22:00',
  },
  {
    key: 'cyc',
    ownerKey: 'devika',
    orgName: 'The Cyc Studios',
    name: 'The Cyc',
    tagline: 'A mill-floor cyc hall built for cars, campaigns and crews of thirty.',
    description:
      'Twelve thousand cubic feet of white. The Cyc is a single hall in a Lower Parel mill compound with a drive-in ramp, a 6-metre grid and enough power to run a full lighting package without a genset. Prep room, client lounge and a kitchen that has fed a lot of crews.',
    categorySlug: 'video',
    city: 'Mumbai',
    area: 'Lower Parel',
    addressLine: 'Unit 4, Sun Mill Compound, Senapati Bapat Marg',
    postalCode: '400013',
    instagram: 'thecyc.mumbai',
    lat: 19.0056,
    lng: 72.8296,
    images: IMAGE_SETS.cyc!,
    rules: [
      'Crew list 24 hours ahead for building security.',
      'Ramp access must be booked with your slot.',
      'Strike to white — repaints are billed at cost.',
    ],
    cancellationPolicy:
      'Free up to 7 days out. Inside 7 days, 50%. Inside 48 hours, full. Weather holds are rescheduled once at no charge.',
    equipment: ['6m lighting grid', '3-phase power, 63A', 'Drive-in ramp', 'Genie lift', 'Client lounge with monitor'],
    spaces: [
      {
        name: 'Cyc Hall',
        description: '2500 sq ft, three-wall cyc, 6m to the grid, drive-in.',
        capacity: 40,
        sizeSqft: 2500,
        hourlyRate: 2800,
        halfDayRate: 10000,
        fullDayRate: 18000,
        minBookingMinutes: 240,
        bufferMinutes: 60,
        amenitySlugs: ['ac', 'wifi', 'cyclorama', 'high-ceiling', 'blackout', 'lighting-rig', 'freight-lift', 'parking', 'kitchen', 'restrooms'],
      },
      {
        name: 'Prep Room',
        description: 'Hair, makeup and wardrobe for eight, with its own entrance.',
        capacity: 10,
        sizeSqft: 400,
        hourlyRate: 700,
        minBookingMinutes: 120,
        bufferMinutes: 15,
        amenitySlugs: ['ac', 'wifi', 'makeup-area', 'changing-room', 'storage', 'restrooms'],
      },
    ],
    status: 'approved',
    isPublished: true,
    isSuspended: false,
    isFeatured: true,
    appliedDaysAgo: 74,
    bookingDensity: 0.55,
    opensAt: '07:00',
    closesAt: '23:00',
  },
  {
    key: 'sound',
    ownerKey: 'meher',
    orgName: 'Sound Room Andheri',
    name: 'The Sound Room',
    tagline: 'A live room and a vocal booth that have heard a lot of first albums.',
    description:
      'Independent recording room off Lokhandwala. The live room takes a five-piece comfortably, the booth is dead enough for voice-over, and the desk is a Focusrite rig that has been running since 2016 without complaint. Engineer available on request.',
    categorySlug: 'music',
    city: 'Mumbai',
    area: 'Andheri West',
    addressLine: '2nd Floor, Crystal Plaza, New Link Road',
    postalCode: '400053',
    instagram: 'soundroom.andheri',
    lat: 19.1364,
    lng: 72.8296,
    images: IMAGE_SETS.sound!,
    rules: ['No food in the live room.', 'Bring your own cables if you are particular.'],
    cancellationPolicy: 'Free up to 24 hours before. Inside that, 50% of the booking.',
    equipment: ['Focusrite Scarlett 18i20', 'Neumann TLM 103', 'Yamaha HS8 monitors', 'Kemper profiler', 'Roland TD-27 kit'],
    spaces: [
      {
        name: 'Live Room',
        description: 'Treated 450 sq ft with a drum riser and line-of-sight to the booth.',
        capacity: 8,
        sizeSqft: 450,
        hourlyRate: 1200,
        halfDayRate: 4200,
        minBookingMinutes: 120,
        bufferMinutes: 30,
        amenitySlugs: ['ac', 'wifi', 'soundproofing', 'equipment', 'lounge', 'restrooms'],
      },
      {
        name: 'Vocal Booth',
        description: 'One voice, one mic, no room tone.',
        capacity: 2,
        sizeSqft: 60,
        hourlyRate: 700,
        minBookingMinutes: 60,
        bufferMinutes: 15,
        amenitySlugs: ['ac', 'soundproofing', 'equipment', 'monitor'],
      },
    ],
    status: 'approved',
    isPublished: true,
    isSuspended: false,
    appliedDaysAgo: 61,
    bookingDensity: 0.5,
    opensAt: '10:00',
    closesAt: '23:00',
  },
  {
    key: 'dance',
    ownerKey: 'tanvi',
    orgName: 'Loop Studios',
    name: 'Loop Dance Studio',
    tagline: 'Sprung floor, full wall of mirror, and a sound system you can feel.',
    description:
      'Two rooms in Khar built for movement — sprung maple under both, mirrors on the long wall, and a rig that will take a rehearsal from eight in the morning until the building complains. Used equally by crews, contemporary companies and film choreographers blocking a number.',
    categorySlug: 'dance',
    city: 'Mumbai',
    area: 'Khar West',
    addressLine: '1st Floor, Ram Krishna Nagar, 16th Road',
    postalCode: '400052',
    instagram: 'loop.dance',
    lat: 19.0716,
    lng: 72.8339,
    images: IMAGE_SETS.dance!,
    rules: ['Dance shoes or bare feet only.', 'No chalk or rosin on the sprung floor.'],
    cancellationPolicy: 'Free up to 24 hours before your slot.',
    equipment: ['Sprung maple floor', 'Mirror wall with curtain', 'JBL EON system', 'Barres on request'],
    spaces: [
      {
        name: 'Studio A',
        description: '900 sq ft, mirrors on two walls, natural light down one side.',
        capacity: 20,
        sizeSqft: 900,
        hourlyRate: 1100,
        halfDayRate: 3900,
        minBookingMinutes: 60,
        bufferMinutes: 15,
        amenitySlugs: ['ac', 'wifi', 'natural-light', 'changing-room', 'storage', 'restrooms'],
      },
      {
        name: 'Studio B',
        description: '500 sq ft, blackout, better for camera.',
        capacity: 12,
        sizeSqft: 500,
        hourlyRate: 800,
        minBookingMinutes: 60,
        bufferMinutes: 15,
        amenitySlugs: ['ac', 'wifi', 'blackout', 'changing-room', 'restrooms'],
      },
    ],
    status: 'approved',
    isPublished: true,
    isSuspended: false,
    appliedDaysAgo: 45,
    bookingDensity: 0.6,
    opensAt: '07:00',
    closesAt: '22:00',
  },
  {
    key: 'film',
    ownerKey: 'arjun',
    orgName: 'Frame & Field',
    name: 'Frame & Field',
    tagline: 'A Versova apartment set, dressed and ready to shoot.',
    description:
      'A two-bedroom apartment kept permanently dressed as a set — kitchen practical, bedroom with a window that takes a 4x4 frame, and a living room that has been six different flats on screen this year. Comes with the furniture, the props and a very patient neighbour.',
    categorySlug: 'video',
    city: 'Mumbai',
    area: 'Versova',
    addressLine: 'B-701, Yari Road',
    postalCode: '400061',
    lat: 19.1364,
    lng: 72.8156,
    images: IMAGE_SETS.film!,
    rules: ['No wall fixings.', 'Reset the dressing before you leave.'],
    cancellationPolicy: 'Free up to 72 hours before.',
    equipment: ['Dressed apartment set', 'Practical kitchen', 'Prop cupboard', 'Blackout for every window'],
    spaces: [
      {
        name: 'Apartment Set',
        description: 'The whole flat, exclusive use.',
        capacity: 15,
        sizeSqft: 1100,
        hourlyRate: 1800,
        halfDayRate: 6500,
        fullDayRate: 11500,
        minBookingMinutes: 240,
        bufferMinutes: 60,
        amenitySlugs: ['ac', 'wifi', 'natural-light', 'blackout', 'kitchen', 'parking', 'restrooms'],
      },
    ],
    status: 'submitted',
    isPublished: false,
    isSuspended: false,
    appliedDaysAgo: 0,
    bookingDensity: 0,
  },
  {
    key: 'blackbox',
    ownerKey: 'rohan',
    orgName: 'Blackbox Rehearsal',
    name: 'Blackbox Goregaon',
    tagline: 'A proper black box for theatre companies who are tired of function rooms.',
    description:
      'Forty by thirty, matte black on every surface, a lighting bar that actually works and seating risers stacked against the back wall. Built by a company for companies. Bookable by the four-hour block.',
    categorySlug: 'rehearsal',
    city: 'Mumbai',
    area: 'Goregaon East',
    addressLine: 'Gala 12, Om Industrial Estate, Aarey Road',
    postalCode: '400063',
    lat: 19.1663,
    lng: 72.8526,
    images: IMAGE_SETS.blackbox!,
    rules: ['No spike tape on the floor — use the marks provided.'],
    cancellationPolicy: 'Free up to 48 hours before.',
    equipment: ['Lighting bar with 12 fresnels', 'Seating risers for 60', 'PA and monitors'],
    spaces: [
      {
        name: 'The Box',
        description: '1200 sq ft, matte black, 18ft to the bar.',
        capacity: 60,
        sizeSqft: 1200,
        hourlyRate: 1400,
        halfDayRate: 5000,
        fullDayRate: 9000,
        minBookingMinutes: 240,
        bufferMinutes: 30,
        amenitySlugs: ['ac', 'blackout', 'high-ceiling', 'lighting-rig', 'storage', 'restrooms', 'parking'],
      },
    ],
    status: 'under_review',
    isPublished: false,
    isSuspended: false,
    appliedDaysAgo: 3,
    bookingDensity: 0,
  },
  {
    key: 'terrace',
    ownerKey: 'zoya',
    orgName: 'Terrace Sessions',
    name: 'Terrace Sessions',
    tagline: 'An open terrace in Colaba for launches, listening parties and golden hour.',
    description:
      'The roof of a 1930s building with a view down to the harbour. Bare, in the best way — a floor, a low wall, a power supply and about two hours of extraordinary light every evening.',
    categorySlug: 'event',
    city: 'Mumbai',
    area: 'Colaba',
    addressLine: 'Terrace, Wodehouse Road',
    postalCode: '400005',
    lat: 18.9146,
    lng: 72.8156,
    images: IMAGE_SETS.terrace!,
    rules: ['Amplified sound off by 10 PM.', 'No open flame.'],
    cancellationPolicy: 'Free up to 7 days before. Monsoon dates are rescheduled free.',
    equipment: ['Power distribution', 'Basic string lighting', 'Service lift to the roof'],
    spaces: [
      {
        name: 'The Terrace',
        description: '2000 sq ft open roof.',
        capacity: 80,
        sizeSqft: 2000,
        hourlyRate: 2500,
        halfDayRate: 9000,
        minBookingMinutes: 180,
        bufferMinutes: 60,
        amenitySlugs: ['natural-light', 'restrooms'],
      },
    ],
    status: 'changes_requested',
    isPublished: false,
    isSuspended: false,
    appliedDaysAgo: 9,
    adminFeedback:
      'Lovely space, and we would like to list it. Two things before we can: the cover image is a phone shot at night and the terrace is the whole selling point, so please add a daylight or golden-hour frame as the cover. Second, your operating hours are missing entirely — we need them set before this can go live, particularly given the 10 PM sound restriction you have mentioned in the rules.',
    bookingDensity: 0,
  },
  {
    key: 'jazz',
    ownerKey: 'imran',
    orgName: 'Half Note',
    name: 'Half Note Jazz Room',
    tagline: 'A basement room with a piano.',
    description: 'Small basement room in Bandra with an upright piano and a PA.',
    categorySlug: 'music',
    city: 'Mumbai',
    area: 'Bandra East',
    addressLine: 'Basement, Kalanagar',
    postalCode: '400051',
    lat: 19.0596,
    lng: 72.8456,
    images: IMAGE_SETS.jazz!,
    rules: [],
    cancellationPolicy: 'Case by case.',
    equipment: ['Upright piano', 'PA'],
    spaces: [
      {
        name: 'Basement Room',
        description: 'Room with piano.',
        capacity: 15,
        sizeSqft: 300,
        hourlyRate: 600,
        minBookingMinutes: 60,
        bufferMinutes: 0,
        amenitySlugs: ['restrooms'],
      },
    ],
    status: 'rejected',
    isPublished: false,
    isSuspended: false,
    appliedDaysAgo: 21,
    rejectionReason:
      'We could not verify that the applicant has the right to let this space — the address resolves to a residential building and the society has confirmed no commercial permission is on file. Happy to look again if that changes.',
    bookingDensity: 0,
  },
  {
    key: 'loft',
    ownerKey: 'nisha',
    orgName: 'Pixel Loft',
    name: 'Pixel Loft',
    tagline: 'Product tables, light tents and a very good coffee machine.',
    description:
      'A small product photography loft in Powai — two shooting tables, a light tent, a copy stand and enough continuous lighting to keep a catalogue moving.',
    categorySlug: 'photography',
    city: 'Mumbai',
    area: 'Powai',
    addressLine: '4th Floor, Supreme Business Park, Hiranandani',
    postalCode: '400076',
    lat: 19.1176,
    lng: 72.906,
    images: IMAGE_SETS.loft!,
    rules: ['Product only — no talent shoots in the loft.'],
    cancellationPolicy: 'Free up to 24 hours before.',
    equipment: ['Two shooting tables', 'Light tent', 'Copy stand', 'Continuous LED panels'],
    spaces: [
      {
        name: 'Product Table 1',
        description: 'Table, tent and a tethering station.',
        capacity: 4,
        sizeSqft: 200,
        hourlyRate: 800,
        minBookingMinutes: 60,
        bufferMinutes: 15,
        amenitySlugs: ['ac', 'wifi', 'equipment', 'monitor'],
      },
    ],
    // Approved once, then pulled — which is what `suspendStudio` writes:
    // the status moves to suspended and `is_published` is left alone, so
    // restoring it puts the listing back exactly as it was.
    status: 'suspended',
    isPublished: true,
    isSuspended: true,
    appliedDaysAgo: 120,
    adminFeedback:
      'Suspended pending a response on three customer reports of the studio not being open at the booked time.',
    bookingDensity: 0.2,
  },
  {
    key: 'atelier',
    ownerKey: 'farid',
    orgName: 'Atelier Nine',
    name: 'Atelier Nine',
    tagline: 'A quiet room in Fort for people who make things with their hands.',
    description:
      'A workshop-studio in a Fort heritage building: long benches, north light, and a policy of no phone calls in the main room. Suits illustrators, ceramicists and anyone who needs eight uninterrupted hours.',
    categorySlug: 'workspace',
    city: 'Mumbai',
    area: 'Fort',
    addressLine: '2nd Floor, Kitab Mahal, DN Road',
    postalCode: '400001',
    lat: 18.9388,
    lng: 72.8324,
    images: IMAGE_SETS.atelier!,
    rules: ['No calls in the main room.', 'Clean your bench.'],
    cancellationPolicy: 'Free up to 24 hours before.',
    equipment: ['Long benches', 'Task lighting', 'Wet area', 'Flat files'],
    spaces: [
      {
        name: 'The Long Room',
        description: 'Six benches under north light.',
        capacity: 12,
        sizeSqft: 700,
        hourlyRate: 600,
        halfDayRate: 2200,
        fullDayRate: 3800,
        minBookingMinutes: 180,
        bufferMinutes: 15,
        amenitySlugs: ['wifi', 'natural-light', 'high-ceiling', 'storage', 'restrooms'],
      },
    ],
    status: 'approved',
    isPublished: false,
    isSuspended: false,
    appliedDaysAgo: 88,
    bookingDensity: 0.25,
    closedWeekdays: [0],
  },
];

/* ── Build ──────────────────────────────────────────────────────── */

export function buildSeed(): DemoDatabase {
  const database: DemoDatabase = {
    users: [],
    organizations: [],
    members: [],
    categories: [],
    amenities: [],
    studios: [],
    studioImages: [],
    spaces: [],
    applications: [],
    applicationEvents: [],
    customers: [],
    bookings: [],
    bookingEvents: [],
    availabilityRules: [],
    blockedTimes: [],
    reviews: [],
    notifications: [],
    whatsappAccounts: [],
    whatsappMessages: [],
    whatsappConversations: [],
    adminActions: [],
  };

  /* Taxonomy */
  CATEGORY_SEED.forEach(([slug, name, description], index) => {
    database.categories.push({
      id: `cat_${slug}`,
      slug,
      name,
      description,
      isActive: true,
      sortOrder: index,
    });
  });

  AMENITY_SEED.forEach(([slug, name, group], index) => {
    database.amenities.push({
      id: `amn_${slug}`,
      slug,
      name,
      group,
      isActive: true,
      sortOrder: index,
    });
  });

  /* People */
  const userIdOf = new Map<string, string>();
  PEOPLE.forEach((person) => {
    const id = `usr_${person.key}`;
    userIdOf.set(person.key, id);
    database.users.push({
      id,
      email: person.email,
      fullName: person.fullName,
      phone: person.phone,
      avatarUrl: null,
      platformRole: person.platformRole ?? 'customer',
      createdAt: ago(between(120, 400)),
      suspendedAt: null,
    });
  });

  const adminId = userIdOf.get('admin')!;
  const adminName = 'Priya Nair';

  /* Studios */
  for (const seed of STUDIOS) {
    buildStudio(database, seed, userIdOf, adminId, adminName);
  }

  /* WhatsApp: the demo owner's number is already connected. */
  const studio404 = database.studios.find((studio) => studio.slug === 'studio-404')!;
  database.whatsappAccounts.push({
    id: 'wa_studio404',
    organizationId: studio404.organizationId,
    phone: '+919820100201',
    displayName: 'Studio 404',
    isActive: true,
    verifiedAt: ago(40),
    createdAt: ago(40),
  });

  seedWhatsAppLog(database, studio404.organizationId);

  return database;
}

/* ── Studio construction ────────────────────────────────────────── */

function buildStudio(
  database: DemoDatabase,
  seed: StudioSeed,
  userIdOf: Map<string, string>,
  adminId: string,
  adminName: string,
): void {
  const ownerId = userIdOf.get(seed.ownerKey)!;
  const owner = database.users.find((user) => user.id === ownerId)!;

  const organizationId = `org_${seed.key}`;
  database.organizations.push({
    id: organizationId,
    name: seed.orgName,
    ownerUserId: ownerId,
    createdAt: ago(seed.appliedDaysAgo + 1),
  });
  database.members.push({
    organizationId,
    userId: ownerId,
    role: 'owner',
    createdAt: ago(seed.appliedDaysAgo + 1),
  });

  const studioId = `stu_${seed.key}`;
  const slug = slugFromName(seed.name);
  const approvedDaysAgo = Math.max(0, seed.appliedDaysAgo - 3);

  const studio: Studio = {
    id: studioId,
    organizationId,
    slug,
    name: seed.name,
    tagline: seed.tagline,
    description: seed.description,
    categoryId: `cat_${seed.categorySlug}`,
    location: {
      city: seed.city,
      area: seed.area,
      addressLine: seed.addressLine,
      postalCode: seed.postalCode,
      lat: seed.lat,
      lng: seed.lng,
    },
    timezone: TZ,
    contactName: owner.fullName,
    contactPhone: owner.phone ?? '',
    contactEmail: owner.email,
    instagram: seed.instagram ?? null,
    website: seed.website ?? null,
    rules: seed.rules,
    cancellationPolicy: seed.cancellationPolicy,
    equipment: seed.equipment,
    notes: null,
    bookingRules: { ...DEFAULT_BOOKING_RULES },
    status: seed.status,
    isPublished: seed.isPublished,
    isSuspended: seed.isSuspended,
    isFeatured: seed.isFeatured ?? false,
    hasPendingChanges: false,
    pendingChanges: null,
    publishedAt: seed.isPublished ? ago(approvedDaysAgo) : null,
    createdAt: ago(seed.appliedDaysAgo + 1),
    updatedAt: ago(Math.max(0, approvedDaysAgo - 1)),
  };
  database.studios.push(studio);

  seed.images.forEach((photoId, index) => {
    database.studioImages.push({
      id: `img_${seed.key}_${index}`,
      studioId,
      url: imageUrl(photoId),
      alt: `${seed.name} — ${index === 0 ? 'cover' : `view ${index}`}`,
      isCover: index === 0,
      sortOrder: index,
    });
  });

  const spaces: Space[] = seed.spaces.map((spaceSeed, index) => ({
    id: `spc_${seed.key}_${index}`,
    studioId,
    organizationId,
    name: spaceSeed.name,
    description: spaceSeed.description,
    capacity: spaceSeed.capacity,
    sizeSqft: spaceSeed.sizeSqft,
    hourlyRate: spaceSeed.hourlyRate,
    halfDayRate: spaceSeed.halfDayRate ?? null,
    fullDayRate: spaceSeed.fullDayRate ?? null,
    currency: 'INR',
    minBookingMinutes: spaceSeed.minBookingMinutes ?? 60,
    bufferMinutes: spaceSeed.bufferMinutes ?? 15,
    isActive: true,
    sortOrder: index,
    amenitySlugs: spaceSeed.amenitySlugs,
  }));
  database.spaces.push(...spaces);

  /* Opening hours — Terrace Sessions deliberately has none, which is
     exactly what the admin asked them to fix. */
  if (seed.key !== 'terrace') {
    for (const space of spaces) {
      for (let weekday = 0 as Weekday; weekday <= 6; weekday = (weekday + 1) as Weekday) {
        const closed = seed.closedWeekdays?.includes(weekday) ?? false;
        database.availabilityRules.push({
          id: `avr_${space.id}_${weekday}`,
          organizationId,
          spaceId: space.id,
          weekday,
          opensAt: seed.opensAt ?? '09:00',
          closesAt: seed.closesAt ?? '21:00',
          isClosed: closed,
        } satisfies AvailabilityRule);
      }
    }
  }

  buildApplication(database, seed, studio, ownerId, owner.fullName, adminId, adminName);

  if (seed.bookingDensity > 0) {
    buildBookings(database, seed, studio, spaces, userIdOf);
    if (seed.key === 'studio404') seedToday(database, studio, spaces);
    buildReviews(database, seed, studio, userIdOf);
  }
}

/* ── Applications and their timelines ───────────────────────────── */

function buildApplication(
  database: DemoDatabase,
  seed: StudioSeed,
  studio: Studio,
  ownerId: string,
  ownerName: string,
  adminId: string,
  adminName: string,
): void {
  const applicationId = `app_${seed.key}`;
  const createdAt = ago(seed.appliedDaysAgo + 1, 11);
  const submittedAt = ago(seed.appliedDaysAgo, 12);

  const events: StudioApplicationEvent[] = [];
  const event = (
    type: StudioApplicationEvent['type'],
    createdAtIso: string,
    actor: 'owner' | 'admin',
    message: string | null = null,
  ) => {
    events.push({
      id: `ape_${seed.key}_${events.length}`,
      applicationId,
      organizationId: studio.organizationId,
      type,
      actorId: actor === 'owner' ? ownerId : adminId,
      actorName: actor === 'owner' ? ownerName : adminName,
      message,
      createdAt: createdAtIso,
    });
  };

  event('application.created', createdAt, 'owner');
  event('application.submitted', submittedAt, 'owner');

  let reviewedAt: string | null = null;
  let reviewedBy: string | null = null;

  switch (seed.status) {
    case 'submitted':
      break;

    case 'under_review':
      reviewedAt = ago(Math.max(0, seed.appliedDaysAgo - 1), 10);
      reviewedBy = adminId;
      event('application.review_started', reviewedAt, 'admin');
      break;

    case 'changes_requested':
      event('application.review_started', ago(seed.appliedDaysAgo - 2, 10), 'admin');
      reviewedAt = ago(seed.appliedDaysAgo - 3, 16);
      reviewedBy = adminId;
      event('application.changes_requested', reviewedAt, 'admin', seed.adminFeedback ?? null);
      break;

    case 'rejected':
      event('application.review_started', ago(seed.appliedDaysAgo - 2, 10), 'admin');
      reviewedAt = ago(seed.appliedDaysAgo - 4, 15);
      reviewedBy = adminId;
      event('application.rejected', reviewedAt, 'admin', seed.rejectionReason ?? null);
      recordAdminAction(database, {
        adminId,
        adminName,
        action: 'admin.rejected_studio',
        studio,
        note: seed.rejectionReason ?? null,
        createdAt: reviewedAt,
      });
      break;

    default: {
      // approved, suspended or unpublished — all of which were approved once
      const reviewStartedAt = ago(seed.appliedDaysAgo - 1, 10);
      const approvedAt = ago(Math.max(0, seed.appliedDaysAgo - 3), 14);
      event('application.review_started', reviewStartedAt, 'admin');

      if (seed.key === 'studio404') {
        // The flagship listing went round once, which is the normal case
        // and worth having in the demo timeline.
        event(
          'application.changes_requested',
          ago(seed.appliedDaysAgo - 2, 11),
          'admin',
          'Great space. Please add at least one image of the podcast room and confirm your weekend hours.',
        );
        event('application.resubmitted', ago(seed.appliedDaysAgo - 2, 19), 'owner');
      }

      event('application.approved', approvedAt, 'admin');
      reviewedAt = approvedAt;
      reviewedBy = adminId;

      recordAdminAction(database, {
        adminId,
        adminName,
        action: 'admin.approved_studio',
        studio,
        note: null,
        createdAt: approvedAt,
      });

      if (seed.isSuspended) {
        const suspendedAt = ago(4, 17);
        event('application.suspended', suspendedAt, 'admin', seed.adminFeedback ?? null);
        recordAdminAction(database, {
          adminId,
          adminName,
          action: 'admin.suspended_studio',
          studio,
          note: seed.adminFeedback ?? null,
          createdAt: suspendedAt,
        });
      } else if (!seed.isPublished) {
        const unpublishedAt = ago(12, 9);
        event(
          'application.unpublished',
          unpublishedAt,
          'owner',
          'Owner paused the listing while the building lift is out of service.',
        );
      }
      break;
    }
  }

  database.applications.push({
    id: applicationId,
    organizationId: studio.organizationId,
    studioId: studio.id,
    status: seed.status,
    submittedAt,
    reviewedAt,
    reviewedBy,
    adminFeedback: seed.status === 'changes_requested' ? (seed.adminFeedback ?? null) : null,
    rejectionReason: seed.status === 'rejected' ? (seed.rejectionReason ?? null) : null,
    createdAt,
    updatedAt: reviewedAt ?? submittedAt,
  } satisfies StudioApplication);

  database.applicationEvents.push(...events);

  // The owner of an application still in the queue has an unread
  // notification waiting, and so does the admin.
  if (seed.status === 'submitted' || seed.status === 'under_review') {
    database.notifications.push({
      id: `ntf_app_${seed.key}`,
      userId: adminId,
      type: 'application.submitted',
      title: 'New studio application',
      body: `${studio.name} · ${studio.location.area}`,
      href: `/admin/applications/${applicationId}`,
      readAt: null,
      createdAt: submittedAt,
    });
  }
  if (seed.status === 'changes_requested') {
    database.notifications.push({
      id: `ntf_chg_${seed.key}`,
      userId: ownerId,
      type: 'application.changes_requested',
      title: 'PL·CE requested changes',
      body: 'Your listing needs a couple of updates before it can go live.',
      href: '/studio/application',
      readAt: null,
      createdAt: reviewedAt ?? submittedAt,
    });
  }
}

function recordAdminAction(
  database: DemoDatabase,
  input: {
    adminId: string;
    adminName: string;
    action: 'admin.approved_studio' | 'admin.rejected_studio' | 'admin.suspended_studio';
    studio: Studio;
    note: string | null;
    createdAt: string;
  },
): void {
  database.adminActions.push({
    id: `adm_${database.adminActions.length}`,
    adminUserId: input.adminId,
    adminName: input.adminName,
    action: input.action,
    entityType: 'studio',
    entityId: input.studio.id,
    entityLabel: input.studio.name,
    previousState: null,
    newState: { status: input.studio.status },
    note: input.note,
    createdAt: input.createdAt,
  });
}

/* ── Bookings ───────────────────────────────────────────────────── */

const SOURCES: BookingSource[] = ['plce', 'plce', 'whatsapp', 'whatsapp', 'instagram', 'phone', 'walk_in', 'manual'];

function buildBookings(
  database: DemoDatabase,
  seed: StudioSeed,
  studio: Studio,
  spaces: Space[],
  userIdOf: Map<string, string>,
): void {
  const accountKeys = ['rahul', 'ananya', 'ishaan', 'sara', 'nikhil'];

  /** The studio's own CRM contacts — some with accounts, some without. */
  const customers: Customer[] = [];
  accountKeys.forEach((key, index) => {
    const userId = userIdOf.get(key)!;
    const user = database.users.find((candidate) => candidate.id === userId)!;
    customers.push({
      id: `cus_${seed.key}_${index}`,
      organizationId: studio.organizationId,
      userId,
      name: user.fullName,
      phone: user.phone,
      email: user.email,
      notes: index === 0 ? 'Regular. Always books the cyc, always runs 20 minutes over.' : null,
      createdAt: ago(between(30, 90)),
      updatedAt: ago(between(1, 20)),
    });
  });
  OFF_PLATFORM_NAMES.forEach((name, index) => {
    customers.push({
      id: `cus_${seed.key}_off_${index}`,
      organizationId: studio.organizationId,
      userId: null,
      name,
      phone: `+9198${between(20000000, 99999999)}`,
      email: null,
      notes: null,
      createdAt: ago(between(10, 120)),
      updatedAt: ago(between(1, 30)),
    });
  });
  database.customers.push(...customers);

  const startTimes = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '18:00', '19:00'];

  for (let dayOffset = -35; dayOffset <= 21; dayOffset += 1) {
    for (const space of spaces) {
      const density = seed.bookingDensity * (dayOffset >= 0 ? 0.7 : 1);
      const bookingsToday = chance(density * 0.75) ? (chance(0.35) ? 2 : 1) : 0;

      const usedStarts: number[] = [];
      for (let n = 0; n < bookingsToday; n += 1) {
        const startTime = pick(startTimes);
        const startHour = Number(startTime.slice(0, 2));
        const hours = space.minBookingMinutes >= 240 ? pick([4, 6, 8]) : pick([1, 2, 2, 3, 4]);

        // Keep the day coherent: no overlaps, nothing past closing.
        if (usedStarts.some((used) => Math.abs(used - startHour) < hours + 1)) continue;
        const closesHour = Number((seed.closesAt ?? '21:00').slice(0, 2));
        if (startHour + hours > closesHour) continue;
        usedStarts.push(startHour);

        const customer = pick(customers);
        const startsAt = at(dayOffset, startTime);
        const endsAt = at(dayOffset, `${String(startHour + hours).padStart(2, '0')}:00`);
        const source = customer.userId ? pick(['plce', 'plce', 'whatsapp', 'manual']) : pick(SOURCES);

        const status: BookingStatus =
          dayOffset < 0
            ? chance(0.08)
              ? 'cancelled'
              : chance(0.04)
                ? 'no_show'
                : 'completed'
            : chance(0.12)
              ? 'pending'
              : 'confirmed';

        const paymentStatus: PaymentStatus =
          status === 'cancelled'
            ? chance(0.5)
              ? 'refunded'
              : 'unpaid'
            : status === 'completed'
              ? 'paid'
              : chance(0.45)
                ? 'paid'
                : chance(0.3)
                  ? 'partial'
                  : 'unpaid';

        const price = priceForSeed(space, hours);
        const bookingId = `bkg_${seed.key}_${database.bookings.length}`;
        const createdAt = ago(Math.max(0, -dayOffset + between(1, 8)));

        database.bookings.push({
          id: bookingId,
          reference: newBookingReference(),
          organizationId: studio.organizationId,
          studioId: studio.id,
          spaceId: space.id,
          customerId: customer.id,
          customerUserId: customer.userId,
          startsAt,
          endsAt,
          status,
          paymentStatus,
          source: source as BookingSource,
          guestCount: chance(0.5) ? between(2, Math.max(3, Math.floor(space.capacity / 2))) : null,
          priceAmount: price,
          currency: 'INR',
          notes: chance(0.2) ? pick(['Client bringing own lights.', 'Needs the freight lift at 8.', 'Two-camera setup.', 'Cake delivery at 4.']) : null,
          createdBy: null,
          createdAt,
          updatedAt: createdAt,
          cancelledAt: status === 'cancelled' ? ago(Math.max(0, -dayOffset + 1)) : null,
          cancellationReason: status === 'cancelled' ? pick(['Client postponed.', 'Talent unwell.', 'Rain.']) : null,
        } satisfies Booking);

        database.bookingEvents.push({
          id: `bev_${bookingId}`,
          bookingId,
          organizationId: studio.organizationId,
          type: 'booking.created',
          actorId: null,
          actorName: source === 'plce' ? customer.name : 'Studio',
          message: `Created from ${source}`,
          metadata: { source },
          createdAt,
        });
      }
    }
  }

  /* A block of maintenance time the owner set, so the calendar has one. */
  const firstSpace = spaces[0]!;
  database.blockedTimes.push({
    id: `blk_${seed.key}_0`,
    organizationId: studio.organizationId,
    spaceId: firstSpace.id,
    startsAt: at(2, '09:00'),
    endsAt: at(2, '13:00'),
    reason: 'Deep clean and floor repaint',
    createdBy: null,
    createdAt: ago(3),
  });
}

/** Mirrors `priceFor` in the availability module — caps, not tiers. */
function priceForSeed(space: Space, hours: number): number {
  const hourly = space.hourlyRate * hours;
  const caps = [hourly];
  if (space.halfDayRate != null && hours >= 4) caps.push(space.halfDayRate);
  if (space.fullDayRate != null && hours >= 8) caps.push(space.fullDayRate);
  return Math.min(...caps);
}

/**
 * A guaranteed day for the flagship studio.
 *
 * The random generator gives a realistic month, but it can leave *today*
 * empty — and today is the screen the whole CRM is built around. Anyone
 * opening the demo should land on a working day that shows the status
 * language in one glance: one settled booking, one that owes money, one
 * awaiting confirmation, and one called off.
 *
 * These go through the same tables as every other row; only their
 * timing is chosen rather than rolled.
 */
function seedToday(database: DemoDatabase, studio: Studio, spaces: Space[]): void {
  // Clear anything the generator happened to place today, so the day
  // reads deliberately rather than as a collision of two systems.
  const dayStart = at(0, '00:00');
  const dayEnd = at(1, '00:00');
  database.bookings = database.bookings.filter(
    (booking) =>
      booking.studioId !== studio.id ||
      booking.startsAt < dayStart ||
      booking.startsAt >= dayEnd,
  );

  const customers = database.customers.filter(
    (customer) => customer.organizationId === studio.organizationId,
  );
  if (customers.length === 0 || spaces.length === 0) return;

  const main = spaces[0]!;
  const second = spaces[1] ?? main;
  const third = spaces[2] ?? main;

  const plan: Array<{
    space: Space;
    start: string;
    end: string;
    status: BookingStatus;
    payment: PaymentStatus;
    source: BookingSource;
    customer: Customer;
    notes?: string;
  }> = [
    {
      space: main,
      start: '10:00',
      end: '13:00',
      status: 'confirmed',
      payment: 'paid',
      source: 'plce',
      customer: customers[0]!,
      notes: 'Lookbook — three setups, seamless white.',
    },
    {
      space: second,
      start: '12:00',
      end: '15:00',
      status: 'confirmed',
      payment: 'unpaid',
      source: 'whatsapp',
      customer: customers[1] ?? customers[0]!,
      notes: 'Paying on the day.',
    },
    {
      space: third,
      start: '16:00',
      end: '18:00',
      status: 'pending',
      payment: 'unpaid',
      source: 'instagram',
      customer: customers[2] ?? customers[0]!,
    },
    {
      space: main,
      start: '18:30',
      end: '20:30',
      status: 'cancelled',
      payment: 'refunded',
      source: 'plce',
      customer: customers[3] ?? customers[0]!,
    },
  ];

  plan.forEach((entry, index) => {
    const startsAt = at(0, entry.start);
    const endsAt = at(0, entry.end);
    const hours = (Date.parse(endsAt) - Date.parse(startsAt)) / 3_600_000;
    const bookingId = `bkg_today_${index}`;

    database.bookings.push({
      id: bookingId,
      reference: newBookingReference(),
      organizationId: studio.organizationId,
      studioId: studio.id,
      spaceId: entry.space.id,
      customerId: entry.customer.id,
      customerUserId: entry.customer.userId,
      startsAt,
      endsAt,
      status: entry.status,
      paymentStatus: entry.payment,
      source: entry.source,
      guestCount: null,
      priceAmount: priceForSeed(entry.space, hours),
      currency: 'INR',
      notes: entry.notes ?? null,
      createdBy: null,
      createdAt: ago(between(1, 6)),
      updatedAt: ago(1),
      cancelledAt: entry.status === 'cancelled' ? ago(1) : null,
      cancellationReason: entry.status === 'cancelled' ? 'Client postponed to next week.' : null,
    } satisfies Booking);

    database.bookingEvents.push({
      id: `bev_${bookingId}`,
      bookingId,
      organizationId: studio.organizationId,
      type: 'booking.created',
      actorId: null,
      actorName: entry.source === 'whatsapp' ? 'Studio 404 (WhatsApp)' : 'Studio',
      message: `Created from ${entry.source}`,
      metadata: { source: entry.source },
      createdAt: ago(between(1, 6)),
    });
  });
}

/* ── Reviews ────────────────────────────────────────────────────── */

/*
  Rating and body travel together.

  They used to be drawn independently — a star count from one roll, a
  sentence from another — which produced five-star reviews complaining
  about the load-in. Incoherent on the listing page, and actively
  misleading anywhere that picks a review to quote: sorting by rating
  would happily surface a grumble as the best thing anyone had said.

  The spread is kept deliberately uneven so studio averages still land
  in the low fours rather than all sitting at five.
*/
const REVIEWS: Array<{ body: string; rating: number }> = [
  { body: 'Exactly as described. The light in the morning is the reason to book it.', rating: 5 },
  {
    body: 'Turned around a six-look shoot in four hours. Kit was where they said it would be.',
    rating: 5,
  },
  { body: 'Straightforward booking, no surprises on the day. Will be back.', rating: 5 },
  {
    body: 'The team left us alone to work, which is all I ever want from a studio.',
    rating: 5,
  },
  {
    body: 'Sound in the room is genuinely good. We tracked drums without a single retake for noise.',
    rating: 5,
  },
  {
    body: 'Good space, though load-in is slower than you would expect — build in twenty minutes.',
    rating: 4,
  },
  { body: 'Does the job. The room is smaller than it looks in the photographs.', rating: 3 },
  { body: 'Fine for a half-day, but the wifi dropped twice while we were tethering.', rating: 3 },
];

function buildReviews(
  database: DemoDatabase,
  seed: StudioSeed,
  studio: Studio,
  userIdOf: Map<string, string>,
): void {
  const completed = database.bookings.filter(
    (booking) => booking.studioId === studio.id && booking.status === 'completed' && booking.customerUserId,
  );

  const reviewed = completed.slice(0, Math.min(completed.length, between(3, 8)));
  reviewed.forEach((booking, index) => {
    const author = database.users.find((user) => user.id === booking.customerUserId)!;
    const review = pick(REVIEWS);
    database.reviews.push({
      id: `rev_${seed.key}_${index}`,
      organizationId: studio.organizationId,
      studioId: studio.id,
      bookingId: booking.id,
      authorUserId: author.id,
      authorName: author.fullName,
      rating: review.rating,
      body: review.body,
      createdAt: new Date(Date.parse(booking.endsAt) + 86_400_000).toISOString(),
      isHidden: false,
    });
  });

  void userIdOf;
}

/* ── WhatsApp log ───────────────────────────────────────────────── */

function seedWhatsAppLog(database: DemoDatabase, organizationId: string): void {
  const thread: Array<
    [
      direction: 'inbound' | 'outbound',
      body: string,
      minutesAgo: number,
      outcome?: WhatsAppOutcome,
    ]
  > = [
    ['inbound', 'What do I have today?', 260],
    [
      'outbound',
      'Today at Studio 404:\n\n10:00–13:00 · Main Studio · Ananya Gupta\n15:00–18:00 · Cyclorama · Aditya Rane\n\n2 bookings · ₹10,500',
      259,
      'schedule_sent',
    ],
    ['inbound', 'Book podcast room tomorrow 4 to 6 for Kritika', 180],
    [
      'outbound',
      '✓ Booked.\n\nPodcast Room\nTomorrow · 4 – 6 PM\nKritika Bose\n₹1,800\n\nPLCE-7QK3M',
      179,
      'booking_created',
    ],
    ['inbound', 'Is the cyc free saturday evening', 90],
    [
      'outbound',
      'Cyclorama on Saturday: free from 6 PM to 10 PM. Booked 2 – 5:45 PM.\n\nWant me to hold something?',
      89,
      'availability_checked',
    ],
  ];

  thread.forEach(([direction, body, minutesAgo, outcome], index) => {
    database.whatsappMessages.push({
      id: `wam_${index}`,
      organizationId,
      direction,
      phone: '+919820100201',
      body,
      intent: null,
      outcome: outcome ?? null,
      bookingId: null,
      externalId: null,
      createdAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    });
  });
}

/* ── Misc ───────────────────────────────────────────────────────── */

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const DEMO_CREDENTIALS = {
  admin: 'priya@findplce.com',
  owner: 'kabir@studio404.in',
  ownerAwaitingChanges: 'zoya@terracesessions.in',
  customer: 'rahul@example.com',
} as const;