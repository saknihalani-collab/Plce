/**
 * PL·CE domain vocabulary.
 *
 * One set of nouns, used by Discovery, the Studio CRM, the Admin panel
 * and WhatsApp alike. If two surfaces disagree about what a booking is,
 * they disagree here first — so this file is deliberately the only place
 * these shapes are declared.
 *
 * Times: every stored instant is an ISO-8601 string in UTC. Wall-clock
 * strings ('HH:mm', 'YYYY-MM-DD') appear only where a human means a
 * local time — opening hours, a requested date — and are always resolved
 * against the studio's own timezone before they become an instant.
 */

/* ── Identity ───────────────────────────────────────────────────── */

/** Who someone is to PL·CE. Orthogonal to what they are inside a studio. */
export type PlatformRole = 'customer' | 'admin';

/** What someone is inside one studio business. */
export type OrgRole = 'owner' | 'manager' | 'staff';

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
};

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  platformRole: PlatformRole;
  createdAt: string;
  suspendedAt: string | null;
}

/** The tenant. A studio business, which may operate several studios. */
export interface Organization {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
}

/** A member joined to the account behind it — what the members table renders. */
export interface OrganizationMemberDetail extends OrganizationMember {
  fullName: string;
  email: string;
  avatarUrl: string | null;
}

/* ── Taxonomy (admin-managed, never hard-coded) ─────────────────── */

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Denormalised for the admin table; not stored. */
  studioCount?: number;
}

export type AmenityGroup = 'comfort' | 'technical' | 'space' | 'facilities';

export const AMENITY_GROUP_LABELS: Record<AmenityGroup, string> = {
  comfort: 'Comfort',
  technical: 'Technical',
  space: 'Space',
  facilities: 'Facilities',
};

export interface Amenity {
  id: string;
  slug: string;
  name: string;
  group: AmenityGroup;
  isActive: boolean;
  sortOrder: number;
  studioCount?: number;
}

/* ── Listing lifecycle ──────────────────────────────────────────── */

export type ListingStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'unpublished';

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
  unpublished: 'Unpublished',
};

/* ── Studios ────────────────────────────────────────────────────── */

export interface StudioImage {
  id: string;
  url: string;
  alt: string;
  isCover: boolean;
  sortOrder: number;
}

export interface StudioLocation {
  city: string;
  area: string;
  addressLine: string;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * The listing record.
 *
 * `status`, `isPublished` and `isSuspended` are three columns because
 * they answer three different questions — did PL·CE approve it, does the
 * owner want it visible, has PL·CE pulled it. Collapsing them loses the
 * ability to restore the right state.
 */
export interface Studio {
  id: string;
  organizationId: string;
  slug: string;

  name: string;
  tagline: string | null;
  description: string;
  categoryId: string;

  location: StudioLocation;
  timezone: string;

  contactName: string;
  contactPhone: string;
  contactEmail: string;
  instagram: string | null;
  website: string | null;

  rules: string[];
  cancellationPolicy: string;
  equipment: string[];
  notes: string | null;

  /** Studio-wide booking policy. Spaces carry their own duration limits. */
  bookingRules: BookingRules;

  status: ListingStatus;
  isPublished: boolean;
  isSuspended: boolean;
  isFeatured: boolean;

  /** Set when an owner edits a public-facing field on an approved listing. */
  hasPendingChanges: boolean;
  pendingChanges: StudioPendingChanges | null;

  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The public-facing subset an owner cannot change without review. */
export interface StudioPendingChanges {
  name?: string;
  tagline?: string | null;
  description?: string;
  categoryId?: string;
  location?: StudioLocation;
  coverImageUrl?: string;
  submittedAt: string;
}

/** What a discovery card needs — nothing more, so the list query stays cheap. */
export interface StudioSummary {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  city: string;
  area: string;
  /** Carried on the summary so a card can render today's hours locally. */
  timezone: string;
  category: Pick<Category, 'id' | 'slug' | 'name'>;
  coverImage: StudioImage | null;
  priceFrom: number;
  capacityMax: number;
  spaceCount: number;
  amenitySlugs: string[];
  ratingAverage: number | null;
  ratingCount: number;
  bookingCount: number;
  isFeatured: boolean;
  createdAt: string;
}

/** The full public page, plus everything the owner and admin views reuse. */
export interface StudioDetail extends Studio {
  category: Category;
  images: StudioImage[];
  coverImage: StudioImage | null;
  spaces: Space[];
  amenities: Amenity[];
  host: {
    organizationId: string;
    organizationName: string;
    memberSince: string;
  };
  ratingAverage: number | null;
  ratingCount: number;
  bookingCount: number;
}

/* ── Spaces ─────────────────────────────────────────────────────── */

export interface Space {
  id: string;
  studioId: string;
  organizationId: string;
  name: string;
  description: string | null;
  capacity: number;
  sizeSqft: number | null;

  /** Minor units are not used; Indian studios quote whole rupees. */
  hourlyRate: number;
  halfDayRate: number | null;
  fullDayRate: number | null;
  currency: Currency;

  minBookingMinutes: number;
  /** Turnaround time held after each booking. Blocks the next slot. */
  bufferMinutes: number;
  isActive: boolean;
  sortOrder: number;
  amenitySlugs: string[];
}

export type Currency = 'INR';

/* ── Availability ───────────────────────────────────────────────── */

/** 0 = Sunday, matching `Date.prototype.getDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export interface AvailabilityRule {
  id: string;
  organizationId: string;
  spaceId: string;
  weekday: Weekday;
  /** Local wall-clock, 'HH:mm'. */
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

export interface BlockedTime {
  id: string;
  organizationId: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Booking rules that live on the studio rather than a single space. */
export interface BookingRules {
  /** Bookings must start at least this far ahead. */
  minNoticeMinutes: number;
  /** Bookings may not start more than this far ahead. */
  maxAdvanceDays: number;
  /** Start times snap to this grid. */
  slotMinutes: number;
  /** Confirm automatically, or hold as pending for the owner. */
  autoConfirm: boolean;
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  minNoticeMinutes: 60,
  maxAdvanceDays: 180,
  slotMinutes: 30,
  autoConfirm: true,
};

/* ── Bookings ───────────────────────────────────────────────────── */

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

/** The statuses that occupy the calendar. Anything else frees the slot. */
export const BLOCKING_BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'completed'];

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Part paid',
  paid: 'Paid',
  refunded: 'Refunded',
};

export type BookingSource =
  | 'plce'
  | 'whatsapp'
  | 'instagram'
  | 'phone'
  | 'walk_in'
  | 'manual'
  | 'admin';

export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  plce: 'PL·CE',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  phone: 'Phone',
  walk_in: 'Walk-in',
  manual: 'Manual',
  admin: 'PL·CE Admin',
};

export interface Booking {
  id: string;
  /** Human-facing, e.g. `PLCE-8F42K`. Unique. */
  reference: string;
  organizationId: string;
  studioId: string;
  spaceId: string;

  /** Always set — every booking has a CRM contact, account or not. */
  customerId: string;
  /** Set only when the booking came from a signed-in PL·CE account. */
  customerUserId: string | null;

  startsAt: string;
  endsAt: string;

  status: BookingStatus;
  paymentStatus: PaymentStatus;
  source: BookingSource;

  guestCount: number | null;
  priceAmount: number;
  currency: Currency;
  notes: string | null;

  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

/** A booking with the names every list and calendar needs to render it. */
export interface BookingDetail extends Booking {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  spaceName: string;
  studioName: string;
  studioSlug: string;
  studioCity: string;
  timezone: string;
}

export type BookingEventType =
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.rescheduled'
  | 'booking.cancelled'
  | 'booking.completed'
  | 'booking.no_show'
  | 'booking.payment_updated'
  | 'booking.note_added';

export interface BookingEvent {
  id: string;
  bookingId: string;
  organizationId: string;
  type: BookingEventType;
  actorId: string | null;
  actorName: string;
  message: string | null;
  /**
   * Structured detail about how the event came about — for a WhatsApp
   * booking, the message id and the intent that produced it. Kept so a
   * booking nobody remembers making can be traced back to the sentence
   * that made it, and so "how many bookings came from WhatsApp?" is a
   * query rather than a guess.
   */
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/* ── Customers (per-organisation CRM) ───────────────────────────── */

export interface Customer {
  id: string;
  organizationId: string;
  /** Linked when the person also has a PL·CE account. */
  userId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSummary extends Customer {
  totalBookings: number;
  totalSpend: number;
  lastBookingAt: string | null;
  nextBookingAt: string | null;
}

/* ── Applications ───────────────────────────────────────────────── */

export interface StudioApplication {
  id: string;
  organizationId: string;
  studioId: string;
  status: ListingStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  adminFeedback: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationEventType =
  | 'application.created'
  | 'application.submitted'
  | 'application.review_started'
  | 'application.changes_requested'
  | 'application.resubmitted'
  | 'application.approved'
  | 'application.rejected'
  | 'application.suspended'
  | 'application.unpublished'
  | 'application.republished'
  | 'application.edited';

export const APPLICATION_EVENT_LABELS: Record<ApplicationEventType, string> = {
  'application.created': 'Application started',
  'application.submitted': 'Application submitted',
  'application.review_started': 'Moved to review',
  'application.changes_requested': 'Changes requested',
  'application.resubmitted': 'Owner resubmitted',
  'application.approved': 'Approved',
  'application.rejected': 'Rejected',
  'application.suspended': 'Suspended',
  'application.unpublished': 'Unpublished',
  'application.republished': 'Republished',
  'application.edited': 'Listing edited',
};

export interface StudioApplicationEvent {
  id: string;
  applicationId: string;
  organizationId: string;
  type: ApplicationEventType;
  actorId: string | null;
  actorName: string;
  message: string | null;
  createdAt: string;
}

/** One row of the admin review queue. */
export interface ApplicationSummary {
  application: StudioApplication;
  studioId: string;
  studioName: string;
  studioSlug: string;
  categoryName: string;
  city: string;
  area: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  coverImage: StudioImage | null;
  spaceCount: number;
}

/* ── Admin audit ────────────────────────────────────────────────── */

export type AdminActionType =
  | 'admin.approved_studio'
  | 'admin.rejected_studio'
  | 'admin.requested_changes'
  | 'admin.started_review'
  | 'admin.edited_listing'
  | 'admin.published_studio'
  | 'admin.unpublished_studio'
  | 'admin.suspended_studio'
  | 'admin.restored_studio'
  | 'admin.featured_studio'
  | 'admin.deleted_listing'
  | 'admin.created_category'
  | 'admin.updated_category'
  | 'admin.deleted_category'
  | 'admin.created_amenity'
  | 'admin.updated_amenity'
  | 'admin.deleted_amenity'
  | 'admin.updated_user'
  | 'admin.suspended_user'
  | 'admin.cancelled_booking';

export const ADMIN_ACTION_LABELS: Record<AdminActionType, string> = {
  'admin.approved_studio': 'Approved studio',
  'admin.rejected_studio': 'Rejected studio',
  'admin.requested_changes': 'Requested changes',
  'admin.started_review': 'Started review',
  'admin.edited_listing': 'Edited listing',
  'admin.published_studio': 'Published studio',
  'admin.unpublished_studio': 'Unpublished studio',
  'admin.suspended_studio': 'Suspended studio',
  'admin.restored_studio': 'Restored studio',
  'admin.featured_studio': 'Changed featured',
  'admin.deleted_listing': 'Archived listing',
  'admin.created_category': 'Created category',
  'admin.updated_category': 'Updated category',
  'admin.deleted_category': 'Deleted category',
  'admin.created_amenity': 'Created amenity',
  'admin.updated_amenity': 'Updated amenity',
  'admin.deleted_amenity': 'Deleted amenity',
  'admin.updated_user': 'Updated user',
  'admin.suspended_user': 'Suspended user',
  'admin.cancelled_booking': 'Cancelled booking',
};

export interface AdminAction {
  id: string;
  adminUserId: string;
  adminName: string;
  action: AdminActionType;
  entityType: 'studio' | 'application' | 'user' | 'category' | 'amenity' | 'booking';
  entityId: string;
  entityLabel: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  note: string | null;
  createdAt: string;
}

/* ── Reviews ────────────────────────────────────────────────────── */

export interface Review {
  id: string;
  organizationId: string;
  studioId: string;
  bookingId: string;
  authorUserId: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
  isHidden: boolean;
}

/* ── Notifications ──────────────────────────────────────────────── */

export type NotificationType =
  | 'booking.created'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'booking.reminder'
  | 'payment.updated'
  | 'application.submitted'
  | 'application.approved'
  | 'application.changes_requested'
  | 'application.rejected';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/* ── WhatsApp ───────────────────────────────────────────────────── */

export interface WhatsAppAccount {
  id: string;
  organizationId: string;
  /** E.164, the identity anchor for every inbound message. */
  phone: string;
  displayName: string;
  isActive: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

/** What the assistant actually did, for the owner's activity log. */
export type WhatsAppOutcome =
  | 'booking_created'
  | 'booking_cancelled'
  | 'booking_moved'
  | 'availability_checked'
  | 'schedule_sent'
  | 'time_blocked'
  | 'customer_found'
  | 'clarification'
  | 'refused'
  | 'help';

export const WHATSAPP_OUTCOME_LABELS: Record<WhatsAppOutcome, string> = {
  booking_created: 'Booking created',
  booking_cancelled: 'Booking cancelled',
  booking_moved: 'Booking moved',
  availability_checked: 'Availability checked',
  schedule_sent: 'Schedule sent',
  time_blocked: 'Time blocked',
  customer_found: 'Customer looked up',
  clarification: 'Asked a question',
  refused: 'Could not do it',
  help: 'Sent examples',
};

export interface WhatsAppMessage {
  id: string;
  organizationId: string;
  direction: 'inbound' | 'outbound';
  phone: string;
  body: string;
  /** The structured intent this message produced, for auditing the AI. */
  intent: Record<string, unknown> | null;
  /** Set on the reply, so the log reads as actions rather than chatter. */
  outcome: WhatsAppOutcome | null;
  bookingId: string | null;
  /** Meta's own message id, for tracing a booking back to a delivery. */
  externalId: string | null;
  createdAt: string;
}

/* ── Discovery ──────────────────────────────────────────────────── */

export type StudioSort = 'recommended' | 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'most_booked';

export const STUDIO_SORT_LABELS: Record<StudioSort, string> = {
  recommended: 'Recommended',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating: 'Top rated',
  newest: 'Newest',
  most_booked: 'Most booked',
};

export interface DiscoveryFilters {
  q?: string;
  city?: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  minCapacity?: number;
  amenitySlugs?: string[];
  minRating?: number;
  /** Availability window — 'YYYY-MM-DD' plus local 'HH:mm'. */
  date?: string;
  startTime?: string;
  endTime?: string;
  sort?: StudioSort;
}

/* ── Shared ─────────────────────────────────────────────────────── */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface StudioStats {
  todayBookings: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  upcomingBookings: number;
  occupancyRate: number;
  pendingPayments: number;
  pendingPaymentAmount: number;
  activeCustomers: number;
}

export interface MarketplaceStats {
  totalStudios: number;
  liveStudios: number;
  pendingApplications: number;
  changesRequested: number;
  suspendedStudios: number;
  totalBookings: number;
  bookingsThisMonth: number;
  grossRevenue: number;
  revenueThisMonth: number;
  activeCustomers: number;
  totalUsers: number;
  approvalRate: number;
  topCities: Array<{ city: string; count: number }>;
  topCategories: Array<{ name: string; count: number }>;
}
