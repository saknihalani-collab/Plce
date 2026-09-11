import 'server-only';

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

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
import { newBookingReference } from '@/lib/ids';
import { slugify, sum, unique } from '@/lib/utils';
import { todayInZone, zonedToInstant } from '@/lib/time';
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
import { BLOCKING_BOOKING_STATUSES } from '@/types/domain';

/**
 * The Postgres implementation of `DataRepository`.
 *
 * Two things to know when reading it:
 *
 * 1. Rows are mapped explicitly rather than spread. The database speaks
 *    snake_case and the domain speaks camelCase, and a mapping function
 *    per table is the seam where that translation is allowed to happen —
 *    so a column rename is a compile error here rather than an undefined
 *    somewhere in a component.
 *
 * 2. Authorisation is not re-implemented. The client carries the user's
 *    JWT and RLS evaluates every statement, so "return nothing" and
 *    "throw forbidden" are decisions Postgres has already made by the
 *    time these methods see a result. The application-side checks in
 *    `lib/auth/session.ts` exist for good error messages, not for safety.
 */

/* ── Selects ────────────────────────────────────────────────────── */

const STUDIO_SELECT = `
  *,
  category:categories(*),
  images:studio_images(*),
  spaces:spaces(*, space_amenities(amenities(slug))),
  organization:organizations(id, name, created_at)
`;

const BOOKING_SELECT = `
  *,
  customer:customers(name, phone, email),
  space:spaces(name),
  studio:studios(name, slug, city, timezone)
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export class SupabaseRepository implements DataRepository {
  constructor(private readonly client: SupabaseClient) {}

  /* ── Identity ───────────────────────────────────────────────── */

  async getUser(userId: string): Promise<UserAccount | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    throwIfError(error);
    return data ? toUser(data) : null;
  }

  async getUserByEmail(email: string): Promise<UserAccount | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    throwIfError(error);
    return data ? toUser(data) : null;
  }

  async createUser(input: CreateUserInput): Promise<UserAccount> {
    // In live mode the profile row is created by the `handle_new_user`
    // trigger the moment the credential exists, so this is an upsert of
    // the details the trigger could not know rather than an insert.
    const { data, error } = await this.client
      .from('users')
      .upsert(
        {
          email: input.email.trim().toLowerCase(),
          full_name: input.fullName.trim(),
          phone: input.phone ?? null,
          avatar_url: input.avatarUrl ?? null,
        },
        { onConflict: 'email' },
      )
      .select('*')
      .single();
    throwIfError(error);
    return toUser(data!);
  }

  async updateUser(userId: string, patch: UpdateUserInput): Promise<UserAccount> {
    const { data, error } = await this.client
      .from('users')
      .update(
        prune({
          full_name: patch.fullName,
          phone: patch.phone,
          avatar_url: patch.avatarUrl,
          platform_role: patch.platformRole,
        }),
      )
      .eq('id', userId)
      .select('*')
      .single();
    throwIfError(error);
    return toUser(data!);
  }

  async setUserSuspended(userId: string, suspended: boolean): Promise<UserAccount> {
    const { data, error } = await this.client
      .from('users')
      .update({ suspended_at: suspended ? new Date().toISOString() : null })
      .eq('id', userId)
      .select('*')
      .single();
    throwIfError(error);
    return toUser(data!);
  }

  async listUsersForAdmin(
    options: Pagination & { q?: string; platformRole?: PlatformRole },
  ): Promise<Paginated<AdminUserRow>> {
    const { from, to, page, pageSize } = range(options);

    let query = this.client
      .from('users')
      .select('*, organization_members(role, organization:organizations(id, name))', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (options.platformRole) query = query.eq('platform_role', options.platformRole);
    if (options.q?.trim()) {
      const term = `%${options.q.trim()}%`;
      query = query.or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
    }

    const { data, error, count } = await query;
    throwIfError(error);

    const rows = (data ?? []) as Row[];
    const userIds = rows.map((row) => row.id as string);
    const spend = await this.spendByUser(userIds);

    return paginated(
      rows.map<AdminUserRow>((row) => ({
        user: toUser(row),
        organizations: (row.organization_members ?? []).map((member: Row) => ({
          id: member.organization?.id ?? '',
          name: member.organization?.name ?? 'Studio',
          role: member.role as OrgRole,
        })),
        bookingCount: spend.get(row.id)?.count ?? 0,
        totalSpend: spend.get(row.id)?.total ?? 0,
      })),
      count ?? 0,
      page,
      pageSize,
    );
  }

  private async spendByUser(
    userIds: string[],
  ): Promise<Map<string, { count: number; total: number }>> {
    const totals = new Map<string, { count: number; total: number }>();
    if (userIds.length === 0) return totals;

    const { data, error } = await this.client
      .from('bookings')
      .select('customer_user_id, price_amount')
      .in('customer_user_id', userIds)
      .neq('status', 'cancelled');
    throwIfError(error);

    for (const row of (data ?? []) as Row[]) {
      const key = row.customer_user_id as string;
      const current = totals.get(key) ?? { count: 0, total: 0 };
      totals.set(key, {
        count: current.count + 1,
        total: current.total + (row.price_amount ?? 0),
      });
    }
    return totals;
  }

  /* ── Organisations ──────────────────────────────────────────── */

  async getOrganization(organizationId: string): Promise<Organization | null> {
    const { data, error } = await this.client
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();
    throwIfError(error);
    return data ? toOrganization(data) : null;
  }

  async createOrganization(name: string, ownerUserId: string): Promise<Organization> {
    const { data, error } = await this.client
      .from('organizations')
      .insert({ name: name.trim(), owner_user_id: ownerUserId })
      .select('*')
      .single();
    throwIfError(error);

    const { error: memberError } = await this.client
      .from('organization_members')
      .insert({ organization_id: data!.id, user_id: ownerUserId, role: 'owner' });
    throwIfError(memberError);

    return toOrganization(data!);
  }

  async listMembershipsForUser(
    userId: string,
  ): Promise<Array<OrganizationMember & { organizationName: string }>> {
    const { data, error } = await this.client
      .from('organization_members')
      .select('*, organization:organizations(name)')
      .eq('user_id', userId);
    throwIfError(error);

    return ((data ?? []) as Row[]).map((row) => ({
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role as OrgRole,
      createdAt: row.created_at,
      organizationName: row.organization?.name ?? 'Studio',
    }));
  }

  async getMembership(organizationId: string, userId: string): Promise<OrganizationMember | null> {
    const { data, error } = await this.client
      .from('organization_members')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();
    throwIfError(error);
    return data
      ? {
          organizationId: data.organization_id,
          userId: data.user_id,
          role: data.role,
          createdAt: data.created_at,
        }
      : null;
  }

  async listMembers(organizationId: string): Promise<OrganizationMemberDetail[]> {
    const { data, error } = await this.client
      .from('organization_members')
      .select('*, user:users(full_name, email, avatar_url)')
      .eq('organization_id', organizationId);
    throwIfError(error);

    return ((data ?? []) as Row[]).map((row) => ({
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role as OrgRole,
      createdAt: row.created_at,
      fullName: row.user?.full_name ?? 'Unknown',
      email: row.user?.email ?? '',
      avatarUrl: row.user?.avatar_url ?? null,
    }));
  }

  async addMember(
    organizationId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrganizationMember> {
    const { data, error } = await this.client
      .from('organization_members')
      .insert({ organization_id: organizationId, user_id: userId, role })
      .select('*')
      .single();
    throwIfError(error);
    return {
      organizationId: data!.organization_id,
      userId: data!.user_id,
      role: data!.role,
      createdAt: data!.created_at,
    };
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrganizationMember> {
    const { data, error } = await this.client
      .from('organization_members')
      .update({ role })
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .select('*')
      .single();
    throwIfError(error);
    return {
      organizationId: data!.organization_id,
      userId: data!.user_id,
      role: data!.role,
      createdAt: data!.created_at,
    };
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from('organization_members')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', userId);
    throwIfError(error);
  }

  /* ── Taxonomy ───────────────────────────────────────────────── */

  async listCategories(options?: { includeInactive?: boolean }): Promise<Category[]> {
    let query = this.client.from('categories').select('*').order('sort_order');
    if (!options?.includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toCategory);
  }

  async getCategory(idOrSlug: string): Promise<Category | null> {
    const column = isUuid(idOrSlug) ? 'id' : 'slug';
    const { data, error } = await this.client
      .from('categories')
      .select('*')
      .eq(column, idOrSlug)
      .maybeSingle();
    throwIfError(error);
    return data ? toCategory(data) : null;
  }

  async createCategory(input: CategoryInput): Promise<Category> {
    const { data, error } = await this.client
      .from('categories')
      .insert({
        slug: input.slug?.trim() || slugify(input.name),
        name: input.name.trim(),
        description: input.description ?? null,
        is_active: input.isActive ?? true,
        sort_order: input.sortOrder ?? 0,
      })
      .select('*')
      .single();
    throwIfError(error, 'A category with that name already exists.');
    return toCategory(data!);
  }

  async updateCategory(id: string, patch: Partial<CategoryInput>): Promise<Category> {
    const { data, error } = await this.client
      .from('categories')
      .update(
        prune({
          name: patch.name?.trim(),
          slug: patch.slug,
          description: patch.description,
          is_active: patch.isActive,
          sort_order: patch.sortOrder,
        }),
      )
      .eq('id', id)
      .select('*')
      .single();
    throwIfError(error);
    return toCategory(data!);
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await this.client.from('categories').delete().eq('id', id);
    throwIfError(
      error,
      'Studios are still listed under this category. Move them first, or deactivate it instead.',
    );
  }

  async listAmenities(options?: { includeInactive?: boolean }): Promise<Amenity[]> {
    let query = this.client.from('amenities').select('*').order('sort_order');
    if (!options?.includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toAmenity);
  }

  async createAmenity(input: AmenityInput): Promise<Amenity> {
    const { data, error } = await this.client
      .from('amenities')
      .insert({
        slug: input.slug?.trim() || slugify(input.name),
        name: input.name.trim(),
        group: input.group,
        is_active: input.isActive ?? true,
        sort_order: input.sortOrder ?? 0,
      })
      .select('*')
      .single();
    throwIfError(error, 'An amenity with that name already exists.');
    return toAmenity(data!);
  }

  async updateAmenity(id: string, patch: Partial<AmenityInput>): Promise<Amenity> {
    const { data, error } = await this.client
      .from('amenities')
      .update(
        prune({
          name: patch.name?.trim(),
          slug: patch.slug,
          group: patch.group,
          is_active: patch.isActive,
          sort_order: patch.sortOrder,
        }),
      )
      .eq('id', id)
      .select('*')
      .single();
    throwIfError(error);
    return toAmenity(data!);
  }

  async deleteAmenity(id: string): Promise<void> {
    const { error } = await this.client.from('amenities').delete().eq('id', id);
    throwIfError(error);
  }

  /* ── Discovery ──────────────────────────────────────────────── */

  /**
   * The public query.
   *
   * The visibility predicate is stated here *as well as* in the RLS
   * policy. Belt and braces on purpose: the policy is what makes it
   * impossible, and this is what makes it obvious to the next person
   * reading the query.
   */
  async listPublicStudios(
    options: Pagination & { filters?: DiscoveryFilters },
  ): Promise<Paginated<StudioSummary>> {
    const filters = options.filters ?? {};

    let query = this.client
      .from('studios')
      .select(`*, category:categories(id, slug, name), images:studio_images(*)`, {
        count: 'exact',
      })
      .eq('status', 'approved')
      .eq('is_published', true)
      .eq('is_suspended', false)
      .is('archived_at', null);

    if (filters.city) query = query.ilike('city', filters.city);
    if (filters.q?.trim()) {
      const term = `%${filters.q.trim()}%`;
      query = query.or(
        `name.ilike.${term},tagline.ilike.${term},description.ilike.${term},area.ilike.${term},city.ilike.${term}`,
      );
    }
    if (filters.categorySlug) {
      const category = await this.getCategory(filters.categorySlug);
      if (!category) return paginated([], 0, 1, options.pageSize ?? 24);
      query = query.eq('category_id', category.id);
    }

    const { data, error } = await query;
    throwIfError(error);

    const rows = (data ?? []) as Row[];
    const aggregates = await this.aggregatesFor(rows.map((row) => row.id));

    let summaries = rows.map((row) => toStudioSummary(row, aggregates.get(row.id)));

    // Price, capacity, amenities and rating live in the aggregate view
    // rather than on `studios`, so they are filtered after the fetch.
    // The set is already narrowed by city, category and text.
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
      summaries = summaries.filter((studio) => (studio.ratingAverage ?? 0) >= filters.minRating!);
    }

    summaries.sort(comparatorFor(filters.sort ?? 'recommended'));

    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 24));
    const start = (page - 1) * pageSize;

    return paginated(summaries.slice(start, start + pageSize), summaries.length, page, pageSize);
  }

  async getPublicStudio(idOrSlug: string): Promise<StudioDetail | null> {
    const column = isUuid(idOrSlug) ? 'id' : 'slug';
    const { data, error } = await this.client
      .from('studios')
      .select(STUDIO_SELECT)
      .eq(column, idOrSlug)
      .eq('status', 'approved')
      .eq('is_published', true)
      .eq('is_suspended', false)
      .maybeSingle();
    throwIfError(error);
    if (!data) return null;

    return this.hydrateStudio(data as Row);
  }

  async listFeaturedStudios(limit: number): Promise<StudioSummary[]> {
    const { data, error } = await this.client
      .from('studios')
      .select(`*, category:categories(id, slug, name), images:studio_images(*)`)
      .eq('status', 'approved')
      .eq('is_published', true)
      .eq('is_suspended', false)
      .eq('is_featured', true)
      .limit(limit);
    throwIfError(error);

    const rows = (data ?? []) as Row[];
    const aggregates = await this.aggregatesFor(rows.map((row) => row.id));
    return rows.map((row) => toStudioSummary(row, aggregates.get(row.id)));
  }

  async listPublicCities(): Promise<Array<{ city: string; count: number }>> {
    const { data, error } = await this.client
      .from('studios')
      .select('city')
      .eq('status', 'approved')
      .eq('is_published', true)
      .eq('is_suspended', false);
    throwIfError(error);

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as Row[]) {
      counts.set(row.city, (counts.get(row.city) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
  }

  /* ── Studios ────────────────────────────────────────────────── */

  async getStudio(studioId: string): Promise<StudioDetail | null> {
    const { data, error } = await this.client
      .from('studios')
      .select(STUDIO_SELECT)
      .eq('id', studioId)
      .maybeSingle();
    throwIfError(error);
    return data ? this.hydrateStudio(data as Row) : null;
  }

  async getStudioBySlug(slug: string): Promise<StudioDetail | null> {
    const { data, error } = await this.client
      .from('studios')
      .select(STUDIO_SELECT)
      .eq('slug', slug)
      .maybeSingle();
    throwIfError(error);
    return data ? this.hydrateStudio(data as Row) : null;
  }

  async listStudiosForOrganization(organizationId: string): Promise<StudioDetail[]> {
    const { data, error } = await this.client
      .from('studios')
      .select(STUDIO_SELECT)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    throwIfError(error);

    return Promise.all(((data ?? []) as Row[]).map((row) => this.hydrateStudio(row)));
  }

  async createStudioDraft(organizationId: string, input: StudioDraftInput): Promise<StudioDetail> {
    const { data, error } = await this.client
      .from('studios')
      .insert({
        organization_id: organizationId,
        slug: await this.uniqueSlug(slugify(input.name)),
        name: input.name.trim(),
        tagline: input.tagline ?? null,
        description: input.description,
        category_id: input.categoryId,
        city: input.location.city,
        area: input.location.area,
        address_line: input.location.addressLine,
        postal_code: input.location.postalCode,
        lat: input.location.lat,
        lng: input.location.lng,
        timezone: input.timezone ?? 'Asia/Kolkata',
        contact_name: input.contactName,
        contact_phone: input.contactPhone,
        contact_email: input.contactEmail,
        instagram: input.instagram ?? null,
        website: input.website ?? null,
        rules: input.rules ?? [],
        cancellation_policy: input.cancellationPolicy ?? '',
        equipment: input.equipment ?? [],
        notes: input.notes ?? null,
        status: 'draft',
      })
      .select('id')
      .single();
    throwIfError(error);

    const created = await this.getStudio(data!.id);
    if (!created) throw new RepositoryError('The studio could not be read back.', 'unavailable');
    return created;
  }

  async updateStudio(studioId: string, patch: UpdateStudioInput): Promise<StudioDetail> {
    const { error } = await this.client
      .from('studios')
      .update(
        prune({
          name: patch.name?.trim(),
          tagline: patch.tagline,
          description: patch.description,
          category_id: patch.categoryId,
          city: patch.location?.city,
          area: patch.location?.area,
          address_line: patch.location?.addressLine,
          postal_code: patch.location?.postalCode,
          lat: patch.location?.lat,
          lng: patch.location?.lng,
          timezone: patch.timezone,
          contact_name: patch.contactName,
          contact_phone: patch.contactPhone,
          contact_email: patch.contactEmail,
          instagram: patch.instagram,
          website: patch.website,
          rules: patch.rules,
          cancellation_policy: patch.cancellationPolicy,
          equipment: patch.equipment,
          notes: patch.notes,
          is_featured: patch.isFeatured,
          has_pending_changes: patch.hasPendingChanges,
          pending_changes: patch.pendingChanges,
          min_notice_minutes: patch.bookingRules?.minNoticeMinutes,
          max_advance_days: patch.bookingRules?.maxAdvanceDays,
          slot_minutes: patch.bookingRules?.slotMinutes,
          auto_confirm: patch.bookingRules?.autoConfirm,
        }),
      )
      .eq('id', studioId);
    throwIfError(error);

    const updated = await this.getStudio(studioId);
    if (!updated) throw new RepositoryError('That studio no longer exists.', 'not_found');
    return updated;
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
    const { error } = await this.client
      .from('studios')
      .update(
        prune({
          status: state.status,
          is_published: state.isPublished,
          is_suspended: state.isSuspended,
          published_at: state.publishedAt,
        }),
      )
      .eq('id', studioId);
    // The lifecycle trigger raises 42501 when a non-admin attempts an
    // approving transition; surface that as a permission failure rather
    // than a generic database error.
    throwIfError(error, 'Only PL·CE can change a listing’s approval state.');

    const updated = await this.getStudio(studioId);
    if (!updated) throw new RepositoryError('That studio no longer exists.', 'not_found');
    return updated;
  }

  async archiveStudio(studioId: string): Promise<void> {
    const { data: upcoming, error: checkError } = await this.client
      .from('bookings')
      .select('id')
      .eq('studio_id', studioId)
      .gt('starts_at', new Date().toISOString())
      .in('status', BLOCKING_BOOKING_STATUSES)
      .limit(1);
    throwIfError(checkError);

    if ((upcoming ?? []).length > 0) {
      throw new RepositoryError(
        'This studio still has upcoming bookings. Cancel or complete them before archiving.',
        'conflict',
      );
    }

    const { error } = await this.client
      .from('studios')
      .update({
        archived_at: new Date().toISOString(),
        is_published: false,
        is_suspended: true,
        status: 'unpublished',
      })
      .eq('id', studioId);
    throwIfError(error);
  }

  async listStudiosForAdmin(
    options: Pagination & { filters?: AdminStudioFilters },
  ): Promise<Paginated<AdminStudioRow>> {
    const filters = options.filters ?? {};
    const { from, to, page, pageSize } = range(options);

    let query = this.client
      .from('studios')
      .select(
        `*, category:categories(name), images:studio_images(*),
         organization:organizations(name, owner:users!organizations_owner_user_id_fkey(full_name, email))`,
        { count: 'exact' },
      )
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (filters.status?.length) query = query.in('status', filters.status);
    if (filters.city) query = query.eq('city', filters.city);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.published != null) query = query.eq('is_published', filters.published);
    if (filters.suspended != null) query = query.eq('is_suspended', filters.suspended);
    if (filters.q?.trim()) {
      const term = `%${filters.q.trim()}%`;
      query = query.or(`name.ilike.${term},city.ilike.${term},area.ilike.${term}`);
    }

    const { data, error, count } = await query;
    throwIfError(error);

    const rows = (data ?? []) as Row[];
    const aggregates = await this.aggregatesFor(rows.map((row) => row.id));

    return paginated(
      rows.map<AdminStudioRow>((row) => {
        const aggregate = aggregates.get(row.id);
        return {
          studio: toStudio(row),
          categoryName: row.category?.name ?? 'Uncategorised',
          ownerName: row.organization?.owner?.full_name ?? 'Unknown',
          ownerEmail: row.organization?.owner?.email ?? '',
          coverImage: coverOf(row.images ?? []),
          spaceCount: Number(aggregate?.space_count ?? 0),
          bookingCount: Number(aggregate?.booking_count ?? 0),
          revenue: Number(aggregate?.revenue ?? 0),
          ratingAverage: aggregate?.rating_average == null ? null : Number(aggregate.rating_average),
          ratingCount: Number(aggregate?.rating_count ?? 0),
        };
      }),
      count ?? 0,
      page,
      pageSize,
    );
  }

  /* ── Spaces ─────────────────────────────────────────────────── */

  async listSpaces(studioId: string): Promise<Space[]> {
    const { data, error } = await this.client
      .from('spaces')
      .select('*, space_amenities(amenities(slug))')
      .eq('studio_id', studioId)
      .order('sort_order');
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toSpace);
  }

  async listSpacesForStudios(studioIds: string[]): Promise<Space[]> {
    if (studioIds.length === 0) return [];
    const { data, error } = await this.client
      .from('spaces')
      .select('*, space_amenities(amenities(slug))')
      .in('studio_id', studioIds)
      .order('sort_order');
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toSpace);
  }

  async getSpace(spaceId: string): Promise<Space | null> {
    const { data, error } = await this.client
      .from('spaces')
      .select('*, space_amenities(amenities(slug))')
      .eq('id', spaceId)
      .maybeSingle();
    throwIfError(error);
    return data ? toSpace(data as Row) : null;
  }

  async createSpace(studioId: string, input: SpaceInput): Promise<Space> {
    const studio = await this.client
      .from('studios')
      .select('organization_id')
      .eq('id', studioId)
      .single();
    throwIfError(studio.error);

    const { data, error } = await this.client
      .from('spaces')
      .insert({
        studio_id: studioId,
        organization_id: studio.data!.organization_id,
        name: input.name.trim(),
        description: input.description ?? null,
        capacity: input.capacity,
        size_sqft: input.sizeSqft ?? null,
        hourly_rate: input.hourlyRate,
        half_day_rate: input.halfDayRate ?? null,
        full_day_rate: input.fullDayRate ?? null,
        currency: input.currency ?? 'INR',
        min_booking_minutes: input.minBookingMinutes ?? 60,
        buffer_minutes: input.bufferMinutes ?? 15,
        is_active: input.isActive ?? true,
        sort_order: input.sortOrder ?? 0,
      })
      .select('id')
      .single();
    throwIfError(error);

    await this.setSpaceAmenities(data!.id, input.amenitySlugs ?? []);

    // A space with no opening hours can never be booked, so a new one
    // starts on a sensible default week rather than silently unbookable.
    await this.client.from('availability_rules').insert(
      Array.from({ length: 7 }, (_, weekday) => ({
        organization_id: studio.data!.organization_id,
        space_id: data!.id,
        weekday,
        opens_at: '09:00',
        closes_at: '21:00',
        is_closed: false,
      })),
    );

    const created = await this.getSpace(data!.id);
    if (!created) throw new RepositoryError('The space could not be read back.', 'unavailable');
    return created;
  }

  async updateSpace(spaceId: string, patch: Partial<SpaceInput>): Promise<Space> {
    const { error } = await this.client
      .from('spaces')
      .update(
        prune({
          name: patch.name?.trim(),
          description: patch.description,
          capacity: patch.capacity,
          size_sqft: patch.sizeSqft,
          hourly_rate: patch.hourlyRate,
          half_day_rate: patch.halfDayRate,
          full_day_rate: patch.fullDayRate,
          min_booking_minutes: patch.minBookingMinutes,
          buffer_minutes: patch.bufferMinutes,
          is_active: patch.isActive,
          sort_order: patch.sortOrder,
        }),
      )
      .eq('id', spaceId);
    throwIfError(error);

    if (patch.amenitySlugs) await this.setSpaceAmenities(spaceId, patch.amenitySlugs);

    const updated = await this.getSpace(spaceId);
    if (!updated) throw new RepositoryError('That space no longer exists.', 'not_found');
    return updated;
  }

  async deleteSpace(spaceId: string): Promise<void> {
    const { error } = await this.client.from('spaces').delete().eq('id', spaceId);
    throwIfError(
      error,
      'This space has bookings against it. Deactivate it instead, or move the bookings first.',
    );
  }

  private async setSpaceAmenities(spaceId: string, slugs: string[]): Promise<void> {
    await this.client.from('space_amenities').delete().eq('space_id', spaceId);
    if (slugs.length === 0) return;

    const { data, error } = await this.client.from('amenities').select('id, slug').in('slug', slugs);
    throwIfError(error);

    const rows = ((data ?? []) as Row[]).map((amenity) => ({
      space_id: spaceId,
      amenity_id: amenity.id,
    }));
    if (rows.length > 0) {
      const { error: insertError } = await this.client.from('space_amenities').insert(rows);
      throwIfError(insertError);
    }
  }

  /* ── Images ─────────────────────────────────────────────────── */

  async listStudioImages(studioId: string): Promise<StudioImage[]> {
    const { data, error } = await this.client
      .from('studio_images')
      .select('*')
      .eq('studio_id', studioId)
      .order('sort_order');
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toImage);
  }

  async addStudioImage(studioId: string, input: StudioImageInput): Promise<StudioImage> {
    const existing = await this.listStudioImages(studioId);
    const isCover = input.isCover ?? existing.length === 0;

    if (isCover && existing.some((image) => image.isCover)) {
      await this.client
        .from('studio_images')
        .update({ is_cover: false })
        .eq('studio_id', studioId)
        .eq('is_cover', true);
    }

    const { data, error } = await this.client
      .from('studio_images')
      .insert({
        studio_id: studioId,
        url: input.url,
        alt: input.alt,
        is_cover: isCover,
        sort_order: input.sortOrder ?? existing.length,
      })
      .select('*')
      .single();
    throwIfError(error);
    return toImage(data!);
  }

  async removeStudioImage(studioId: string, imageId: string): Promise<void> {
    const { data, error } = await this.client
      .from('studio_images')
      .delete()
      .eq('id', imageId)
      .eq('studio_id', studioId)
      .select('is_cover')
      .maybeSingle();
    throwIfError(error);

    // Losing the cover silently would leave a blank card on `/discover`.
    if (data?.is_cover) {
      const remaining = await this.listStudioImages(studioId);
      const next = remaining[0];
      if (next) await this.setCoverImage(studioId, next.id);
    }
  }

  async setCoverImage(studioId: string, imageId: string): Promise<void> {
    await this.client
      .from('studio_images')
      .update({ is_cover: false })
      .eq('studio_id', studioId)
      .eq('is_cover', true);

    const { error } = await this.client
      .from('studio_images')
      .update({ is_cover: true })
      .eq('id', imageId)
      .eq('studio_id', studioId);
    throwIfError(error);
  }

  /* ── Applications ───────────────────────────────────────────── */

  async getApplication(applicationId: string): Promise<StudioApplication | null> {
    const { data, error } = await this.client
      .from('studio_applications')
      .select('*')
      .eq('id', applicationId)
      .maybeSingle();
    throwIfError(error);
    return data ? toApplication(data) : null;
  }

  async getApplicationForStudio(studioId: string): Promise<StudioApplication | null> {
    const { data, error } = await this.client
      .from('studio_applications')
      .select('*')
      .eq('studio_id', studioId)
      .maybeSingle();
    throwIfError(error);
    return data ? toApplication(data) : null;
  }

  async createApplication(organizationId: string, studioId: string): Promise<StudioApplication> {
    const existing = await this.getApplicationForStudio(studioId);
    if (existing) return existing;

    const { data, error } = await this.client
      .from('studio_applications')
      .insert({ organization_id: organizationId, studio_id: studioId, status: 'draft' })
      .select('*')
      .single();
    throwIfError(error);
    return toApplication(data!);
  }

  async updateApplication(
    applicationId: string,
    patch: Partial<StudioApplication>,
  ): Promise<StudioApplication> {
    const { data, error } = await this.client
      .from('studio_applications')
      .update(
        prune({
          status: patch.status,
          submitted_at: patch.submittedAt,
          reviewed_at: patch.reviewedAt,
          reviewed_by: patch.reviewedBy,
          admin_feedback: patch.adminFeedback,
          rejection_reason: patch.rejectionReason,
        }),
      )
      .eq('id', applicationId)
      .select('*')
      .single();
    throwIfError(error);
    return toApplication(data!);
  }

  async listApplicationsForAdmin(
    options: Pagination & { filters?: ApplicationFilters },
  ): Promise<Paginated<ApplicationSummary>> {
    const filters = options.filters ?? {};
    const { from, to, page, pageSize } = range(options);

    let query = this.client
      .from('studio_applications')
      .select(
        `*, studio:studios(
           id, name, slug, city, area,
           category:categories(name),
           images:studio_images(*),
           organization:organizations(owner:users!organizations_owner_user_id_fkey(full_name, email, phone))
         )`,
        { count: 'exact' },
      )
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .range(from, to);

    if (filters.status?.length) query = query.in('status', filters.status);

    const { data, error, count } = await query;
    throwIfError(error);

    let rows = ((data ?? []) as Row[]).filter((row) => row.studio);

    if (filters.city) rows = rows.filter((row) => row.studio.city === filters.city);
    if (filters.q?.trim()) {
      const needle = filters.q.trim().toLowerCase();
      rows = rows.filter((row) =>
        [
          row.studio.name,
          row.studio.city,
          row.studio.area,
          row.studio.organization?.owner?.full_name ?? '',
          row.studio.organization?.owner?.email ?? '',
          row.studio.organization?.owner?.phone ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    const spaceCounts = await this.spaceCountsFor(rows.map((row) => row.studio.id));

    return paginated(
      rows.map<ApplicationSummary>((row) => ({
        application: toApplication(row),
        studioId: row.studio.id,
        studioName: row.studio.name,
        studioSlug: row.studio.slug,
        categoryName: row.studio.category?.name ?? 'Uncategorised',
        city: row.studio.city,
        area: row.studio.area,
        ownerName: row.studio.organization?.owner?.full_name ?? 'Unknown',
        ownerEmail: row.studio.organization?.owner?.email ?? '',
        ownerPhone: row.studio.organization?.owner?.phone ?? null,
        coverImage: coverOf(row.studio.images ?? []),
        spaceCount: spaceCounts.get(row.studio.id) ?? 0,
      })),
      count ?? rows.length,
      page,
      pageSize,
    );
  }

  async getApplicationSummary(applicationId: string): Promise<ApplicationSummary | null> {
    const page = await this.listApplicationsForAdmin({ pageSize: 100 });
    return page.items.find((item) => item.application.id === applicationId) ?? null;
  }

  async appendApplicationEvent(input: ApplicationEventInput): Promise<StudioApplicationEvent> {
    const { data, error } = await this.client
      .from('studio_application_events')
      .insert({
        application_id: input.applicationId,
        organization_id: input.organizationId,
        type: input.type,
        actor_id: input.actorId,
        actor_name: input.actorName,
        message: input.message ?? null,
      })
      .select('*')
      .single();
    throwIfError(error);
    return toApplicationEvent(data!);
  }

  async listApplicationEvents(applicationId: string): Promise<StudioApplicationEvent[]> {
    const { data, error } = await this.client
      .from('studio_application_events')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at');
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toApplicationEvent);
  }

  private async spaceCountsFor(studioIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (studioIds.length === 0) return counts;

    const { data, error } = await this.client
      .from('spaces')
      .select('studio_id')
      .in('studio_id', studioIds);
    throwIfError(error);

    for (const row of (data ?? []) as Row[]) {
      counts.set(row.studio_id, (counts.get(row.studio_id) ?? 0) + 1);
    }
    return counts;
  }

  /* ── Availability ───────────────────────────────────────────── */

  async listAvailabilityRules(spaceIds: string[]): Promise<AvailabilityRule[]> {
    if (spaceIds.length === 0) return [];
    const { data, error } = await this.client
      .from('availability_rules')
      .select('*')
      .in('space_id', spaceIds);
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toAvailabilityRule);
  }

  async replaceAvailabilityRules(
    spaceId: string,
    rules: Array<Omit<AvailabilityRule, 'id' | 'organizationId' | 'spaceId'>>,
  ): Promise<AvailabilityRule[]> {
    const space = await this.getSpace(spaceId);
    if (!space) throw new RepositoryError('That space no longer exists.', 'not_found');

    await this.client.from('availability_rules').delete().eq('space_id', spaceId);

    const { data, error } = await this.client
      .from('availability_rules')
      .insert(
        rules.map((rule) => ({
          organization_id: space.organizationId,
          space_id: spaceId,
          weekday: rule.weekday,
          opens_at: rule.opensAt,
          closes_at: rule.closesAt,
          is_closed: rule.isClosed,
        })),
      )
      .select('*');
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toAvailabilityRule);
  }

  async listBlockedTimes(options: {
    spaceIds: string[];
    from?: string;
    to?: string;
  }): Promise<BlockedTime[]> {
    if (options.spaceIds.length === 0) return [];

    let query = this.client.from('blocked_times').select('*').in('space_id', options.spaceIds);
    if (options.from) query = query.gt('ends_at', options.from);
    if (options.to) query = query.lt('starts_at', options.to);

    const { data, error } = await query;
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toBlockedTime);
  }

  async createBlockedTime(input: {
    spaceId: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
    createdBy: string | null;
  }): Promise<BlockedTime> {
    const space = await this.getSpace(input.spaceId);
    if (!space) throw new RepositoryError('That space no longer exists.', 'not_found');

    const { data, error } = await this.client
      .from('blocked_times')
      .insert({
        organization_id: space.organizationId,
        space_id: input.spaceId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        reason: input.reason,
        created_by: input.createdBy,
      })
      .select('*')
      .single();
    throwIfError(error);
    return toBlockedTime(data!);
  }

  async deleteBlockedTime(blockedTimeId: string): Promise<void> {
    const { error } = await this.client.from('blocked_times').delete().eq('id', blockedTimeId);
    throwIfError(error);
  }

  /* ── Bookings ───────────────────────────────────────────────── */

  async getBooking(bookingId: string): Promise<BookingDetail | null> {
    const { data, error } = await this.client
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('id', bookingId)
      .maybeSingle();
    throwIfError(error);
    return data ? toBookingDetail(data as Row) : null;
  }

  async getBookingByReference(reference: string): Promise<BookingDetail | null> {
    const { data, error } = await this.client
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('reference', reference.toUpperCase())
      .maybeSingle();
    throwIfError(error);
    return data ? toBookingDetail(data as Row) : null;
  }

  async listBookings(
    organizationId: string,
    options: Pagination & { filters?: BookingFilters } = {},
  ): Promise<Paginated<BookingDetail>> {
    const { from, to, page, pageSize } = range(options);

    let query = this.client
      .from('bookings')
      .select(BOOKING_SELECT, { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('starts_at', { ascending: false })
      .range(from, to);

    query = applyBookingFilters(query, options.filters);

    const { data, error, count } = await query;
    throwIfError(error);

    return paginated(
      ((data ?? []) as Row[]).map(toBookingDetail),
      count ?? 0,
      page,
      pageSize,
    );
  }

  async listBookingsInRange(options: {
    spaceIds: string[];
    from: string;
    to: string;
    statuses?: BookingStatus[];
  }): Promise<BookingDetail[]> {
    if (options.spaceIds.length === 0) return [];

    const { data, error } = await this.client
      .from('bookings')
      .select(BOOKING_SELECT)
      .in('space_id', options.spaceIds)
      .in('status', options.statuses ?? BLOCKING_BOOKING_STATUSES)
      .gt('ends_at', options.from)
      .lt('starts_at', options.to)
      .order('starts_at');
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toBookingDetail);
  }

  async listBookingsForUser(userId: string): Promise<BookingDetail[]> {
    const { data, error } = await this.client
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('customer_user_id', userId)
      .order('starts_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toBookingDetail);
  }

  async listBookingsForAdmin(
    options: Pagination & { filters?: BookingFilters & { q?: string } },
  ): Promise<Paginated<BookingDetail>> {
    const { from, to, page, pageSize } = range(options);

    let query = this.client
      .from('bookings')
      .select(BOOKING_SELECT, { count: 'exact' })
      .order('starts_at', { ascending: false })
      .range(from, to);

    query = applyBookingFilters(query, options.filters);
    if (options.filters?.q?.trim()) {
      query = query.ilike('reference', `%${options.filters.q.trim().toUpperCase()}%`);
    }

    const { data, error, count } = await query;
    throwIfError(error);
    return paginated(((data ?? []) as Row[]).map(toBookingDetail), count ?? 0, page, pageSize);
  }

  /**
   * The raw insert. Called only by the booking engine.
   *
   * The reference is retried on collision, and the exclusion constraint
   * on `bookings` is what turns the engine's availability check into a
   * guarantee: a concurrent insert for the same slot fails here with
   * 23P01 rather than succeeding twice.
   */
  async insertBooking(input: InsertBookingInput): Promise<Booking> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await this.client
        .from('bookings')
        .insert({
          reference: newBookingReference(),
          organization_id: input.organizationId,
          studio_id: input.studioId,
          space_id: input.spaceId,
          customer_id: input.customerId,
          customer_user_id: input.customerUserId,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          status: input.status,
          payment_status: input.paymentStatus,
          source: input.source,
          guest_count: input.guestCount,
          price_amount: input.priceAmount,
          currency: input.currency,
          notes: input.notes,
          created_by: input.createdBy,
        })
        .select('*')
        .single();

      if (!error) return toBooking(data!);

      if (error.code === '23P01') {
        throw new RepositoryError('That slot was taken a moment ago. Pick another time.', 'conflict');
      }
      // A duplicate reference is the only error worth retrying.
      if (!(error.code === '23505' && error.message.includes('reference'))) {
        throwIfError(error);
      }
    }

    throw new RepositoryError('Could not allocate a booking reference.', 'unavailable');
  }

  async updateBooking(bookingId: string, patch: UpdateBookingInput): Promise<Booking> {
    const { data, error } = await this.client
      .from('bookings')
      .update(
        prune({
          space_id: patch.spaceId,
          starts_at: patch.startsAt,
          ends_at: patch.endsAt,
          status: patch.status,
          payment_status: patch.paymentStatus,
          guest_count: patch.guestCount,
          price_amount: patch.priceAmount,
          notes: patch.notes,
          cancelled_at: patch.cancelledAt,
          cancellation_reason: patch.cancellationReason,
        }),
      )
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error?.code === '23P01') {
      throw new RepositoryError('Another booking already holds that slot.', 'conflict');
    }
    throwIfError(error);
    return toBooking(data!);
  }

  async appendBookingEvent(input: BookingEventInput): Promise<BookingEvent> {
    const { data, error } = await this.client
      .from('booking_events')
      .insert({
        booking_id: input.bookingId,
        organization_id: input.organizationId,
        type: input.type,
        actor_id: input.actorId,
        actor_name: input.actorName,
        message: input.message ?? null,
        metadata: input.metadata ?? null,
      })
      .select('*')
      .single();
    throwIfError(error);
    return toBookingEvent(data!);
  }

  async listBookingEvents(bookingId: string): Promise<BookingEvent[]> {
    const { data, error } = await this.client
      .from('booking_events')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at');
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toBookingEvent);
  }

  /* ── Customers ──────────────────────────────────────────────── */

  async listCustomers(
    organizationId: string,
    options: Pagination & { q?: string } = {},
  ): Promise<Paginated<CustomerSummary>> {
    const { from, to, page, pageSize } = range(options);

    let query = this.client
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (options.q?.trim()) {
      const term = `%${options.q.trim()}%`;
      query = query.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
    }

    const { data, error, count } = await query;
    throwIfError(error);

    const rows = (data ?? []) as Row[];
    const aggregates = await this.customerAggregatesFor(rows.map((row) => row.id));

    return paginated(
      rows.map((row) => toCustomerSummary(row, aggregates.get(row.id))),
      count ?? 0,
      page,
      pageSize,
    );
  }

  async getCustomer(organizationId: string, customerId: string): Promise<CustomerSummary | null> {
    const { data, error } = await this.client
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    throwIfError(error);
    if (!data) return null;

    const aggregates = await this.customerAggregatesFor([customerId]);
    return toCustomerSummary(data, aggregates.get(customerId));
  }

  async createCustomer(organizationId: string, input: CustomerInput): Promise<Customer> {
    const { data, error } = await this.client
      .from('customers')
      .insert({
        organization_id: organizationId,
        user_id: input.userId ?? null,
        name: input.name.trim(),
        phone: normalisePhone(input.phone),
        email: input.email?.trim().toLowerCase() ?? null,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();
    throwIfError(error);
    return toCustomer(data!);
  }

  async updateCustomer(
    organizationId: string,
    customerId: string,
    patch: Partial<CustomerInput>,
  ): Promise<Customer> {
    const { data, error } = await this.client
      .from('customers')
      .update(
        prune({
          name: patch.name?.trim(),
          phone: normalisePhone(patch.phone),
          email: patch.email?.trim().toLowerCase(),
          notes: patch.notes,
          user_id: patch.userId,
        }),
      )
      .eq('id', customerId)
      .eq('organization_id', organizationId)
      .select('*')
      .single();
    throwIfError(error);
    return toCustomer(data!);
  }

  /**
   * Phone, then email, then exact name — in that order, because a phone
   * number is the only one of the three a studio can rely on being both
   * present and unique. Matching on name alone would quietly merge two
   * different people called Rahul.
   */
  async findOrCreateCustomer(organizationId: string, input: CustomerInput): Promise<Customer> {
    const phone = normalisePhone(input.phone);
    const email = input.email?.trim().toLowerCase() ?? null;

    const attempts: Array<[column: string, value: string]> = [];
    if (input.userId) attempts.push(['user_id', input.userId]);
    if (phone) attempts.push(['phone', phone]);
    if (email) attempts.push(['email', email]);
    attempts.push(['name', input.name.trim()]);

    for (const [column, value] of attempts) {
      const { data, error } = await this.client
        .from('customers')
        .select('*')
        .eq('organization_id', organizationId)
        .eq(column, value)
        .limit(1)
        .maybeSingle();
      throwIfError(error);

      if (data) {
        // Fill in blanks the studio has since learned, without
        // overwriting anything they typed deliberately.
        const fill = prune({
          phone: data.phone ?? phone ?? undefined,
          email: data.email ?? email ?? undefined,
          user_id: data.user_id ?? input.userId ?? undefined,
        });
        if (Object.keys(fill).length > 0) {
          await this.client.from('customers').update(fill).eq('id', data.id);
        }
        return toCustomer({ ...data, ...fill });
      }
    }

    return this.createCustomer(organizationId, input);
  }

  async searchCustomers(
    organizationId: string,
    query: string,
    limit = 8,
  ): Promise<Customer[]> {
    const needle = query.trim();
    if (!needle) return [];

    const term = `%${needle}%`;
    const { data, error } = await this.client
      .from('customers')
      .select('*')
      .eq('organization_id', organizationId)
      .or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
      .limit(limit);
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toCustomer);
  }

  private async customerAggregatesFor(customerIds: string[]): Promise<Map<string, Row>> {
    const map = new Map<string, Row>();
    if (customerIds.length === 0) return map;

    const { data, error } = await this.client
      .from('customer_aggregates')
      .select('*')
      .in('customer_id', customerIds);
    throwIfError(error);

    for (const row of (data ?? []) as Row[]) map.set(row.customer_id, row);
    return map;
  }

  /* ── Reviews ────────────────────────────────────────────────── */

  async listReviewsForStudio(studioId: string): Promise<Review[]> {
    const { data, error } = await this.client
      .from('reviews')
      .select('*, author:users(full_name)')
      .eq('studio_id', studioId)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toReview);
  }

  async createReview(input: {
    organizationId: string;
    studioId: string;
    bookingId: string;
    authorUserId: string;
    rating: number;
    body: string;
  }): Promise<Review> {
    const { data, error } = await this.client
      .from('reviews')
      .insert({
        organization_id: input.organizationId,
        studio_id: input.studioId,
        booking_id: input.bookingId,
        author_user_id: input.authorUserId,
        rating: Math.max(1, Math.min(5, Math.round(input.rating))),
        body: input.body.trim(),
      })
      .select('*, author:users(full_name)')
      .single();

    if (error?.code === '23505') {
      throw new RepositoryError('You have already reviewed this booking.', 'conflict');
    }
    // The insert policy requires a completed booking made by this user,
    // so a policy violation here means exactly that.
    throwIfError(error, 'You can review a studio after a completed booking.');
    return toReview(data!);
  }

  /* ── Notifications ──────────────────────────────────────────── */

  async listNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
    const { data, error } = await this.client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toNotification);
  }

  async createNotification(input: NotificationInput): Promise<AppNotification> {
    const { data, error } = await this.client
      .from('notifications')
      .insert({
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
      })
      .select('*')
      .single();
    throwIfError(error);
    return toNotification(data!);
  }

  async markNotificationsRead(userId: string): Promise<void> {
    const { error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    throwIfError(error);
  }

  /* ── WhatsApp ───────────────────────────────────────────────── */

  async getWhatsAppAccountByPhone(phone: string): Promise<WhatsAppAccount | null> {
    const { data, error } = await this.client
      .from('whatsapp_accounts')
      .select('*')
      .eq('phone', normalisePhone(phone) ?? phone)
      .eq('is_active', true)
      // Unverified means "someone typed this number in", which is not
      // the same as "this number belongs to them".
      .not('verified_at', 'is', null)
      .maybeSingle();
    throwIfError(error);
    return data ? toWhatsAppAccount(data) : null;
  }

  async listWhatsAppAccounts(organizationId: string): Promise<WhatsAppAccount[]> {
    const { data, error } = await this.client
      .from('whatsapp_accounts')
      .select('*')
      .eq('organization_id', organizationId);
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toWhatsAppAccount);
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

    const { data: existing, error: readError } = await this.client
      .from('whatsapp_accounts')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    throwIfError(readError);

    const challenge = {
      verification_code_hash: input.codeHash,
      verification_expires_at: input.expiresAt,
      verification_attempts: 0,
    };

    if (existing) {
      const row = existing as Row;
      const mine = row.organization_id === input.organizationId;

      if (row.verified_at) {
        throw new RepositoryError(
          mine
            ? 'That number is already verified for this studio.'
            : 'That number is already connected to a studio.',
          'conflict',
        );
      }

      // Someone else is mid-challenge. Their claim holds the number
      // until it lapses — but only until it lapses, so an abandoned
      // attempt cannot block the real owner permanently.
      const pendingElsewhere =
        !mine &&
        row.verification_expires_at != null &&
        Date.parse(row.verification_expires_at as string) > Date.now();

      if (pendingElsewhere) {
        throw new RepositoryError(
          'Someone is already verifying that number. Try again in a few minutes.',
          'conflict',
        );
      }

      const { data, error } = await this.client
        .from('whatsapp_accounts')
        .update({
          organization_id: input.organizationId,
          display_name: input.displayName,
          is_active: true,
          ...challenge,
        })
        .eq('id', row.id)
        .select('*')
        .single();
      throwIfError(error);
      return toWhatsAppAccount(data!);
    }

    const { data, error } = await this.client
      .from('whatsapp_accounts')
      .insert({
        organization_id: input.organizationId,
        phone,
        display_name: input.displayName,
        ...challenge,
      })
      .select('*')
      .single();
    throwIfError(error, 'That number is already connected to a studio.');
    return toWhatsAppAccount(data!);
  }

  async getWhatsAppVerification(phone: string): Promise<WhatsAppVerification | null> {
    const { data, error } = await this.client
      .from('whatsapp_accounts')
      .select('id, organization_id, phone, verification_code_hash, verification_expires_at, verification_attempts')
      .eq('phone', normalisePhone(phone) ?? phone)
      .is('verified_at', null)
      .maybeSingle();
    throwIfError(error);
    if (!data) return null;

    const row = data as Row;
    return {
      accountId: row.id as string,
      organizationId: row.organization_id as string,
      phone: row.phone as string,
      codeHash: (row.verification_code_hash as string | null) ?? null,
      expiresAt: (row.verification_expires_at as string | null) ?? null,
      attempts: (row.verification_attempts as number | null) ?? 0,
    };
  }

  async recordWhatsAppVerificationAttempt(accountId: string): Promise<number> {
    const { data: current, error: readError } = await this.client
      .from('whatsapp_accounts')
      .select('verification_attempts')
      .eq('id', accountId)
      .single();
    throwIfError(readError);

    const attempts = (((current as Row)?.verification_attempts as number | null) ?? 0) + 1;

    const { error } = await this.client
      .from('whatsapp_accounts')
      .update({ verification_attempts: attempts })
      .eq('id', accountId);
    throwIfError(error);
    return attempts;
  }

  async markWhatsAppAccountVerified(accountId: string): Promise<WhatsAppAccount> {
    const { data, error } = await this.client
      .from('whatsapp_accounts')
      .update({
        verified_at: new Date().toISOString(),
        is_active: true,
        // The challenge is spent. Keeping the hash around would leave a
        // guessable credential lying in the row for no reason.
        verification_code_hash: null,
        verification_expires_at: null,
        verification_attempts: 0,
      })
      .eq('id', accountId)
      .select('*')
      .single();
    throwIfError(error);
    return toWhatsAppAccount(data!);
  }

  async setWhatsAppAccountActive(accountId: string, isActive: boolean): Promise<WhatsAppAccount> {
    const { data, error } = await this.client
      .from('whatsapp_accounts')
      .update({ is_active: isActive })
      .eq('id', accountId)
      .select('*')
      .single();
    throwIfError(error);
    return toWhatsAppAccount(data!);
  }

  async claimInboundWhatsAppMessage(input: {
    organizationId: string;
    phone: string;
    body: string;
    externalId: string | null;
  }): Promise<WhatsAppMessage | null> {
    const { data, error } = await this.client
      .from('whatsapp_messages')
      .insert({
        organization_id: input.organizationId,
        direction: 'inbound',
        phone: input.phone,
        body: input.body,
        external_id: input.externalId,
      })
      .select('*')
      .single();

    // 23505 is the unique violation on `whatsapp_messages_external_id_unique`.
    // Losing that race is the expected outcome for a retried delivery, not
    // an error — the first request is already handling this message.
    if (error && (error as { code?: string }).code === '23505') return null;
    throwIfError(error);

    return toWhatsAppMessage(data!);
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
    const { data, error } = await this.client
      .from('whatsapp_messages')
      .insert({
        organization_id: input.organizationId,
        direction: input.direction,
        phone: input.phone,
        body: input.body,
        intent: input.intent ?? null,
        outcome: input.outcome ?? null,
        booking_id: input.bookingId ?? null,
        external_id: input.externalId ?? null,
      })
      .select('*')
      .single();
    throwIfError(error);
    return toWhatsAppMessage(data!);
  }

  async listWhatsAppMessages(organizationId: string, limit = 50): Promise<WhatsAppMessage[]> {
    const { data, error } = await this.client
      .from('whatsapp_messages')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    throwIfError(error);
    return ((data ?? []) as Row[]).map(toWhatsAppMessage);
  }

  async getWhatsAppConversation(
    organizationId: string,
    phone: string,
  ): Promise<WhatsAppConversation | null> {
    const { data, error } = await this.client
      .from('whatsapp_conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('phone', normalisePhone(phone) ?? phone)
      .maybeSingle();
    throwIfError(error);
    if (!data) return null;

    // An abandoned conversation must not silently complete a booking
    // twenty minutes later.
    if (Date.parse(data.expires_at) < Date.now()) {
      await this.clearWhatsAppConversation(organizationId, phone);
      return null;
    }

    return {
      organizationId: data.organization_id,
      phone: data.phone,
      intent: data.intent ?? {},
      awaiting: data.awaiting,
      expiresAt: data.expires_at,
      updatedAt: data.updated_at,
    };
  }

  async saveWhatsAppConversation(conversation: WhatsAppConversation): Promise<void> {
    const { error } = await this.client.from('whatsapp_conversations').upsert(
      {
        organization_id: conversation.organizationId,
        phone: normalisePhone(conversation.phone) ?? conversation.phone,
        intent: conversation.intent,
        awaiting: conversation.awaiting,
        expires_at: conversation.expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,phone' },
    );
    throwIfError(error);
  }

  async clearWhatsAppConversation(organizationId: string, phone: string): Promise<void> {
    const { error } = await this.client
      .from('whatsapp_conversations')
      .delete()
      .eq('organization_id', organizationId)
      .eq('phone', normalisePhone(phone) ?? phone);
    throwIfError(error);
  }

  /* ── Admin audit + analytics ────────────────────────────────── */

  async recordAdminAction(input: AdminActionInput): Promise<AdminAction> {
    const { data, error } = await this.client
      .from('admin_actions')
      .insert({
        admin_user_id: input.adminUserId,
        admin_name: input.adminName,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId,
        entity_label: input.entityLabel,
        previous_state: input.previousState ?? null,
        new_state: input.newState ?? null,
        note: input.note ?? null,
      })
      .select('*')
      .single();
    throwIfError(error);
    return toAdminAction(data!);
  }

  async listAdminActions(
    options: Pagination & { entityId?: string; adminUserId?: string },
  ): Promise<Paginated<AdminAction>> {
    const { from, to, page, pageSize } = range(options);

    let query = this.client
      .from('admin_actions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (options.entityId) query = query.eq('entity_id', options.entityId);
    if (options.adminUserId) query = query.eq('admin_user_id', options.adminUserId);

    const { data, error, count } = await query;
    throwIfError(error);
    return paginated(((data ?? []) as Row[]).map(toAdminAction), count ?? 0, page, pageSize);
  }

  async getMarketplaceStats(now: Date = new Date()): Promise<MarketplaceStats> {
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();

    const [studios, applications, bookings, users] = await Promise.all([
      this.client.from('studios').select('id, city, is_published, is_suspended, status, category:categories(name)'),
      this.client.from('studio_applications').select('status'),
      this.client.from('bookings').select('price_amount, status, created_at, starts_at, customer_id'),
      this.client.from('users').select('id', { count: 'exact', head: true }),
    ]);

    throwIfError(studios.error);
    throwIfError(applications.error);
    throwIfError(bookings.error);
    throwIfError(users.error);

    const studioRows = (studios.data ?? []) as Row[];
    const applicationRows = (applications.data ?? []) as Row[];
    const bookingRows = ((bookings.data ?? []) as Row[]).filter((row) => row.status !== 'cancelled');

    const live = studioRows.filter(
      (row) => row.status === 'approved' && row.is_published && !row.is_suspended,
    );

    const decided = applicationRows.filter((row) =>
      ['approved', 'rejected', 'suspended', 'unpublished'].includes(row.status),
    );
    const approved = decided.filter((row) => row.status !== 'rejected');

    const cityCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    for (const row of live) {
      cityCounts.set(row.city, (cityCounts.get(row.city) ?? 0) + 1);
      const name = row.category?.name;
      if (name) categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + 1);
    }

    return {
      totalStudios: studioRows.length,
      liveStudios: live.length,
      pendingApplications: applicationRows.filter((row) =>
        ['submitted', 'under_review'].includes(row.status),
      ).length,
      changesRequested: applicationRows.filter((row) => row.status === 'changes_requested').length,
      suspendedStudios: studioRows.filter((row) => row.is_suspended).length,
      totalBookings: bookingRows.length,
      bookingsThisMonth: bookingRows.filter((row) => row.created_at >= monthStart).length,
      grossRevenue: sum(bookingRows.map((row) => row.price_amount ?? 0)),
      revenueThisMonth: sum(
        bookingRows.filter((row) => row.starts_at >= monthStart).map((row) => row.price_amount ?? 0),
      ),
      activeCustomers: unique(bookingRows.map((row) => row.customer_id as string)).length,
      totalUsers: users.count ?? 0,
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

  async getStudioStats(organizationId: string, now: Date = new Date()): Promise<StudioStats> {
    const [studios, bookingRows, spaceRows] = await Promise.all([
      this.client.from('studios').select('timezone').eq('organization_id', organizationId).limit(1),
      this.client
        .from('bookings')
        .select('price_amount, status, payment_status, starts_at, ends_at, customer_id')
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled'),
      this.client
        .from('spaces')
        .select('id, availability_rules(opens_at, closes_at, is_closed)')
        .eq('organization_id', organizationId)
        .eq('is_active', true),
    ]);

    throwIfError(studios.error);
    throwIfError(bookingRows.error);
    throwIfError(spaceRows.error);

    const timezone = (studios.data?.[0] as Row | undefined)?.timezone ?? 'Asia/Kolkata';
    const today = todayInZone(timezone, now);
    const dayStart = zonedToInstant(today, '00:00', timezone).toISOString();
    const dayEnd = new Date(Date.parse(dayStart) + 86_400_000).toISOString();
    const weekStart = new Date(Date.parse(dayStart) - 6 * 86_400_000).toISOString();
    const monthStart = new Date(Date.parse(dayStart) - 29 * 86_400_000).toISOString();

    const rows = (bookingRows.data ?? []) as Row[];
    const todayRows = rows.filter((row) => row.starts_at >= dayStart && row.starts_at < dayEnd);
    const upcoming = rows.filter(
      (row) => row.starts_at >= now.toISOString() && row.status !== 'completed',
    );
    const unpaid = rows.filter(
      (row) => row.payment_status === 'unpaid' || row.payment_status === 'partial',
    );

    const openHoursPerDay = sum(
      ((spaceRows.data ?? []) as Row[]).map((space) => {
        const rules = (space.availability_rules ?? []).filter((rule: Row) => !rule.is_closed);
        if (rules.length === 0) return 0;
        const total = sum(
          rules.map(
            (rule: Row) => Number(rule.closes_at.slice(0, 2)) - Number(rule.opens_at.slice(0, 2)),
          ),
        );
        return total / 7;
      }),
    );

    const weekRows = rows.filter((row) => row.starts_at >= weekStart && row.starts_at < dayEnd);
    const weekBookedHours = sum(
      weekRows.map((row) => (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 3_600_000),
    );

    return {
      todayBookings: todayRows.length,
      todayRevenue: sum(todayRows.map((row) => row.price_amount ?? 0)),
      weekRevenue: sum(weekRows.map((row) => row.price_amount ?? 0)),
      monthRevenue: sum(
        rows
          .filter((row) => row.starts_at >= monthStart && row.starts_at < dayEnd)
          .map((row) => row.price_amount ?? 0),
      ),
      upcomingBookings: upcoming.length,
      occupancyRate:
        openHoursPerDay === 0 ? 0 : Math.min(1, weekBookedHours / (openHoursPerDay * 7)),
      pendingPayments: unpaid.length,
      pendingPaymentAmount: sum(unpaid.map((row) => row.price_amount ?? 0)),
      activeCustomers: unique(
        rows.filter((row) => row.starts_at >= monthStart).map((row) => row.customer_id as string),
      ).length,
    };
  }

  /* ── Internals ──────────────────────────────────────────────── */

  private async aggregatesFor(studioIds: string[]): Promise<Map<string, Row>> {
    const map = new Map<string, Row>();
    if (studioIds.length === 0) return map;

    const { data, error } = await this.client
      .from('studio_aggregates')
      .select('*')
      .in('studio_id', studioIds);
    throwIfError(error);

    for (const row of (data ?? []) as Row[]) map.set(row.studio_id, row);
    return map;
  }

  private async hydrateStudio(row: Row): Promise<StudioDetail> {
    const aggregates = await this.aggregatesFor([row.id]);
    return toStudioDetail(row, aggregates.get(row.id));
  }

  private async uniqueSlug(base: string): Promise<string> {
    const candidate = base || 'studio';
    const { data, error } = await this.client
      .from('studios')
      .select('slug')
      .like('slug', `${candidate}%`);
    throwIfError(error);

    const taken = new Set(((data ?? []) as Row[]).map((studio) => studio.slug as string));
    if (!taken.has(candidate)) return candidate;

    let suffix = 2;
    while (taken.has(`${candidate}-${suffix}`)) suffix += 1;
    return `${candidate}-${suffix}`;
  }
}

/* ── Mappers ────────────────────────────────────────────────────── */

function toUser(row: Row): UserAccount {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone ?? null,
    avatarUrl: row.avatar_url ?? null,
    platformRole: row.platform_role,
    createdAt: row.created_at,
    suspendedAt: row.suspended_at ?? null,
  };
}

function toOrganization(row: Row): Organization {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
  };
}

function toCategory(row: Row): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function toAmenity(row: Row): Amenity {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    group: row.group,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function toImage(row: Row): StudioImage {
  return {
    id: row.id,
    url: row.url,
    alt: row.alt ?? '',
    isCover: row.is_cover,
    sortOrder: row.sort_order,
  };
}

function coverOf(images: Row[]): StudioImage | null {
  const mapped = images.map(toImage).sort((a, b) => a.sortOrder - b.sortOrder);
  return mapped.find((image) => image.isCover) ?? mapped[0] ?? null;
}

function toSpace(row: Row): Space {
  return {
    id: row.id,
    studioId: row.studio_id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description ?? null,
    capacity: row.capacity,
    sizeSqft: row.size_sqft ?? null,
    hourlyRate: row.hourly_rate,
    halfDayRate: row.half_day_rate ?? null,
    fullDayRate: row.full_day_rate ?? null,
    currency: row.currency ?? 'INR',
    minBookingMinutes: row.min_booking_minutes,
    bufferMinutes: row.buffer_minutes,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    amenitySlugs: (row.space_amenities ?? [])
      .map((join: Row) => join.amenities?.slug)
      .filter(Boolean),
  };
}

function toStudio(row: Row): Studio {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? null,
    description: row.description ?? '',
    categoryId: row.category_id,
    location: {
      city: row.city,
      area: row.area,
      addressLine: row.address_line ?? '',
      postalCode: row.postal_code ?? null,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
    },
    timezone: row.timezone ?? 'Asia/Kolkata',
    contactName: row.contact_name ?? '',
    contactPhone: row.contact_phone ?? '',
    contactEmail: row.contact_email ?? '',
    instagram: row.instagram ?? null,
    website: row.website ?? null,
    rules: row.rules ?? [],
    cancellationPolicy: row.cancellation_policy ?? '',
    equipment: row.equipment ?? [],
    notes: row.notes ?? null,
    bookingRules: {
      minNoticeMinutes: row.min_notice_minutes ?? 60,
      maxAdvanceDays: row.max_advance_days ?? 180,
      slotMinutes: row.slot_minutes ?? 30,
      autoConfirm: row.auto_confirm ?? true,
    },
    status: row.status,
    isPublished: row.is_published,
    isSuspended: row.is_suspended,
    isFeatured: row.is_featured,
    hasPendingChanges: row.has_pending_changes ?? false,
    pendingChanges: row.pending_changes ?? null,
    publishedAt: row.published_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStudioSummary(row: Row, aggregate: Row | undefined): StudioSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? null,
    city: row.city,
    area: row.area,
    timezone: row.timezone ?? 'Asia/Kolkata',
    category: {
      id: row.category?.id ?? row.category_id,
      slug: row.category?.slug ?? 'other',
      name: row.category?.name ?? 'Studio',
    },
    coverImage: coverOf(row.images ?? []),
    priceFrom: Number(aggregate?.price_from ?? 0),
    capacityMax: Number(aggregate?.capacity_max ?? 0),
    spaceCount: Number(aggregate?.space_count ?? 0),
    amenitySlugs: aggregate?.amenity_slugs ?? [],
    ratingAverage: aggregate?.rating_average == null ? null : Number(aggregate.rating_average),
    ratingCount: Number(aggregate?.rating_count ?? 0),
    bookingCount: Number(aggregate?.booking_count ?? 0),
    isFeatured: row.is_featured,
    createdAt: row.created_at,
  };
}

function toStudioDetail(row: Row, aggregate: Row | undefined): StudioDetail {
  const spaces = (row.spaces ?? []).map(toSpace).sort((a: Space, b: Space) => a.sortOrder - b.sortOrder);
  const amenitySlugs: string[] = unique(spaces.flatMap((space: Space) => space.amenitySlugs));

  return {
    ...toStudio(row),
    category: row.category
      ? toCategory(row.category)
      : {
          id: row.category_id,
          slug: 'other',
          name: 'Studio',
          description: null,
          isActive: true,
          sortOrder: 99,
        },
    images: (row.images ?? []).map(toImage).sort((a: StudioImage, b: StudioImage) => a.sortOrder - b.sortOrder),
    coverImage: coverOf(row.images ?? []),
    spaces,
    // The amenity rows themselves are not embedded on the studio, so the
    // display list is rebuilt from the slugs the spaces carry.
    amenities: amenitySlugs.map((slug, index) => ({
      id: slug,
      slug,
      name: slug.replace(/-/g, ' ').replace(/^./, (character) => character.toUpperCase()),
      group: 'comfort' as const,
      isActive: true,
      sortOrder: index,
    })),
    host: {
      organizationId: row.organization_id,
      organizationName: row.organization?.name ?? 'Studio host',
      memberSince: row.organization?.created_at ?? row.created_at,
    },
    ratingAverage: aggregate?.rating_average == null ? null : Number(aggregate.rating_average),
    ratingCount: Number(aggregate?.rating_count ?? 0),
    bookingCount: Number(aggregate?.booking_count ?? 0),
  };
}

function toApplication(row: Row): StudioApplication {
  return {
    id: row.id,
    organizationId: row.organization_id,
    studioId: row.studio_id,
    status: row.status,
    submittedAt: row.submitted_at ?? null,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    adminFeedback: row.admin_feedback ?? null,
    rejectionReason: row.rejection_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApplicationEvent(row: Row): StudioApplicationEvent {
  return {
    id: row.id,
    applicationId: row.application_id,
    organizationId: row.organization_id,
    type: row.type,
    actorId: row.actor_id ?? null,
    actorName: row.actor_name,
    message: row.message ?? null,
    createdAt: row.created_at,
  };
}

function toAvailabilityRule(row: Row): AvailabilityRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    spaceId: row.space_id,
    weekday: row.weekday,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    isClosed: row.is_closed,
  };
}

function toBlockedTime(row: Row): BlockedTime {
  return {
    id: row.id,
    organizationId: row.organization_id,
    spaceId: row.space_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

function toBooking(row: Row): Booking {
  return {
    id: row.id,
    reference: row.reference,
    organizationId: row.organization_id,
    studioId: row.studio_id,
    spaceId: row.space_id,
    customerId: row.customer_id,
    customerUserId: row.customer_user_id ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    paymentStatus: row.payment_status,
    source: row.source,
    guestCount: row.guest_count ?? null,
    priceAmount: row.price_amount,
    currency: row.currency ?? 'INR',
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at ?? null,
    cancellationReason: row.cancellation_reason ?? null,
  };
}

function toBookingDetail(row: Row): BookingDetail {
  return {
    ...toBooking(row),
    customerName: row.customer?.name ?? 'Unknown',
    customerPhone: row.customer?.phone ?? null,
    customerEmail: row.customer?.email ?? null,
    spaceName: row.space?.name ?? 'Space',
    studioName: row.studio?.name ?? 'Studio',
    studioSlug: row.studio?.slug ?? '',
    studioCity: row.studio?.city ?? '',
    timezone: row.studio?.timezone ?? 'Asia/Kolkata',
  };
}

function toBookingEvent(row: Row): BookingEvent {
  return {
    id: row.id,
    bookingId: row.booking_id,
    organizationId: row.organization_id,
    type: row.type,
    actorId: row.actor_id ?? null,
    actorName: row.actor_name,
    message: row.message ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
  };
}

function toCustomer(row: Row): Customer {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id ?? null,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCustomerSummary(row: Row, aggregate: Row | undefined): CustomerSummary {
  return {
    ...toCustomer(row),
    totalBookings: Number(aggregate?.total_bookings ?? 0),
    totalSpend: Number(aggregate?.total_spend ?? 0),
    lastBookingAt: aggregate?.last_booking_at ?? null,
    nextBookingAt: aggregate?.next_booking_at ?? null,
  };
}

function toReview(row: Row): Review {
  return {
    id: row.id,
    organizationId: row.organization_id,
    studioId: row.studio_id,
    bookingId: row.booking_id,
    authorUserId: row.author_user_id,
    authorName: row.author?.full_name ?? 'A guest',
    rating: row.rating,
    body: row.body ?? '',
    createdAt: row.created_at,
    isHidden: row.is_hidden,
  };
}

function toNotification(row: Row): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body ?? '',
    href: row.href ?? null,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  };
}

function toWhatsAppAccount(row: Row): WhatsAppAccount {
  return {
    id: row.id,
    organizationId: row.organization_id,
    phone: row.phone,
    displayName: row.display_name ?? '',
    isActive: row.is_active,
    verifiedAt: row.verified_at ?? null,
    createdAt: row.created_at,
  };
}

function toWhatsAppMessage(row: Row): WhatsAppMessage {
  return {
    id: row.id,
    organizationId: row.organization_id,
    direction: row.direction,
    phone: row.phone,
    body: row.body,
    intent: row.intent ?? null,
    outcome: row.outcome ?? null,
    bookingId: row.booking_id ?? null,
    externalId: row.external_id ?? null,
    createdAt: row.created_at,
  };
}

function toAdminAction(row: Row): AdminAction {
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    adminName: row.admin_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label ?? '',
    previousState: row.previous_state ?? null,
    newState: row.new_state ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}

/* ── Query helpers ──────────────────────────────────────────────── */

function applyBookingFilters<T>(query: T, filters?: BookingFilters): T {
  if (!filters) return query;
  let next = query as any;

  if (filters.status?.length) next = next.in('status', filters.status);
  if (filters.paymentStatus?.length) next = next.in('payment_status', filters.paymentStatus);
  if (filters.source?.length) next = next.in('source', filters.source);
  if (filters.spaceId) next = next.eq('space_id', filters.spaceId);
  if (filters.customerId) next = next.eq('customer_id', filters.customerId);
  if (filters.from) next = next.gte('starts_at', filters.from);
  if (filters.to) next = next.lt('starts_at', filters.to);

  return next as T;
}

function range(options: Pagination) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 24));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

function paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize, hasMore: page * pageSize < total };
}

/**
 * Turns a PostgREST error into a domain error.
 *
 * `42501` is a policy or trigger refusal — the database saying no, which
 * is a `forbidden`, not a bug. `23505` is a uniqueness clash. Everything
 * else is logged and reported generically, because an unexpected
 * database message is as likely to leak schema detail as to help.
 */
export function throwIfError(error: PostgrestError | null, conflictMessage?: string): void {
  if (!error) return;

  if (error.code === '42501' || error.code === 'PGRST301') {
    throw new RepositoryError(
      conflictMessage ?? 'You do not have permission to do that.',
      'forbidden',
    );
  }
  if (error.code === '23505' || error.code === '23503' || error.code === '23P01') {
    throw new RepositoryError(conflictMessage ?? 'That conflicts with something already saved.', 'conflict');
  }

  console.error(
    '[supabase]',
    JSON.stringify({
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    }),
  );

  /*
    Everything past here used to say "We could not reach the database",
    which describes one cause and misdescribes every other. A missing
    column and a failed constraint are not connectivity problems, and
    telling an operator to try again sends them round a loop that cannot
    end.

    The messages below say what kind of thing went wrong without
    reproducing schema detail, and carry the Postgres code. A five-digit
    code discloses nothing a visitor could use and is the difference
    between a diagnosable report and another round of guessing.
  */
  throw new RepositoryError(conflictMessage ?? describe(error), 'unavailable');
}

/** A generic failure, said accurately. */
function describe(error: PostgrestError): string {
  switch (error.code) {
    case '23502':
      return 'Something required was missing when saving. (database error 23502)';
    case '23514':
      return 'One of those values is not allowed. (database error 23514)';
    case '22P02':
      return 'One of those values was the wrong type. (database error 22P02)';
    case 'PGRST116':
      return 'That saved, but could not be read back. (database error PGRST116)';

    /*
      The schema the code expects is not the schema that is deployed —
      almost always a migration that has not been run. Worth naming
      exactly, because no amount of retrying fixes it and the remedy is
      a specific one.
    */
    case '42703':
    case '42P01':
      return 'The database is missing something this version expects — a migration may not have been run. (database error ' + error.code + ')';

    case 'PGRST301':
      return 'You do not have permission to do that.';

    default:
      return error.code
        ? `We could not save that. (database error ${error.code})`
        : 'We could not reach the database. Please try again.';
  }
}

function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return score(b) - score(a);
    }
  };
}

function score(studio: StudioSummary): number {
  const rating = studio.ratingAverage ?? 3.8;
  return rating * 10 + Math.log1p(studio.bookingCount) * 4;
}
