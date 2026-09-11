import 'server-only';

import { checkRange, type AvailabilityContext } from '@/lib/booking/availability';
import {
  copy,
  copyAll,
  db,
  type DemoDatabase,
  type DemoWhatsAppAccount,
} from '@/lib/data/demo/store';
import {
  RepositoryError,
  type AdminActionInput,
  type AdminStudioFilters,
  type AdminStudioRow,
  type AdminUserRow,
  type AmenityInput,
  type ApplicationEventInput,
  type ApplicationFilters,
  type BookingEventInput,
  type BookingFilters,
  type CategoryInput,
  type CreateUserInput,
  type CustomerInput,
  type DataRepository,
  type InsertBookingInput,
  type NotificationInput,
  type Pagination,
  type SpaceInput,
  type StudioDraftInput,
  type StudioImageInput,
  type UpdateBookingInput,
  type UpdateStudioInput,
  type UpdateUserInput,
  type WhatsAppConversation,
  type WhatsAppVerification,
} from '@/lib/data/repository';
import { normalisePhone } from '@/lib/format';
import { newBookingReference, newId } from '@/lib/ids';
import { isPubliclyVisible } from '@/lib/listing/visibility';
import { todayInZone, zonedToInstant } from '@/lib/time';
import { slugify, sum, unique } from '@/lib/utils';
import type {
  AdminAction,
  Amenity,
  AppNotification,
  ApplicationSummary,
  AvailabilityRule,
  BlockedTime,
  Booking,
  BookingDetail,
  BookingEvent,
  BookingStatus,
  Category,
  Customer,
  CustomerSummary,
  DiscoveryFilters,
  ListingStatus,
  MarketplaceStats,
  Organization,
  OrganizationMember,
  OrganizationMemberDetail,
  OrgRole,
  Paginated,
  PlatformRole,
  Review,
  Space,
  Studio,
  StudioApplication,
  StudioApplicationEvent,
  StudioDetail,
  StudioImage,
  StudioStats,
  StudioSummary,
  UserAccount,
  WhatsAppAccount,
  WhatsAppMessage,
  WhatsAppOutcome,
} from '@/types/domain';
import { BLOCKING_BOOKING_STATUSES, DEFAULT_BOOKING_RULES } from '@/types/domain';

/**
 * The in-memory implementation of `DataRepository`.
 *
 * It does the joins, the tenant filtering and the visibility check by
 * hand, exactly where the Supabase implementation does them in SQL. That
 * symmetry is the point: if demo mode could show a draft studio on
 * `/discover` and production could not, demo mode would be worthless as a
 * way of checking that the marketplace behaves.
 */
export class DemoRepository implements DataRepository {
  private get data(): DemoDatabase {
    return db();
  }

  /* ── Identity ───────────────────────────────────────────────── */

  async getUser(userId: string): Promise<UserAccount | null> {
    return copy(this.data.users.find((user) => user.id === userId)) ?? null;
  }

  async getUserByEmail(email: string): Promise<UserAccount | null> {
    const normalised = email.trim().toLowerCase();
    return copy(this.data.users.find((user) => user.email.toLowerCase() === normalised)) ?? null;
  }

  async createUser(input: CreateUserInput): Promise<UserAccount> {
    const existing = await this.getUserByEmail(input.email);
    if (existing) {
      throw new RepositoryError('An account with that email already exists.', 'conflict');
    }

    const user: UserAccount = {
      id: newId('usr'),
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName.trim(),
      phone: input.phone ?? null,
      avatarUrl: input.avatarUrl ?? null,
      platformRole: input.platformRole ?? 'customer',
      createdAt: new Date().toISOString(),
      suspendedAt: null,
    };
    this.data.users.push(user);
    return copy(user);
  }

  async updateUser(userId: string, patch: UpdateUserInput): Promise<UserAccount> {
    const user = this.mustFind(this.data.users, (candidate) => candidate.id === userId, 'user');
    Object.assign(user, prune(patch));
    return copy(user);
  }

  async setUserSuspended(userId: string, suspended: boolean): Promise<UserAccount> {
    const user = this.mustFind(this.data.users, (candidate) => candidate.id === userId, 'user');
    user.suspendedAt = suspended ? new Date().toISOString() : null;
    return copy(user);
  }

  async listUsersForAdmin(
    options: Pagination & { q?: string; platformRole?: PlatformRole },
  ): Promise<Paginated<AdminUserRow>> {
    const query = options.q?.trim().toLowerCase();

    const rows = this.data.users
      .filter((user) => {
        if (options.platformRole && user.platformRole !== options.platformRole) return false;
        if (!query) return true;
        return (
          user.fullName.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          (user.phone ?? '').includes(query)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map<AdminUserRow>((user) => {
        const memberships = this.data.members.filter((member) => member.userId === user.id);
        const bookings = this.data.bookings.filter(
          (booking) => booking.customerUserId === user.id && booking.status !== 'cancelled',
        );
        return {
          user: copy(user),
          organizations: memberships.map((member) => ({
            id: member.organizationId,
            name:
              this.data.organizations.find((org) => org.id === member.organizationId)?.name ??
              'Unknown',
            role: member.role,
          })),
          bookingCount: bookings.length,
          totalSpend: sum(bookings.map((booking) => booking.priceAmount)),
        };
      });

    return paginate(rows, options);
  }

  /* ── Organisations ──────────────────────────────────────────── */

  async getOrganization(organizationId: string): Promise<Organization | null> {
    return copy(this.data.organizations.find((org) => org.id === organizationId)) ?? null;
  }

  async createOrganization(name: string, ownerUserId: string): Promise<Organization> {
    const organization: Organization = {
      id: newId('org'),
      name: name.trim(),
      ownerUserId,
      createdAt: new Date().toISOString(),
    };
    this.data.organizations.push(organization);
    this.data.members.push({
      organizationId: organization.id,
      userId: ownerUserId,
      role: 'owner',
      createdAt: organization.createdAt,
    });
    return copy(organization);
  }

  async listMembershipsForUser(
    userId: string,
  ): Promise<Array<OrganizationMember & { organizationName: string }>> {
    return this.data.members
      .filter((member) => member.userId === userId)
      .map((member) => ({
        ...copy(member),
        organizationName:
          this.data.organizations.find((org) => org.id === member.organizationId)?.name ?? 'Studio',
      }));
  }

  async getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null> {
    return (
      copy(
        this.data.members.find(
          (member) => member.organizationId === organizationId && member.userId === userId,
        ),
      ) ?? null
    );
  }

  async listMembers(organizationId: string): Promise<OrganizationMemberDetail[]> {
    return this.data.members
      .filter((member) => member.organizationId === organizationId)
      .map((member) => {
        const user = this.data.users.find((candidate) => candidate.id === member.userId);
        return {
          ...copy(member),
          fullName: user?.fullName ?? 'Unknown',
          email: user?.email ?? '',
          avatarUrl: user?.avatarUrl ?? null,
        };
      });
  }

  async addMember(
    organizationId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrganizationMember> {
    const existing = this.data.members.find(
      (member) => member.organizationId === organizationId && member.userId === userId,
    );
    if (existing) throw new RepositoryError('That person is already on the team.', 'conflict');

    const member: OrganizationMember = {
      organizationId,
      userId,
      role,
      createdAt: new Date().toISOString(),
    };
    this.data.members.push(member);
    return copy(member);
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrganizationMember> {
    const member = this.mustFind(
      this.data.members,
      (candidate) => candidate.organizationId === organizationId && candidate.userId === userId,
      'team member',
    );

    const organization = this.data.organizations.find((org) => org.id === organizationId);
    if (organization?.ownerUserId === userId && role !== 'owner') {
      throw new RepositoryError('The organisation owner cannot be demoted.', 'forbidden');
    }

    member.role = role;
    return copy(member);
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    const organization = this.data.organizations.find((org) => org.id === organizationId);
    if (organization?.ownerUserId === userId) {
      throw new RepositoryError('The organisation owner cannot be removed.', 'forbidden');
    }
    this.data.members = this.data.members.filter(
      (member) => !(member.organizationId === organizationId && member.userId === userId),
    );
  }

  /* ── Taxonomy ───────────────────────────────────────────────── */

  async listCategories(options?: { includeInactive?: boolean }): Promise<Category[]> {
    return this.data.categories
      .filter((category) => options?.includeInactive || category.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((category) => ({
        ...copy(category),
        studioCount: this.data.studios.filter(
          (studio) => studio.categoryId === category.id && isPubliclyVisible(studio),
        ).length,
      }));
  }

  async getCategory(idOrSlug: string): Promise<Category | null> {
    return (
      copy(
        this.data.categories.find(
          (category) => category.id === idOrSlug || category.slug === idOrSlug,
        ),
      ) ?? null
    );
  }

  async createCategory(input: CategoryInput): Promise<Category> {
    const slug = input.slug?.trim() || slugify(input.name);
    if (this.data.categories.some((category) => category.slug === slug)) {
      throw new RepositoryError('A category with that name already exists.', 'conflict');
    }
    const category: Category = {
      id: newId('cat'),
      slug,
      name: input.name.trim(),
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? this.data.categories.length,
    };
    this.data.categories.push(category);
    return copy(category);
  }

  async updateCategory(id: string, patch: Partial<CategoryInput>): Promise<Category> {
    const category = this.mustFind(
      this.data.categories,
      (candidate) => candidate.id === id,
      'category',
    );
    Object.assign(category, prune(patch));
    return copy(category);
  }

  async deleteCategory(id: string): Promise<void> {
    const inUse = this.data.studios.some((studio) => studio.categoryId === id);
    if (inUse) {
      throw new RepositoryError(
        'Studios are still listed under this category. Move them first, or deactivate it instead.',
        'conflict',
      );
    }
    this.data.categories = this.data.categories.filter((category) => category.id !== id);
  }

  async listAmenities(options?: { includeInactive?: boolean }): Promise<Amenity[]> {
    return this.data.amenities
      .filter((amenity) => options?.includeInactive || amenity.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((amenity) => ({
        ...copy(amenity),
        studioCount: this.data.spaces.filter((space) => space.amenitySlugs.includes(amenity.slug))
          .length,
      }));
  }

  async createAmenity(input: AmenityInput): Promise<Amenity> {
    const slug = input.slug?.trim() || slugify(input.name);
    if (this.data.amenities.some((amenity) => amenity.slug === slug)) {
      throw new RepositoryError('An amenity with that name already exists.', 'conflict');
    }
    const amenity: Amenity = {
      id: newId('amn'),
      slug,
      name: input.name.trim(),
      group: input.group,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? this.data.amenities.length,
    };
    this.data.amenities.push(amenity);
    return copy(amenity);
  }

  async updateAmenity(id: string, patch: Partial<AmenityInput>): Promise<Amenity> {
    const amenity = this.mustFind(
      this.data.amenities,
      (candidate) => candidate.id === id,
      'amenity',
    );
    Object.assign(amenity, prune(patch));
    return copy(amenity);
  }

  async deleteAmenity(id: string): Promise<void> {
    const amenity = this.data.amenities.find((candidate) => candidate.id === id);
    if (!amenity) return;
    for (const space of this.data.spaces) {
      space.amenitySlugs = space.amenitySlugs.filter((slug) => slug !== amenity.slug);
    }
    this.data.amenities = this.data.amenities.filter((candidate) => candidate.id !== id);
  }

  /* ── Discovery ──────────────────────────────────────────────── */

  /**
   * The public query. The visibility predicate is the first filter
   * applied and is not optional — there is no parameter that turns it
   * off, which is the whole point of having a separate public method.
   */
  async listPublicStudios(
    options: Pagination & { filters?: DiscoveryFilters },
  ): Promise<Paginated<StudioSummary>> {
    const filters = options.filters ?? {};
    let studios = this.data.studios.filter(isPubliclyVisible);

    const query = filters.q?.trim().toLowerCase();
    if (query) {
      studios = studios.filter((studio) => {
        const category = this.data.categories.find((c) => c.id === studio.categoryId);
        const haystack = [
          studio.name,
          studio.tagline ?? '',
          studio.description,
          studio.location.city,
          studio.location.area,
          category?.name ?? '',
          ...this.spacesOf(studio.id).map((space) => space.name),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    if (filters.city) {
      const city = filters.city.toLowerCase();
      studios = studios.filter((studio) => studio.location.city.toLowerCase() === city);
    }

    if (filters.categorySlug) {
      const category = this.data.categories.find((c) => c.slug === filters.categorySlug);
      studios = category ? studios.filter((studio) => studio.categoryId === category.id) : [];
    }

    let summaries = studios.map((studio) => this.toStudioSummary(studio));

    if (filters.minPrice != null) {
      summaries = summaries.filter((studio) => studio.priceFrom >= filters.minPrice!);
    }
    if (filters.maxPrice != null) {
      summaries = summaries.filter((studio) => studio.priceFrom <= filters.maxPrice!);
    }
    if (filters.minCapacity != null) {
      summaries = summaries.filter((studio) => studio.capacityMax >= filters.minCapacity!);
    }
    if (filters.amenitySlugs?.length) {
      summaries = summaries.filter((studio) =>
        filters.amenitySlugs!.every((slug) => studio.amenitySlugs.includes(slug)),
      );
    }
    if (filters.minRating != null) {
      summaries = summaries.filter(
        (studio) => (studio.ratingAverage ?? 0) >= filters.minRating!,
      );
    }

    if (filters.date && filters.startTime && filters.endTime) {
      const available = new Set(
        summaries
          .filter((summary) =>
            this.hasSpaceFreeAt(summary.id, filters.date!, filters.startTime!, filters.endTime!),
          )
          .map((summary) => summary.id),
      );
      summaries = summaries.filter((summary) => available.has(summary.id));
    }

    summaries.sort(comparatorFor(filters.sort ?? 'recommended'));

    return paginate(summaries, options);
  }

  async getPublicStudio(idOrSlug: string): Promise<StudioDetail | null> {
    const studio = this.data.studios.find(
      (candidate) => candidate.id === idOrSlug || candidate.slug === idOrSlug,
    );
    if (!studio || !isPubliclyVisible(studio)) return null;
    return this.toStudioDetail(studio);
  }

  async listFeaturedStudios(limit: number): Promise<StudioSummary[]> {
    return this.data.studios
      .filter((studio) => isPubliclyVisible(studio) && studio.isFeatured)
      .map((studio) => this.toStudioSummary(studio))
      .slice(0, limit);
  }

  async listPublicCities(): Promise<Array<{ city: string; count: number }>> {
    const counts = new Map<string, number>();
    for (const studio of this.data.studios) {
      if (!isPubliclyVisible(studio)) continue;
      counts.set(studio.location.city, (counts.get(studio.location.city) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
  }

  /* ── Studios ────────────────────────────────────────────────── */

  async getStudio(studioId: string): Promise<StudioDetail | null> {
    const studio = this.data.studios.find((candidate) => candidate.id === studioId);
    return studio ? this.toStudioDetail(studio) : null;
  }

  async getStudioBySlug(slug: string): Promise<StudioDetail | null> {
    const studio = this.data.studios.find((candidate) => candidate.slug === slug);
    return studio ? this.toStudioDetail(studio) : null;
  }

  async listStudiosForOrganization(organizationId: string): Promise<StudioDetail[]> {
    return this.data.studios
      .filter((studio) => studio.organizationId === organizationId)
      .map((studio) => this.toStudioDetail(studio));
  }

  async createStudioDraft(
    organizationId: string,
    input: StudioDraftInput,
  ): Promise<StudioDetail> {
    const now = new Date().toISOString();
    const studio: Studio = {
      id: newId('stu'),
      organizationId,
      slug: this.uniqueSlug(slugify(input.name)),
      name: input.name.trim(),
      tagline: input.tagline ?? null,
      description: input.description,
      categoryId: input.categoryId,
      location: input.location,
      timezone: input.timezone ?? 'Asia/Kolkata',
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      instagram: input.instagram ?? null,
      website: input.website ?? null,
      rules: input.rules ?? [],
      cancellationPolicy: input.cancellationPolicy ?? '',
      equipment: input.equipment ?? [],
      notes: input.notes ?? null,
      bookingRules: input.bookingRules ?? { ...DEFAULT_BOOKING_RULES },
      status: 'draft',
      isPublished: false,
      isSuspended: false,
      isFeatured: false,
      hasPendingChanges: false,
      pendingChanges: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.data.studios.push(studio);
    return this.toStudioDetail(studio);
  }

  async updateStudio(studioId: string, patch: UpdateStudioInput): Promise<StudioDetail> {
    const studio = this.mustFind(
      this.data.studios,
      (candidate) => candidate.id === studioId,
      'studio',
    );
    Object.assign(studio, prune(patch));
    studio.updatedAt = new Date().toISOString();
    return this.toStudioDetail(studio);
  }

  async setStudioListingState(
    studioId: string,
    state: {
      status?: ListingStatus;
      isPublished?: boolean;
      isSuspended?: boolean;
      publishedAt?: string | null;
    },
  ): Promise<StudioDetail> {
    const studio = this.mustFind(
      this.data.studios,
      (candidate) => candidate.id === studioId,
      'studio',
    );
    Object.assign(studio, prune(state));
    studio.updatedAt = new Date().toISOString();
    return this.toStudioDetail(studio);
  }

  async archiveStudio(studioId: string): Promise<void> {
    const studio = this.data.studios.find((candidate) => candidate.id === studioId);
    if (!studio) return;

    const hasFutureBookings = this.data.bookings.some(
      (booking) =>
        booking.studioId === studioId &&
        Date.parse(booking.startsAt) > Date.now() &&
        BLOCKING_BOOKING_STATUSES.includes(booking.status),
    );
    if (hasFutureBookings) {
      throw new RepositoryError(
        'This studio still has upcoming bookings. Cancel or complete them before archiving.',
        'conflict',
      );
    }

    studio.status = 'unpublished';
    studio.isPublished = false;
    studio.isSuspended = true;
    studio.updatedAt = new Date().toISOString();
  }

  async listStudiosForAdmin(
    options: Pagination & { filters?: AdminStudioFilters },
  ): Promise<Paginated<AdminStudioRow>> {
    const filters = options.filters ?? {};
    const query = filters.q?.trim().toLowerCase();

    const rows = this.data.studios
      .filter((studio) => {
        if (filters.status?.length && !filters.status.includes(studio.status)) return false;
        if (filters.city && studio.location.city !== filters.city) return false;
        if (filters.categoryId && studio.categoryId !== filters.categoryId) return false;
        if (filters.published != null && studio.isPublished !== filters.published) return false;
        if (filters.suspended != null && studio.isSuspended !== filters.suspended) return false;
        if (!query) return true;

        const owner = this.ownerOf(studio.organizationId);
        return [
          studio.name,
          studio.location.city,
          studio.location.area,
          owner?.fullName ?? '',
          owner?.email ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map<AdminStudioRow>((studio) => {
        const owner = this.ownerOf(studio.organizationId);
        const bookings = this.data.bookings.filter(
          (booking) => booking.studioId === studio.id && booking.status !== 'cancelled',
        );
        const reviews = this.data.reviews.filter((review) => review.studioId === studio.id);
        return {
          studio: copy(studio),
          categoryName:
            this.data.categories.find((category) => category.id === studio.categoryId)?.name ??
            'Uncategorised',
          ownerName: owner?.fullName ?? 'Unknown',
          ownerEmail: owner?.email ?? '',
          coverImage: this.coverOf(studio.id),
          spaceCount: this.spacesOf(studio.id).length,
          bookingCount: bookings.length,
          revenue: sum(bookings.map((booking) => booking.priceAmount)),
          ratingAverage: averageRating(reviews),
          ratingCount: reviews.length,
        };
      });

    return paginate(rows, options);
  }

  /* ── Spaces ─────────────────────────────────────────────────── */

  async listSpaces(studioId: string): Promise<Space[]> {
    return copyAll(this.spacesOf(studioId));
  }

  async listSpacesForStudios(studioIds: string[]): Promise<Space[]> {
    return copyAll(
      this.data.spaces
        .filter((space) => studioIds.includes(space.studioId))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
  }

  async getSpace(spaceId: string): Promise<Space | null> {
    return copy(this.data.spaces.find((space) => space.id === spaceId)) ?? null;
  }

  async createSpace(studioId: string, input: SpaceInput): Promise<Space> {
    const studio = this.mustFind(
      this.data.studios,
      (candidate) => candidate.id === studioId,
      'studio',
    );

    const space: Space = {
      id: newId('spc'),
      studioId,
      organizationId: studio.organizationId,
      name: input.name.trim(),
      description: input.description ?? null,
      capacity: input.capacity,
      sizeSqft: input.sizeSqft ?? null,
      hourlyRate: input.hourlyRate,
      halfDayRate: input.halfDayRate ?? null,
      fullDayRate: input.fullDayRate ?? null,
      currency: input.currency ?? 'INR',
      minBookingMinutes: input.minBookingMinutes ?? 60,
      bufferMinutes: input.bufferMinutes ?? 15,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? this.spacesOf(studioId).length,
      amenitySlugs: input.amenitySlugs ?? [],
    };
    this.data.spaces.push(space);

    // A space with no hours can never be booked, so a new one opens on
    // the studio's default week rather than silently being unbookable.
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      this.data.availabilityRules.push({
        id: newId('avr'),
        organizationId: studio.organizationId,
        spaceId: space.id,
        weekday: weekday as AvailabilityRule['weekday'],
        opensAt: '09:00',
        closesAt: '21:00',
        isClosed: false,
      });
    }

    return copy(space);
  }

  async updateSpace(spaceId: string, patch: Partial<SpaceInput>): Promise<Space> {
    const space = this.mustFind(this.data.spaces, (candidate) => candidate.id === spaceId, 'space');
    Object.assign(space, prune(patch));
    return copy(space);
  }

  async deleteSpace(spaceId: string): Promise<void> {
    const hasBookings = this.data.bookings.some(
      (booking) =>
        booking.spaceId === spaceId &&
        Date.parse(booking.startsAt) > Date.now() &&
        BLOCKING_BOOKING_STATUSES.includes(booking.status),
    );
    if (hasBookings) {
      throw new RepositoryError(
        'This space has upcoming bookings. Deactivate it instead, or move the bookings first.',
        'conflict',
      );
    }
    this.data.spaces = this.data.spaces.filter((space) => space.id !== spaceId);
    this.data.availabilityRules = this.data.availabilityRules.filter(
      (rule) => rule.spaceId !== spaceId,
    );
  }

  /* ── Images ─────────────────────────────────────────────────── */

  async listStudioImages(studioId: string): Promise<StudioImage[]> {
    return this.imagesOf(studioId);
  }

  async addStudioImage(studioId: string, input: StudioImageInput): Promise<StudioImage> {
    const existing = this.data.studioImages.filter((image) => image.studioId === studioId);
    const isCover = input.isCover ?? existing.length === 0;
    if (isCover) for (const image of existing) image.isCover = false;

    const image = {
      id: newId('img'),
      studioId,
      url: input.url,
      alt: input.alt,
      isCover,
      sortOrder: input.sortOrder ?? existing.length,
    };
    this.data.studioImages.push(image);
    const { studioId: _studioId, ...rest } = image;
    return rest;
  }

  async removeStudioImage(studioId: string, imageId: string): Promise<void> {
    const image = this.data.studioImages.find(
      (candidate) => candidate.id === imageId && candidate.studioId === studioId,
    );
    this.data.studioImages = this.data.studioImages.filter(
      (candidate) => !(candidate.id === imageId && candidate.studioId === studioId),
    );

    // Losing the cover silently would leave the listing with a blank card
    // on `/discover`, so the next image is promoted.
    if (image?.isCover) {
      const next = this.data.studioImages.find((candidate) => candidate.studioId === studioId);
      if (next) next.isCover = true;
    }
  }

  async setCoverImage(studioId: string, imageId: string): Promise<void> {
    for (const image of this.data.studioImages) {
      if (image.studioId !== studioId) continue;
      image.isCover = image.id === imageId;
    }
  }

  /* ── Applications ───────────────────────────────────────────── */

  async getApplication(applicationId: string): Promise<StudioApplication | null> {
    return (
      copy(this.data.applications.find((application) => application.id === applicationId)) ?? null
    );
  }

  async getApplicationForStudio(studioId: string): Promise<StudioApplication | null> {
    return (
      copy(this.data.applications.find((application) => application.studioId === studioId)) ?? null
    );
  }

  async createApplication(
    organizationId: string,
    studioId: string,
  ): Promise<StudioApplication> {
    const existing = this.data.applications.find(
      (application) => application.studioId === studioId,
    );
    if (existing) return copy(existing);

    const now = new Date().toISOString();
    const application: StudioApplication = {
      id: newId('app'),
      organizationId,
      studioId,
      status: 'draft',
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      adminFeedback: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.data.applications.push(application);
    return copy(application);
  }

  async updateApplication(
    applicationId: string,
    patch: Partial<StudioApplication>,
  ): Promise<StudioApplication> {
    const application = this.mustFind(
      this.data.applications,
      (candidate) => candidate.id === applicationId,
      'application',
    );
    Object.assign(application, prune(patch));
    application.updatedAt = new Date().toISOString();
    return copy(application);
  }

  async listApplicationsForAdmin(
    options: Pagination & { filters?: ApplicationFilters },
  ): Promise<Paginated<ApplicationSummary>> {
    const filters = options.filters ?? {};
    const query = filters.q?.trim().toLowerCase();

    const rows = this.data.applications
      .map((application) => this.toApplicationSummary(application))
      .filter((row): row is ApplicationSummary => row !== null)
      .filter((row) => {
        if (filters.status?.length && !filters.status.includes(row.application.status)) return false;
        if (filters.city && row.city !== filters.city) return false;
        if (!query) return true;
        return [row.studioName, row.ownerName, row.ownerEmail, row.ownerPhone ?? '', row.city, row.area]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        // The queue is ordered by what needs attention first, then by age.
        const weight = (status: ListingStatus) =>
          status === 'submitted' ? 0 : status === 'under_review' ? 1 : status === 'changes_requested' ? 2 : 3;
        const byWeight = weight(a.application.status) - weight(b.application.status);
        if (byWeight !== 0) return byWeight;
        return (b.application.submittedAt ?? b.application.createdAt).localeCompare(
          a.application.submittedAt ?? a.application.createdAt,
        );
      });

    return paginate(rows, options);
  }

  async getApplicationSummary(applicationId: string): Promise<ApplicationSummary | null> {
    const application = this.data.applications.find(
      (candidate) => candidate.id === applicationId,
    );
    return application ? this.toApplicationSummary(application) : null;
  }

  async appendApplicationEvent(input: ApplicationEventInput): Promise<StudioApplicationEvent> {
    const event: StudioApplicationEvent = {
      id: newId('ape'),
      applicationId: input.applicationId,
      organizationId: input.organizationId,
      type: input.type,
      actorId: input.actorId,
      actorName: input.actorName,
      message: input.message ?? null,
      createdAt: new Date().toISOString(),
    };
    this.data.applicationEvents.push(event);
    return copy(event);
  }

  async listApplicationEvents(applicationId: string): Promise<StudioApplicationEvent[]> {
    return this.data.applicationEvents
      .filter((event) => event.applicationId === applicationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((event) => copy(event));
  }

  /* ── Availability ───────────────────────────────────────────── */

  async listAvailabilityRules(spaceIds: string[]): Promise<AvailabilityRule[]> {
    return this.data.availabilityRules
      .filter((rule) => spaceIds.includes(rule.spaceId))
      .map((rule) => copy(rule));
  }

  async replaceAvailabilityRules(
    spaceId: string,
    rules: Array<Omit<AvailabilityRule, 'id' | 'organizationId' | 'spaceId'>>,
  ): Promise<AvailabilityRule[]> {
    const space = this.mustFind(
      this.data.spaces,
      (candidate) => candidate.id === spaceId,
      'space',
    );
    this.data.availabilityRules = this.data.availabilityRules.filter(
      (rule) => rule.spaceId !== spaceId,
    );
    const created = rules.map((rule) => ({
      id: newId('avr'),
      organizationId: space.organizationId,
      spaceId,
      ...rule,
    }));
    this.data.availabilityRules.push(...created);
    return copyAll(created);
  }

  async listBlockedTimes(options: {
    spaceIds: string[];
    from?: string;
    to?: string;
  }): Promise<BlockedTime[]> {
    return this.data.blockedTimes
      .filter((block) => options.spaceIds.includes(block.spaceId))
      .filter((block) => {
        if (options.from && block.endsAt <= options.from) return false;
        if (options.to && block.startsAt >= options.to) return false;
        return true;
      })
      .map((block) => copy(block));
  }

  async createBlockedTime(input: {
    spaceId: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
    createdBy: string | null;
  }): Promise<BlockedTime> {
    const space = this.mustFind(
      this.data.spaces,
      (candidate) => candidate.id === input.spaceId,
      'space',
    );
    const block: BlockedTime = {
      id: newId('blk'),
      organizationId: space.organizationId,
      spaceId: input.spaceId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.data.blockedTimes.push(block);
    return copy(block);
  }

  async deleteBlockedTime(blockedTimeId: string): Promise<void> {
    this.data.blockedTimes = this.data.blockedTimes.filter(
      (block) => block.id !== blockedTimeId,
    );
  }

  /* ── Bookings ───────────────────────────────────────────────── */

  async getBooking(bookingId: string): Promise<BookingDetail | null> {
    const booking = this.data.bookings.find((candidate) => candidate.id === bookingId);
    return booking ? this.toBookingDetail(booking) : null;
  }

  async getBookingByReference(reference: string): Promise<BookingDetail | null> {
    const booking = this.data.bookings.find(
      (candidate) => candidate.reference.toUpperCase() === reference.toUpperCase(),
    );
    return booking ? this.toBookingDetail(booking) : null;
  }

  async listBookings(
    organizationId: string,
    options: Pagination & { filters?: BookingFilters } = {},
  ): Promise<Paginated<BookingDetail>> {
    const rows = this.data.bookings
      .filter((booking) => booking.organizationId === organizationId)
      .filter((booking) => this.matchesBookingFilters(booking, options.filters))
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .map((booking) => this.toBookingDetail(booking));

    return paginate(rows, options);
  }

  async listBookingsInRange(options: {
    spaceIds: string[];
    from: string;
    to: string;
    statuses?: BookingStatus[];
  }): Promise<BookingDetail[]> {
    const statuses = options.statuses ?? BLOCKING_BOOKING_STATUSES;
    return this.data.bookings
      .filter(
        (booking) =>
          options.spaceIds.includes(booking.spaceId) &&
          statuses.includes(booking.status) &&
          booking.endsAt > options.from &&
          booking.startsAt < options.to,
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((booking) => this.toBookingDetail(booking));
  }

  async listBookingsForUser(userId: string): Promise<BookingDetail[]> {
    return this.data.bookings
      .filter((booking) => booking.customerUserId === userId)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .map((booking) => this.toBookingDetail(booking));
  }

  async listBookingsForAdmin(
    options: Pagination & { filters?: BookingFilters },
  ): Promise<Paginated<BookingDetail>> {
    const query = options.filters?.q?.trim().toLowerCase();
    const rows = this.data.bookings
      .filter((booking) => this.matchesBookingFilters(booking, options.filters))
      .filter((booking) => {
        if (!query) return true;
        const detail = this.toBookingDetail(booking);
        return [detail.reference, detail.customerName, detail.studioName, detail.spaceName]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .map((booking) => this.toBookingDetail(booking));

    return paginate(rows, options);
  }

  /**
   * The raw insert. Called only by the booking engine.
   *
   * The overlap check here is the demo-mode stand-in for the exclusion
   * constraint in Postgres: the engine has already checked availability,
   * and this is the backstop that makes the check true under a race.
   */
  async insertBooking(input: InsertBookingInput): Promise<Booking> {
    const clash = this.data.bookings.find(
      (booking) =>
        booking.spaceId === input.spaceId &&
        BLOCKING_BOOKING_STATUSES.includes(booking.status) &&
        booking.startsAt < input.endsAt &&
        input.startsAt < booking.endsAt,
    );
    if (clash) {
      throw new RepositoryError('That slot was taken a moment ago. Pick another time.', 'conflict');
    }

    const now = new Date().toISOString();
    const booking: Booking = {
      id: newId('bkg'),
      reference: this.uniqueReference(),
      ...input,
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      cancellationReason: null,
    };
    this.data.bookings.push(booking);
    return copy(booking);
  }

  async updateBooking(bookingId: string, patch: UpdateBookingInput): Promise<Booking> {
    const booking = this.mustFind(
      this.data.bookings,
      (candidate) => candidate.id === bookingId,
      'booking',
    );

    const movingInTime = patch.startsAt || patch.endsAt || patch.spaceId;
    if (movingInTime) {
      const spaceId = patch.spaceId ?? booking.spaceId;
      const startsAt = patch.startsAt ?? booking.startsAt;
      const endsAt = patch.endsAt ?? booking.endsAt;
      const clash = this.data.bookings.find(
        (candidate) =>
          candidate.id !== booking.id &&
          candidate.spaceId === spaceId &&
          BLOCKING_BOOKING_STATUSES.includes(candidate.status) &&
          candidate.startsAt < endsAt &&
          startsAt < candidate.endsAt,
      );
      if (clash) {
        throw new RepositoryError('Another booking already holds that slot.', 'conflict');
      }
    }

    Object.assign(booking, prune(patch));
    booking.updatedAt = new Date().toISOString();
    return copy(booking);
  }

  async appendBookingEvent(input: BookingEventInput): Promise<BookingEvent> {
    const event: BookingEvent = {
      id: newId('bev'),
      bookingId: input.bookingId,
      organizationId: input.organizationId,
      type: input.type,
      actorId: input.actorId,
      actorName: input.actorName,
      message: input.message ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date().toISOString(),
    };
    this.data.bookingEvents.push(event);
    return copy(event);
  }

  async listBookingEvents(bookingId: string): Promise<BookingEvent[]> {
    return this.data.bookingEvents
      .filter((event) => event.bookingId === bookingId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((event) => copy(event));
  }

  /* ── Customers ──────────────────────────────────────────────── */

  async listCustomers(
    organizationId: string,
    options: Pagination & { q?: string } = {},
  ): Promise<Paginated<CustomerSummary>> {
    const query = options.q?.trim().toLowerCase();
    const rows = this.data.customers
      .filter((customer) => customer.organizationId === organizationId)
      .filter((customer) => {
        if (!query) return true;
        return [customer.name, customer.phone ?? '', customer.email ?? '']
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .map((customer) => this.toCustomerSummary(customer))
      .sort((a, b) => (b.lastBookingAt ?? '').localeCompare(a.lastBookingAt ?? ''));

    return paginate(rows, options);
  }

  async getCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerSummary | null> {
    const customer = this.data.customers.find(
      (candidate) => candidate.id === customerId && candidate.organizationId === organizationId,
    );
    return customer ? this.toCustomerSummary(customer) : null;
  }

  async createCustomer(organizationId: string, input: CustomerInput): Promise<Customer> {
    const now = new Date().toISOString();
    const customer: Customer = {
      id: newId('cus'),
      organizationId,
      userId: input.userId ?? null,
      name: input.name.trim(),
      phone: normalisePhone(input.phone),
      email: input.email?.trim().toLowerCase() ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.data.customers.push(customer);
    return copy(customer);
  }

  async updateCustomer(
    organizationId: string,
    customerId: string,
    patch: Partial<CustomerInput>,
  ): Promise<Customer> {
    const customer = this.mustFind(
      this.data.customers,
      (candidate) => candidate.id === customerId && candidate.organizationId === organizationId,
      'customer',
    );
    Object.assign(customer, prune({ ...patch, phone: normalisePhone(patch.phone) }));
    customer.updatedAt = new Date().toISOString();
    return copy(customer);
  }

  /**
   * Phone, then email, then exact name — in that order, because a phone
   * number is the only one of the three a studio can rely on being both
   * present and unique. Matching on name alone would quietly merge two
   * different people called Rahul.
   */
  async findOrCreateCustomer(
    organizationId: string,
    input: CustomerInput,
  ): Promise<Customer> {
    const phone = normalisePhone(input.phone);
    const email = input.email?.trim().toLowerCase() ?? null;
    const scoped = this.data.customers.filter(
      (customer) => customer.organizationId === organizationId,
    );

    const existing =
      (input.userId ? scoped.find((customer) => customer.userId === input.userId) : undefined) ??
      (phone ? scoped.find((customer) => normalisePhone(customer.phone) === phone) : undefined) ??
      (email ? scoped.find((customer) => customer.email?.toLowerCase() === email) : undefined) ??
      scoped.find(
        (customer) => customer.name.toLowerCase() === input.name.trim().toLowerCase(),
      );

    if (existing) {
      // Fill in blanks the studio has since learned, without overwriting
      // anything they have deliberately typed.
      existing.phone ??= phone;
      existing.email ??= email;
      existing.userId ??= input.userId ?? null;
      existing.updatedAt = new Date().toISOString();
      return copy(existing);
    }

    return this.createCustomer(organizationId, input);
  }

  async searchCustomers(
    organizationId: string,
    query: string,
    limit = 8,
  ): Promise<Customer[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return this.data.customers
      .filter((customer) => customer.organizationId === organizationId)
      .filter((customer) =>
        [customer.name, customer.phone ?? '', customer.email ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, limit)
      .map((customer) => copy(customer));
  }

  /* ── Reviews ────────────────────────────────────────────────── */

  async listReviewsForStudio(studioId: string): Promise<Review[]> {
    return this.data.reviews
      .filter((review) => review.studioId === studioId && !review.isHidden)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((review) => copy(review));
  }

  async createReview(input: {
    organizationId: string;
    studioId: string;
    bookingId: string;
    authorUserId: string;
    rating: number;
    body: string;
  }): Promise<Review> {
    const booking = this.data.bookings.find((candidate) => candidate.id === input.bookingId);
    if (!booking || booking.customerUserId !== input.authorUserId) {
      throw new RepositoryError('You can only review a studio you have booked.', 'forbidden');
    }
    if (booking.status !== 'completed') {
      throw new RepositoryError('You can review a studio after your booking.', 'validation');
    }
    if (this.data.reviews.some((review) => review.bookingId === input.bookingId)) {
      throw new RepositoryError('You have already reviewed this booking.', 'conflict');
    }

    const author = this.data.users.find((user) => user.id === input.authorUserId);
    const review: Review = {
      id: newId('rev'),
      organizationId: input.organizationId,
      studioId: input.studioId,
      bookingId: input.bookingId,
      authorUserId: input.authorUserId,
      authorName: author?.fullName ?? 'A guest',
      rating: Math.max(1, Math.min(5, Math.round(input.rating))),
      body: input.body.trim(),
      createdAt: new Date().toISOString(),
      isHidden: false,
    };
    this.data.reviews.push(review);
    return copy(review);
  }

  /* ── Notifications ──────────────────────────────────────────── */

  async listNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
    return this.data.notifications
      .filter((notification) => notification.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((notification) => copy(notification));
  }

  async createNotification(input: NotificationInput): Promise<AppNotification> {
    const notification: AppNotification = {
      id: newId('ntf'),
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    this.data.notifications.push(notification);
    return copy(notification);
  }

  async markNotificationsRead(userId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const notification of this.data.notifications) {
      if (notification.userId === userId) notification.readAt ??= now;
    }
  }

  /* ── WhatsApp ───────────────────────────────────────────────── */

  async getWhatsAppAccountByPhone(phone: string): Promise<WhatsAppAccount | null> {
    const normalised = normalisePhone(phone);
    return (
      copy(
        this.data.whatsappAccounts.find(
          (account) =>
            normalisePhone(account.phone) === normalised &&
            account.isActive &&
            // An unverified claim is an assertion, not an identity.
            account.verifiedAt !== null,
        ),
      ) ?? null
    );
  }

  async listWhatsAppAccounts(organizationId: string): Promise<WhatsAppAccount[]> {
    return this.data.whatsappAccounts
      .filter((account) => account.organizationId === organizationId)
      .map((account) => copy(account));
  }

  async startWhatsAppVerification(input: {
    organizationId: string;
    phone: string;
    displayName: string;
    codeHash: string;
    expiresAt: string;
  }): Promise<WhatsAppAccount> {
    const phone = normalisePhone(input.phone);
    if (!phone) throw new RepositoryError('That does not look like a phone number.', 'validation');

    const existing = this.data.whatsappAccounts.find(
      (account) => normalisePhone(account.phone) === phone,
    );

    if (existing) {
      const mine = existing.organizationId === input.organizationId;

      if (existing.verifiedAt) {
        throw new RepositoryError(
          mine
            ? 'That number is already verified for this studio.'
            : 'That number is already connected to a studio.',
          'conflict',
        );
      }

      // A pending claim holds the number until it lapses, and no longer
      // — otherwise an abandoned attempt blocks the real owner forever.
      const heldByAnother =
        !mine &&
        existing.verificationExpiresAt != null &&
        Date.parse(existing.verificationExpiresAt) > Date.now();

      if (heldByAnother) {
        throw new RepositoryError(
          'Someone is already verifying that number. Try again in a few minutes.',
          'conflict',
        );
      }

      existing.organizationId = input.organizationId;
      existing.displayName = input.displayName;
      existing.isActive = true;
      existing.verificationCodeHash = input.codeHash;
      existing.verificationExpiresAt = input.expiresAt;
      existing.verificationAttempts = 0;
      return copy(existing);
    }

    const account: DemoWhatsAppAccount = {
      id: newId('wa'),
      organizationId: input.organizationId,
      phone,
      displayName: input.displayName,
      isActive: true,
      verifiedAt: null,
      createdAt: new Date().toISOString(),
      verificationCodeHash: input.codeHash,
      verificationExpiresAt: input.expiresAt,
      verificationAttempts: 0,
    };
    this.data.whatsappAccounts.push(account);
    return copy(account);
  }

  async getWhatsAppVerification(phone: string): Promise<WhatsAppVerification | null> {
    const normalised = normalisePhone(phone);
    const account = this.data.whatsappAccounts.find(
      (candidate) => normalisePhone(candidate.phone) === normalised && !candidate.verifiedAt,
    );
    if (!account) return null;

    return {
      accountId: account.id,
      organizationId: account.organizationId,
      phone: account.phone,
      codeHash: account.verificationCodeHash ?? null,
      expiresAt: account.verificationExpiresAt ?? null,
      attempts: account.verificationAttempts ?? 0,
    };
  }

  async recordWhatsAppVerificationAttempt(accountId: string): Promise<number> {
    const account = this.mustFind(
      this.data.whatsappAccounts,
      (candidate) => candidate.id === accountId,
      'WhatsApp number',
    );
    account.verificationAttempts = (account.verificationAttempts ?? 0) + 1;
    return account.verificationAttempts;
  }

  async markWhatsAppAccountVerified(accountId: string): Promise<WhatsAppAccount> {
    const account = this.mustFind(
      this.data.whatsappAccounts,
      (candidate) => candidate.id === accountId,
      'WhatsApp number',
    );
    account.verifiedAt = new Date().toISOString();
    account.isActive = true;
    // The challenge is spent; the hash has no reason to survive it.
    account.verificationCodeHash = null;
    account.verificationExpiresAt = null;
    account.verificationAttempts = 0;
    return copy(account);
  }

  /**
   * The idempotency claim.
   *
   * The check and the push happen in one synchronous stretch with no
   * await between them, so nothing can interleave — which is the
   * in-memory equivalent of the unique index doing the work in Postgres.
   */
  async claimInboundWhatsAppMessage(input: {
    organizationId: string;
    phone: string;
    body: string;
    externalId: string | null;
  }): Promise<WhatsAppMessage | null> {
    if (input.externalId) {
      const seen = this.data.whatsappMessages.some(
        (message) => message.externalId === input.externalId,
      );
      if (seen) return null;
    }

    const message: WhatsAppMessage = {
      id: newId('wam'),
      organizationId: input.organizationId,
      direction: 'inbound',
      phone: input.phone,
      body: input.body,
      intent: null,
      outcome: null,
      bookingId: null,
      externalId: input.externalId ?? null,
      createdAt: new Date().toISOString(),
    };
    this.data.whatsappMessages.push(message);
    return copy(message);
  }

  async setWhatsAppAccountActive(
    accountId: string,
    isActive: boolean,
  ): Promise<WhatsAppAccount> {
    const account = this.mustFind(
      this.data.whatsappAccounts,
      (candidate) => candidate.id === accountId,
      'WhatsApp number',
    );
    account.isActive = isActive;
    return copy(account);
  }

  async logWhatsAppMessage(input: {
    organizationId: string;
    direction: 'inbound' | 'outbound';
    phone: string;
    body: string;
    intent?: Record<string, unknown> | null;
    outcome?: WhatsAppOutcome | null;
    bookingId?: string | null;
    externalId?: string | null;
  }): Promise<WhatsAppMessage> {
    const message: WhatsAppMessage = {
      id: newId('wam'),
      organizationId: input.organizationId,
      direction: input.direction,
      phone: input.phone,
      body: input.body,
      intent: input.intent ?? null,
      outcome: input.outcome ?? null,
      bookingId: input.bookingId ?? null,
      externalId: input.externalId ?? null,
      createdAt: new Date().toISOString(),
    };
    this.data.whatsappMessages.push(message);
    return copy(message);
  }

  async listWhatsAppMessages(
    organizationId: string,
    limit = 50,
  ): Promise<WhatsAppMessage[]> {
    return this.data.whatsappMessages
      .filter((message) => message.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((message) => copy(message));
  }

  async getWhatsAppConversation(
    organizationId: string,
    phone: string,
  ): Promise<WhatsAppConversation | null> {
    const conversation = this.data.whatsappConversations.find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        normalisePhone(candidate.phone) === normalisePhone(phone),
    );
    if (!conversation) return null;
    if (Date.parse(conversation.expiresAt) < Date.now()) {
      await this.clearWhatsAppConversation(organizationId, phone);
      return null;
    }
    return copy(conversation);
  }

  async saveWhatsAppConversation(conversation: WhatsAppConversation): Promise<void> {
    await this.clearWhatsAppConversation(conversation.organizationId, conversation.phone);
    this.data.whatsappConversations.push(copy(conversation));
  }

  async clearWhatsAppConversation(organizationId: string, phone: string): Promise<void> {
    this.data.whatsappConversations = this.data.whatsappConversations.filter(
      (candidate) =>
        !(
          candidate.organizationId === organizationId &&
          normalisePhone(candidate.phone) === normalisePhone(phone)
        ),
    );
  }

  /* ── Admin audit + analytics ────────────────────────────────── */

  async recordAdminAction(input: AdminActionInput): Promise<AdminAction> {
    const action: AdminAction = {
      id: newId('adm'),
      adminUserId: input.adminUserId,
      adminName: input.adminName,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      previousState: input.previousState ?? null,
      newState: input.newState ?? null,
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
    };
    this.data.adminActions.push(action);
    return copy(action);
  }

  async listAdminActions(
    options: Pagination & { entityId?: string; adminUserId?: string },
  ): Promise<Paginated<AdminAction>> {
    const rows = this.data.adminActions
      .filter((action) => !options.entityId || action.entityId === options.entityId)
      .filter((action) => !options.adminUserId || action.adminUserId === options.adminUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((action) => copy(action));

    return paginate(rows, options);
  }

  async getMarketplaceStats(now: Date = new Date()): Promise<MarketplaceStats> {
    const studios = this.data.studios;
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();

    const countable = this.data.bookings.filter((booking) => booking.status !== 'cancelled');
    const decided = this.data.applications.filter((application) =>
      ['approved', 'rejected', 'suspended', 'unpublished'].includes(application.status),
    );
    const approved = decided.filter((application) => application.status !== 'rejected');

    const cityCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    for (const studio of studios) {
      if (!isPubliclyVisible(studio)) continue;
      cityCounts.set(studio.location.city, (cityCounts.get(studio.location.city) ?? 0) + 1);
      const category = this.data.categories.find((c) => c.id === studio.categoryId);
      if (category) {
        categoryCounts.set(category.name, (categoryCounts.get(category.name) ?? 0) + 1);
      }
    }

    return {
      totalStudios: studios.length,
      liveStudios: studios.filter(isPubliclyVisible).length,
      pendingApplications: this.data.applications.filter((application) =>
        ['submitted', 'under_review'].includes(application.status),
      ).length,
      changesRequested: this.data.applications.filter(
        (application) => application.status === 'changes_requested',
      ).length,
      suspendedStudios: studios.filter((studio) => studio.isSuspended).length,
      totalBookings: countable.length,
      bookingsThisMonth: countable.filter((booking) => booking.createdAt >= monthStart).length,
      grossRevenue: sum(countable.map((booking) => booking.priceAmount)),
      revenueThisMonth: sum(
        countable
          .filter((booking) => booking.startsAt >= monthStart)
          .map((booking) => booking.priceAmount),
      ),
      activeCustomers: unique(this.data.bookings.map((booking) => booking.customerId)).length,
      totalUsers: this.data.users.length,
      approvalRate: decided.length === 0 ? 0 : approved.length / decided.length,
      topCities: [...cityCounts.entries()]
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      topCategories: [...categoryCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }

  async getStudioStats(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<StudioStats> {
    const studios = this.data.studios.filter(
      (studio) => studio.organizationId === organizationId,
    );
    const timezone = studios[0]?.timezone ?? 'Asia/Kolkata';
    const today = todayInZone(timezone, now);

    const dayStart = zonedToInstant(today, '00:00', timezone).toISOString();
    const dayEnd = new Date(Date.parse(dayStart) + 86_400_000).toISOString();
    const weekStart = new Date(Date.parse(dayStart) - 6 * 86_400_000).toISOString();
    const monthStart = new Date(Date.parse(dayStart) - 29 * 86_400_000).toISOString();

    const bookings = this.data.bookings.filter(
      (booking) => booking.organizationId === organizationId && booking.status !== 'cancelled',
    );

    const todayBookings = bookings.filter(
      (booking) => booking.startsAt >= dayStart && booking.startsAt < dayEnd,
    );
    const upcoming = bookings.filter(
      (booking) => booking.startsAt >= now.toISOString() && booking.status !== 'completed',
    );
    const unpaid = bookings.filter(
      (booking) => booking.paymentStatus === 'unpaid' || booking.paymentStatus === 'partial',
    );

    /* Occupancy: booked hours over open hours, across the last 7 days. */
    const spaces = this.data.spaces.filter(
      (space) => space.organizationId === organizationId && space.isActive,
    );
    const openHoursPerDay = sum(
      spaces.map((space) => {
        const rules = this.data.availabilityRules.filter((rule) => rule.spaceId === space.id);
        const openDays = rules.filter((rule) => !rule.isClosed);
        if (openDays.length === 0) return 0;
        const averageHours =
          sum(
            openDays.map((rule) => {
              const opens = Number(rule.opensAt.slice(0, 2));
              const closes = Number(rule.closesAt.slice(0, 2));
              return Math.max(0, closes - opens);
            }),
          ) / openDays.length;
        return (averageHours * openDays.length) / 7;
      }),
    );

    const weekBooked = sum(
      bookings
        .filter((booking) => booking.startsAt >= weekStart && booking.startsAt < dayEnd)
        .map((booking) => (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 3_600_000),
    );

    return {
      todayBookings: todayBookings.length,
      todayRevenue: sum(todayBookings.map((booking) => booking.priceAmount)),
      weekRevenue: sum(
        bookings
          .filter((booking) => booking.startsAt >= weekStart && booking.startsAt < dayEnd)
          .map((booking) => booking.priceAmount),
      ),
      monthRevenue: sum(
        bookings
          .filter((booking) => booking.startsAt >= monthStart && booking.startsAt < dayEnd)
          .map((booking) => booking.priceAmount),
      ),
      upcomingBookings: upcoming.length,
      occupancyRate:
        openHoursPerDay === 0 ? 0 : Math.min(1, weekBooked / (openHoursPerDay * 7)),
      pendingPayments: unpaid.length,
      pendingPaymentAmount: sum(unpaid.map((booking) => booking.priceAmount)),
      activeCustomers: unique(
        bookings
          .filter((booking) => booking.startsAt >= monthStart)
          .map((booking) => booking.customerId),
      ).length,
    };
  }

  /* ── Mappers and helpers ────────────────────────────────────── */

  private spacesOf(studioId: string): Space[] {
    return this.data.spaces
      .filter((space) => space.studioId === studioId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private imagesOf(studioId: string): StudioImage[] {
    return this.data.studioImages
      .filter((image) => image.studioId === studioId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ studioId: _studioId, ...image }) => image);
  }

  private coverOf(studioId: string): StudioImage | null {
    const images = this.imagesOf(studioId);
    return images.find((image) => image.isCover) ?? images[0] ?? null;
  }

  private ownerOf(organizationId: string): UserAccount | undefined {
    const organization = this.data.organizations.find((org) => org.id === organizationId);
    return this.data.users.find((user) => user.id === organization?.ownerUserId);
  }

  private toStudioSummary(studio: Studio): StudioSummary {
    const spaces = this.spacesOf(studio.id);
    const category = this.data.categories.find((c) => c.id === studio.categoryId);
    const reviews = this.data.reviews.filter((review) => review.studioId === studio.id);

    return {
      id: studio.id,
      slug: studio.slug,
      name: studio.name,
      tagline: studio.tagline,
      city: studio.location.city,
      area: studio.location.area,
      timezone: studio.timezone,
      category: {
        id: category?.id ?? studio.categoryId,
        slug: category?.slug ?? 'other',
        name: category?.name ?? 'Studio',
      },
      coverImage: this.coverOf(studio.id),
      priceFrom: spaces.length === 0 ? 0 : Math.min(...spaces.map((space) => space.hourlyRate)),
      capacityMax: spaces.length === 0 ? 0 : Math.max(...spaces.map((space) => space.capacity)),
      spaceCount: spaces.length,
      amenitySlugs: unique(spaces.flatMap((space) => space.amenitySlugs)),
      ratingAverage: averageRating(reviews),
      ratingCount: reviews.length,
      bookingCount: this.data.bookings.filter(
        (booking) => booking.studioId === studio.id && booking.status !== 'cancelled',
      ).length,
      isFeatured: studio.isFeatured,
      createdAt: studio.createdAt,
    };
  }

  private toStudioDetail(studio: Studio): StudioDetail {
    const spaces = this.spacesOf(studio.id);
    const category = this.data.categories.find((c) => c.id === studio.categoryId);
    const organization = this.data.organizations.find(
      (org) => org.id === studio.organizationId,
    );
    const reviews = this.data.reviews.filter((review) => review.studioId === studio.id);
    const amenitySlugs = unique(spaces.flatMap((space) => space.amenitySlugs));

    return {
      ...copy(studio),
      category: category
        ? copy(category)
        : {
            id: studio.categoryId,
            slug: 'other',
            name: 'Studio',
            description: null,
            isActive: true,
            sortOrder: 99,
          },
      images: this.imagesOf(studio.id),
      coverImage: this.coverOf(studio.id),
      spaces: copyAll(spaces),
      amenities: this.data.amenities
        .filter((amenity) => amenitySlugs.includes(amenity.slug))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((amenity) => copy(amenity)),
      host: {
        organizationId: studio.organizationId,
        organizationName: organization?.name ?? 'Studio host',
        memberSince: organization?.createdAt ?? studio.createdAt,
      },
      ratingAverage: averageRating(reviews),
      ratingCount: reviews.length,
      bookingCount: this.data.bookings.filter(
        (booking) => booking.studioId === studio.id && booking.status !== 'cancelled',
      ).length,
    };
  }

  private toBookingDetail(booking: Booking): BookingDetail {
    const customer = this.data.customers.find(
      (candidate) => candidate.id === booking.customerId,
    );
    const space = this.data.spaces.find((candidate) => candidate.id === booking.spaceId);
    const studio = this.data.studios.find((candidate) => candidate.id === booking.studioId);

    return {
      ...copy(booking),
      customerName: customer?.name ?? 'Unknown',
      customerPhone: customer?.phone ?? null,
      customerEmail: customer?.email ?? null,
      spaceName: space?.name ?? 'Space',
      studioName: studio?.name ?? 'Studio',
      studioSlug: studio?.slug ?? '',
      studioCity: studio?.location.city ?? '',
      timezone: studio?.timezone ?? 'Asia/Kolkata',
    };
  }

  private toCustomerSummary(customer: Customer): CustomerSummary {
    const bookings = this.data.bookings.filter(
      (booking) =>
        booking.customerId === customer.id &&
        booking.organizationId === customer.organizationId &&
        booking.status !== 'cancelled',
    );
    const now = new Date().toISOString();
    const past = bookings.filter((booking) => booking.startsAt < now);
    const future = bookings.filter((booking) => booking.startsAt >= now);

    return {
      ...copy(customer),
      totalBookings: bookings.length,
      totalSpend: sum(bookings.map((booking) => booking.priceAmount)),
      lastBookingAt:
        past.sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]?.startsAt ?? null,
      nextBookingAt:
        future.sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]?.startsAt ?? null,
    };
  }

  private toApplicationSummary(application: StudioApplication): ApplicationSummary | null {
    const studio = this.data.studios.find(
      (candidate) => candidate.id === application.studioId,
    );
    if (!studio) return null;

    const owner = this.ownerOf(studio.organizationId);
    const category = this.data.categories.find((c) => c.id === studio.categoryId);

    return {
      application: copy(application),
      studioId: studio.id,
      studioName: studio.name,
      studioSlug: studio.slug,
      categoryName: category?.name ?? 'Uncategorised',
      city: studio.location.city,
      area: studio.location.area,
      ownerName: owner?.fullName ?? 'Unknown',
      ownerEmail: owner?.email ?? '',
      ownerPhone: owner?.phone ?? null,
      coverImage: this.coverOf(studio.id),
      spaceCount: this.spacesOf(studio.id).length,
    };
  }

  /** Whether any space in a studio is free for a requested local window. */
  private hasSpaceFreeAt(
    studioId: string,
    date: string,
    startTime: string,
    endTime: string,
  ): boolean {
    const studio = this.data.studios.find((candidate) => candidate.id === studioId);
    if (!studio) return false;

    const startsAt = zonedToInstant(date, startTime, studio.timezone).toISOString();
    const endsAt = zonedToInstant(date, endTime, studio.timezone).toISOString();

    return this.spacesOf(studioId).some((space) => {
      const context: AvailabilityContext = {
        space,
        timezone: studio.timezone,
        rules: this.data.availabilityRules.filter((rule) => rule.spaceId === space.id),
        blocked: this.data.blockedTimes.filter((block) => block.spaceId === space.id),
        bookings: this.data.bookings.filter((booking) => booking.spaceId === space.id),
        bookingRules: studio.bookingRules,
        now: new Date(),
      };
      return checkRange(context, startsAt, endsAt).ok;
    });
  }

  private matchesBookingFilters(booking: Booking, filters?: BookingFilters): boolean {
    if (!filters) return true;
    if (filters.status?.length && !filters.status.includes(booking.status)) return false;
    if (filters.paymentStatus?.length && !filters.paymentStatus.includes(booking.paymentStatus)) {
      return false;
    }
    if (filters.source?.length && !filters.source.includes(booking.source)) return false;
    if (filters.spaceId && booking.spaceId !== filters.spaceId) return false;
    if (filters.customerId && booking.customerId !== filters.customerId) return false;
    if (filters.from && booking.startsAt < filters.from) return false;
    if (filters.to && booking.startsAt >= filters.to) return false;
    return true;
  }

  private uniqueSlug(base: string): string {
    let slug = base || 'studio';
    let suffix = 2;
    while (this.data.studios.some((studio) => studio.slug === slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }

  private uniqueReference(): string {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const reference = newBookingReference();
      if (!this.data.bookings.some((booking) => booking.reference === reference)) return reference;
    }
    throw new RepositoryError('Could not allocate a booking reference.', 'unavailable');
  }

  private mustFind<T>(collection: T[], predicate: (item: T) => boolean, label: string): T {
    const found = collection.find(predicate);
    if (!found) throw new RepositoryError(`That ${label} no longer exists.`, 'not_found');
    return found;
  }
}

/* ── Module helpers ─────────────────────────────────────────────── */

/** Drops `undefined` so a patch never blanks a column it did not mention. */
function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function paginate<T>(rows: T[], options: Pagination): Paginated<T> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 24));
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  return {
    items,
    total: rows.length,
    page,
    pageSize,
    hasMore: start + items.length < rows.length,
  };
}

function averageRating(reviews: Review[]): number | null {
  if (reviews.length === 0) return null;
  return sum(reviews.map((review) => review.rating)) / reviews.length;
}

function comparatorFor(sort: NonNullable<DiscoveryFilters['sort']>) {
  return (a: StudioSummary, b: StudioSummary): number => {
    switch (sort) {
      case 'price_asc':
        return a.priceFrom - b.priceFrom;
      case 'price_desc':
        return b.priceFrom - a.priceFrom;
      case 'rating':
        return (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0);
      case 'newest':
        return b.createdAt.localeCompare(a.createdAt);
      case 'most_booked':
        return b.bookingCount - a.bookingCount;
      default:
        // Recommended: featured first, then a blend of rating and volume,
        // so a good new studio is not buried under an old busy one.
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return score(b) - score(a);
    }
  };
}

function score(studio: StudioSummary): number {
  const rating = studio.ratingAverage ?? 3.8;
  return rating * 10 + Math.log1p(studio.bookingCount) * 4;
}
