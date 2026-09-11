import type {
  AdminAction,
  Amenity,
  AppNotification,
  AvailabilityRule,
  BlockedTime,
  Booking,
  BookingEvent,
  Category,
  Customer,
  Organization,
  OrganizationMember,
  Review,
  Space,
  Studio,
  StudioApplication,
  StudioApplicationEvent,
  StudioImage,
  UserAccount,
  WhatsAppAccount,
  WhatsAppMessage,
} from '@/types/domain';
import type { WhatsAppConversation } from '@/lib/data/repository';
import { buildSeed } from '@/lib/data/demo/seed';

/**
 * The demo database.
 *
 * A real relational shape held in arrays — one array per table, with the
 * same foreign keys the SQL schema has. It is deliberately not a
 * convenience blob of pre-joined view models: the demo repository has to
 * do the same joins, the same tenant filtering and the same visibility
 * check as the Supabase one, or demo mode would prove nothing about
 * whether those are right.
 */
/**
 * The demo row for a connected number.
 *
 * `WhatsAppAccount` is the shape the product sees; these three columns
 * are the possession challenge and stay behind the repository, exactly
 * as they do in Postgres. Nothing outside `DemoRepository` reads them.
 */
export interface DemoWhatsAppAccount extends WhatsAppAccount {
  verificationCodeHash?: string | null;
  verificationExpiresAt?: string | null;
  verificationAttempts?: number;
}

export interface DemoDatabase {
  users: UserAccount[];
  organizations: Organization[];
  members: OrganizationMember[];

  categories: Category[];
  amenities: Amenity[];

  studios: Studio[];
  studioImages: Array<StudioImage & { studioId: string }>;
  spaces: Space[];

  applications: StudioApplication[];
  applicationEvents: StudioApplicationEvent[];

  customers: Customer[];
  bookings: Booking[];
  bookingEvents: BookingEvent[];

  availabilityRules: AvailabilityRule[];
  blockedTimes: BlockedTime[];

  reviews: Review[];
  notifications: AppNotification[];

  whatsappAccounts: DemoWhatsAppAccount[];
  whatsappMessages: WhatsAppMessage[];
  whatsappConversations: WhatsAppConversation[];

  adminActions: AdminAction[];
}

/**
 * Held on `globalThis` so the marketplace survives a hot reload.
 *
 * Without this, approving a studio and then editing a component would
 * silently un-approve it, and demo mode would be actively misleading
 * about the thing it exists to demonstrate.
 */
const GLOBAL_KEY = Symbol.for('plce.demo.database');

type GlobalWithDb = typeof globalThis & { [GLOBAL_KEY]?: DemoDatabase };

export function db(): DemoDatabase {
  const scope = globalThis as GlobalWithDb;
  scope[GLOBAL_KEY] ??= buildSeed();
  return scope[GLOBAL_KEY];
}

/** Used by tests and by the demo "reset marketplace" affordance. */
export function resetDb(): DemoDatabase {
  const scope = globalThis as GlobalWithDb;
  scope[GLOBAL_KEY] = buildSeed();
  return scope[GLOBAL_KEY];
}

/** Structured-clones on the way out so callers cannot mutate the store. */
export function copy<T>(value: T): T {
  return structuredClone(value);
}

export function copyAll<T>(values: T[]): T[] {
  return values.map((value) => structuredClone(value));
}
