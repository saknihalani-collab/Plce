import type {
  AdminAction,
  AdminActionType,
  Amenity,
  AmenityGroup,
  AppNotification,
  ApplicationEventType,
  ApplicationSummary,
  AvailabilityRule,
  BlockedTime,
  Booking,
  BookingDetail,
  BookingEvent,
  BookingEventType,
  BookingRules,
  BookingSource,
  BookingStatus,
  Category,
  Currency,
  Customer,
  CustomerSummary,
  DiscoveryFilters,
  ListingStatus,
  MarketplaceStats,
  NotificationType,
  Organization,
  OrganizationMember,
  OrganizationMemberDetail,
  OrgRole,
  Paginated,
  PaymentStatus,
  PlatformRole,
  Review,
  Space,
  Studio,
  StudioApplication,
  StudioApplicationEvent,
  StudioDetail,
  StudioImage,
  StudioLocation,
  StudioPendingChanges,
  StudioStats,
  StudioSummary,
  UserAccount,
  WhatsAppAccount,
  WhatsAppMessage,
  WhatsAppOutcome,
} from '@/types/domain';

/* ── Inputs ─────────────────────────────────────────────────────── */

export interface CreateUserInput {
  email: string;
  fullName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  platformRole?: PlatformRole;
}

export type UpdateUserInput = Partial<
  Pick<UserAccount, 'fullName' | 'phone' | 'avatarUrl' | 'platformRole'>
>;

export interface StudioDraftInput {
  name: string;
  tagline?: string | null;
  description: string;
  categoryId: string;
  location: StudioLocation;
  timezone?: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  instagram?: string | null;
  website?: string | null;
  rules?: string[];
  cancellationPolicy?: string;
  equipment?: string[];
  notes?: string | null;
  bookingRules?: BookingRules;
}

export type UpdateStudioInput = Partial<StudioDraftInput> & {
  isFeatured?: boolean;
  hasPendingChanges?: boolean;
  pendingChanges?: StudioPendingChanges | null;
};

export interface SpaceInput {
  name: string;
  description?: string | null;
  capacity: number;
  sizeSqft?: number | null;
  hourlyRate: number;
  halfDayRate?: number | null;
  fullDayRate?: number | null;
  currency?: Currency;
  minBookingMinutes?: number;
  bufferMinutes?: number;
  isActive?: boolean;
  sortOrder?: number;
  amenitySlugs?: string[];
}

export interface StudioImageInput {
  url: string;
  alt: string;
  isCover?: boolean;
  sortOrder?: number;
}

/**
 * The persistence half of a booking.
 *
 * Deliberately not exported as "create a booking" — this is the raw
 * insert, and the *only* caller permitted to use it is
 * `lib/booking/engine.ts`. Every other surface goes through the engine so
 * that availability, pricing and rules are applied exactly once.
 */
export interface InsertBookingInput {
  organizationId: string;
  studioId: string;
  spaceId: string;
  customerId: string;
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
}

export type UpdateBookingInput = Partial<
  Pick<
    Booking,
    | 'spaceId'
    | 'startsAt'
    | 'endsAt'
    | 'status'
    | 'paymentStatus'
    | 'guestCount'
    | 'priceAmount'
    | 'notes'
    | 'cancelledAt'
    | 'cancellationReason'
  >
>;

export interface CustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  userId?: string | null;
}

export interface BookingFilters {
  status?: BookingStatus[];
  paymentStatus?: PaymentStatus[];
  source?: BookingSource[];
  spaceId?: string;
  customerId?: string;
  /** Inclusive lower bound on `startsAt`. */
  from?: string;
  /** Exclusive upper bound on `startsAt`. */
  to?: string;
  q?: string;
}

export interface ApplicationFilters {
  status?: ListingStatus[];
  q?: string;
  city?: string;
  categoryId?: string;
}

export interface AdminStudioFilters {
  q?: string;
  city?: string;
  categoryId?: string;
  status?: ListingStatus[];
  published?: boolean;
  suspended?: boolean;
}

/** A row of `/admin/studios` — the marketplace inventory table. */
export interface AdminStudioRow {
  studio: Studio;
  categoryName: string;
  ownerName: string;
  ownerEmail: string;
  coverImage: StudioImage | null;
  spaceCount: number;
  bookingCount: number;
  revenue: number;
  ratingAverage: number | null;
  ratingCount: number;
}

/** A row of `/admin/users`. */
export interface AdminUserRow {
  user: UserAccount;
  organizations: Array<{ id: string; name: string; role: OrgRole }>;
  bookingCount: number;
  totalSpend: number;
}

export interface Pagination {
  page?: number;
  pageSize?: number;
}

export interface ApplicationEventInput {
  applicationId: string;
  organizationId: string;
  type: ApplicationEventType;
  actorId: string | null;
  actorName: string;
  message?: string | null;
}

export interface BookingEventInput {
  bookingId: string;
  organizationId: string;
  type: BookingEventType;
  actorId: string | null;
  actorName: string;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AdminActionInput {
  adminUserId: string;
  adminName: string;
  action: AdminActionType;
  entityType: AdminAction['entityType'];
  entityId: string;
  entityLabel: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  note?: string | null;
}

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
}

export interface CategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface AmenityInput {
  name: string;
  slug?: string;
  group: AmenityGroup;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * A pending possession challenge.
 *
 * Deliberately separate from `WhatsAppAccount`: the hash and the attempt
 * count are webhook business and have no reason to travel to a page, a
 * component, or a client bundle.
 */
export interface WhatsAppVerification {
  accountId: string;
  organizationId: string;
  phone: string;
  codeHash: string | null;
  expiresAt: string | null;
  attempts: number;
}

/** A stored, half-finished WhatsApp request awaiting one more answer. */
export interface WhatsAppConversation {
  organizationId: string;
  phone: string;
  /** The partial intent, merged with each reply. */
  intent: Record<string, unknown>;
  /** Which field the bot last asked about. */
  awaiting: string;
  expiresAt: string;
  updatedAt: string;
}

/* ── Contract ───────────────────────────────────────────────────── */

/**
 * The single seam between features and persistence.
 *
 * Feature code depends on this interface only. Two implementations
 * satisfy it — Supabase (live) and an in-memory demo store — and swapping
 * them is a configuration decision made once, in `lib/data/index.ts`.
 *
 * Note what is *not* here: no `approveStudio`, no `createBooking`. Those
 * are decisions, not storage, and they live in `lib/listing` and
 * `lib/booking` where their rules can be read in one place.
 */
export interface DataRepository {
  /* ── Identity ─────────────────────────────────────────────── */
  getUser(userId: string): Promise<UserAccount | null>;
  getUserByEmail(email: string): Promise<UserAccount | null>;
  createUser(input: CreateUserInput): Promise<UserAccount>;
  updateUser(userId: string, patch: UpdateUserInput): Promise<UserAccount>;
  setUserSuspended(userId: string, suspended: boolean): Promise<UserAccount>;
  listUsersForAdmin(
    options: Pagination & { q?: string; platformRole?: PlatformRole },
  ): Promise<Paginated<AdminUserRow>>;

  /* ── Organisations ────────────────────────────────────────── */
  getOrganization(organizationId: string): Promise<Organization | null>;
  createOrganization(name: string, ownerUserId: string): Promise<Organization>;
  listMembershipsForUser(
    userId: string,
  ): Promise<Array<OrganizationMember & { organizationName: string }>>;
  getMembership(organizationId: string, userId: string): Promise<OrganizationMember | null>;
  listMembers(organizationId: string): Promise<OrganizationMemberDetail[]>;
  addMember(organizationId: string, userId: string, role: OrgRole): Promise<OrganizationMember>;
  updateMemberRole(
    organizationId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrganizationMember>;
  removeMember(organizationId: string, userId: string): Promise<void>;

  /* ── Taxonomy ─────────────────────────────────────────────── */
  listCategories(options?: { includeInactive?: boolean }): Promise<Category[]>;
  getCategory(idOrSlug: string): Promise<Category | null>;
  createCategory(input: CategoryInput): Promise<Category>;
  updateCategory(id: string, patch: Partial<CategoryInput>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  listAmenities(options?: { includeInactive?: boolean }): Promise<Amenity[]>;
  createAmenity(input: AmenityInput): Promise<Amenity>;
  updateAmenity(id: string, patch: Partial<AmenityInput>): Promise<Amenity>;
  deleteAmenity(id: string): Promise<void>;

  /* ── Discovery (public — visibility enforced inside) ──────── */
  /**
   * Approved, published, unsuspended studios only. The predicate is
   * applied by the implementation, not by the caller, so there is no way
   * to forget it.
   */
  listPublicStudios(
    options: Pagination & { filters?: DiscoveryFilters },
  ): Promise<Paginated<StudioSummary>>;
  getPublicStudio(idOrSlug: string): Promise<StudioDetail | null>;
  listFeaturedStudios(limit: number): Promise<StudioSummary[]>;
  listPublicCities(): Promise<Array<{ city: string; count: number }>>;

  /* ── Studios (owner + admin; caller authorises) ───────────── */
  getStudio(studioId: string): Promise<StudioDetail | null>;
  getStudioBySlug(slug: string): Promise<StudioDetail | null>;
  listStudiosForOrganization(organizationId: string): Promise<StudioDetail[]>;
  createStudioDraft(organizationId: string, input: StudioDraftInput): Promise<StudioDetail>;
  updateStudio(studioId: string, patch: UpdateStudioInput): Promise<StudioDetail>;
  setStudioListingState(
    studioId: string,
    state: {
      status?: ListingStatus;
      isPublished?: boolean;
      isSuspended?: boolean;
      publishedAt?: string | null;
    },
  ): Promise<StudioDetail>;
  archiveStudio(studioId: string): Promise<void>;
  listStudiosForAdmin(
    options: Pagination & { filters?: AdminStudioFilters },
  ): Promise<Paginated<AdminStudioRow>>;

  /* ── Spaces ───────────────────────────────────────────────── */
  listSpaces(studioId: string): Promise<Space[]>;
  /**
   * Spaces for many studios at once. Discovery renders an availability
   * strip on every card, and doing that a studio at a time would be an
   * N+1 on the busiest page in the product.
   */
  listSpacesForStudios(studioIds: string[]): Promise<Space[]>;
  getSpace(spaceId: string): Promise<Space | null>;
  createSpace(studioId: string, input: SpaceInput): Promise<Space>;
  updateSpace(spaceId: string, patch: Partial<SpaceInput>): Promise<Space>;
  deleteSpace(spaceId: string): Promise<void>;

  /* ── Images ───────────────────────────────────────────────── */
  listStudioImages(studioId: string): Promise<StudioImage[]>;
  addStudioImage(studioId: string, input: StudioImageInput): Promise<StudioImage>;
  removeStudioImage(studioId: string, imageId: string): Promise<void>;
  setCoverImage(studioId: string, imageId: string): Promise<void>;

  /* ── Applications ─────────────────────────────────────────── */
  getApplication(applicationId: string): Promise<StudioApplication | null>;
  getApplicationForStudio(studioId: string): Promise<StudioApplication | null>;
  createApplication(organizationId: string, studioId: string): Promise<StudioApplication>;
  updateApplication(
    applicationId: string,
    patch: Partial<
      Pick<
        StudioApplication,
        'status' | 'submittedAt' | 'reviewedAt' | 'reviewedBy' | 'adminFeedback' | 'rejectionReason'
      >
    >,
  ): Promise<StudioApplication>;
  listApplicationsForAdmin(
    options: Pagination & { filters?: ApplicationFilters },
  ): Promise<Paginated<ApplicationSummary>>;
  getApplicationSummary(applicationId: string): Promise<ApplicationSummary | null>;
  appendApplicationEvent(input: ApplicationEventInput): Promise<StudioApplicationEvent>;
  listApplicationEvents(applicationId: string): Promise<StudioApplicationEvent[]>;

  /* ── Availability ─────────────────────────────────────────── */
  listAvailabilityRules(spaceIds: string[]): Promise<AvailabilityRule[]>;
  replaceAvailabilityRules(
    spaceId: string,
    rules: Array<Omit<AvailabilityRule, 'id' | 'organizationId' | 'spaceId'>>,
  ): Promise<AvailabilityRule[]>;
  listBlockedTimes(options: {
    spaceIds: string[];
    from?: string;
    to?: string;
  }): Promise<BlockedTime[]>;
  createBlockedTime(input: {
    spaceId: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
    createdBy: string | null;
  }): Promise<BlockedTime>;
  deleteBlockedTime(blockedTimeId: string): Promise<void>;

  /* ── Bookings ─────────────────────────────────────────────── */
  getBooking(bookingId: string): Promise<BookingDetail | null>;
  getBookingByReference(reference: string): Promise<BookingDetail | null>;
  listBookings(
    organizationId: string,
    options?: Pagination & { filters?: BookingFilters },
  ): Promise<Paginated<BookingDetail>>;
  /** Everything overlapping a window, for the calendar and the engine. */
  listBookingsInRange(options: {
    spaceIds: string[];
    from: string;
    to: string;
    statuses?: BookingStatus[];
  }): Promise<BookingDetail[]>;
  listBookingsForUser(userId: string): Promise<BookingDetail[]>;
  listBookingsForAdmin(
    options: Pagination & { filters?: BookingFilters & { q?: string } },
  ): Promise<Paginated<BookingDetail>>;

  /** @internal Only `lib/booking/engine.ts` may call this. */
  insertBooking(input: InsertBookingInput): Promise<Booking>;
  updateBooking(bookingId: string, patch: UpdateBookingInput): Promise<Booking>;
  appendBookingEvent(input: BookingEventInput): Promise<BookingEvent>;
  listBookingEvents(bookingId: string): Promise<BookingEvent[]>;

  /* ── Customers ────────────────────────────────────────────── */
  listCustomers(
    organizationId: string,
    options?: Pagination & { q?: string },
  ): Promise<Paginated<CustomerSummary>>;
  getCustomer(organizationId: string, customerId: string): Promise<CustomerSummary | null>;
  createCustomer(organizationId: string, input: CustomerInput): Promise<Customer>;
  updateCustomer(
    organizationId: string,
    customerId: string,
    patch: Partial<CustomerInput>,
  ): Promise<Customer>;
  /**
   * Matches on phone first, then email, then exact name — in that order,
   * because a phone number is the only one of the three a studio can
   * rely on being both present and unique.
   */
  findOrCreateCustomer(organizationId: string, input: CustomerInput): Promise<Customer>;
  searchCustomers(organizationId: string, query: string, limit?: number): Promise<Customer[]>;

  /* ── Reviews ──────────────────────────────────────────────── */
  listReviewsForStudio(studioId: string): Promise<Review[]>;
  createReview(input: {
    organizationId: string;
    studioId: string;
    bookingId: string;
    authorUserId: string;
    rating: number;
    body: string;
  }): Promise<Review>;

  /* ── Notifications ────────────────────────────────────────── */
  listNotifications(userId: string, limit?: number): Promise<AppNotification[]>;
  createNotification(input: NotificationInput): Promise<AppNotification>;
  markNotificationsRead(userId: string): Promise<void>;

  /* ── WhatsApp ─────────────────────────────────────────────── */
  /**
   * The identity lookup the webhook runs on every inbound message.
   *
   * Returns an account only when it is active *and* verified. An
   * unverified claim is somebody's assertion that they own a number;
   * until the possession challenge is completed it must not resolve to
   * an organisation, or the assertion becomes the authorisation.
   */
  getWhatsAppAccountByPhone(phone: string): Promise<WhatsAppAccount | null>;
  listWhatsAppAccounts(organizationId: string): Promise<WhatsAppAccount[]>;
  /**
   * Opens or replaces a possession challenge for a number.
   *
   * Takes over an existing claim only when it is unverified and lapsed,
   * or already belongs to this organisation. A verified number is never
   * reassigned — that would be the takeover this whole mechanism exists
   * to prevent.
   */
  startWhatsAppVerification(input: {
    organizationId: string;
    phone: string;
    displayName: string;
    codeHash: string;
    expiresAt: string;
  }): Promise<WhatsAppAccount>;
  /** The pending challenge for a number, with the material to check it. */
  getWhatsAppVerification(phone: string): Promise<WhatsAppVerification | null>;
  /** Counts a wrong guess. Bounded by the caller, recorded here. */
  recordWhatsAppVerificationAttempt(accountId: string): Promise<number>;
  /** Completes the challenge and discards the stored hash. */
  markWhatsAppAccountVerified(accountId: string): Promise<WhatsAppAccount>;
  setWhatsAppAccountActive(accountId: string, isActive: boolean): Promise<WhatsAppAccount>;
  /**
   * Records an inbound message *and* claims it for processing.
   *
   * Returns null when `externalId` has already been recorded, which is
   * how a retried Meta delivery is detected. The uniqueness is enforced
   * by the database rather than by a preceding read, so two concurrent
   * deliveries of the same message cannot both win.
   */
  claimInboundWhatsAppMessage(input: {
    organizationId: string;
    phone: string;
    body: string;
    externalId: string | null;
  }): Promise<WhatsAppMessage | null>;
  logWhatsAppMessage(input: {
    organizationId: string;
    direction: 'inbound' | 'outbound';
    phone: string;
    body: string;
    intent?: Record<string, unknown> | null;
    outcome?: WhatsAppOutcome | null;
    bookingId?: string | null;
    externalId?: string | null;
  }): Promise<WhatsAppMessage>;
  listWhatsAppMessages(organizationId: string, limit?: number): Promise<WhatsAppMessage[]>;
  getWhatsAppConversation(
    organizationId: string,
    phone: string,
  ): Promise<WhatsAppConversation | null>;
  saveWhatsAppConversation(conversation: WhatsAppConversation): Promise<void>;
  clearWhatsAppConversation(organizationId: string, phone: string): Promise<void>;

  /* ── Admin audit + analytics ──────────────────────────────── */
  recordAdminAction(input: AdminActionInput): Promise<AdminAction>;
  listAdminActions(
    options: Pagination & { entityId?: string; adminUserId?: string },
  ): Promise<Paginated<AdminAction>>;
  getMarketplaceStats(now?: Date): Promise<MarketplaceStats>;
  getStudioStats(organizationId: string, now?: Date): Promise<StudioStats>;
}

/** Thrown for expected, user-facing failures (not bugs). */
export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_found'
      | 'forbidden'
      | 'conflict'
      | 'validation'
      | 'unavailable' = 'unavailable',
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}
