import { instantToZoned, durationHours, formatTimeLabel } from '@/lib/time';
import type { Currency } from '@/types/domain';

/**
 * Display formatting.
 *
 * Everything user-facing goes through here so that a price, a date or a
 * duration reads identically on a discovery card, in the owner's
 * calendar, in an admin table and in a WhatsApp reply. Four surfaces
 * inventing their own `toLocaleString` call is how a marketplace ends up
 * quoting ₹4,500 in one place and Rs. 4500.00 in another.
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatMoney(amount: number, _currency: Currency = 'INR'): string {
  return INR.format(Math.round(amount));
}

/** Compact form for dense tables and stat tiles: ₹1.2L, ₹45k. */
export function formatMoneyCompact(amount: number): string {
  const value = Math.round(amount);
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1).replace(/\.0$/, '')}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `₹${value}`;
}

export function formatRate(hourlyRate: number): string {
  return `${formatMoney(hourlyRate)}/hr`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/* ── Dates ──────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '2026-09-10' → '10 Sep 2026'. */
export function formatDate(date: string, opts: { year?: boolean } = {}): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const base = `${day} ${MONTHS[month - 1]}`;
  return opts.year === false ? base : `${base} ${year}`;
}

/** '2026-09-10' → 'Thu 10 Sep'. */
export function formatDateWithDay(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${DAYS[weekday]} ${formatDate(date, { year: false })}`;
}

/** 'Today', 'Tomorrow', 'Yesterday', or 'Thu 10 Sep'. */
export function formatDateRelative(date: string, today: string): string {
  const diff = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatDateWithDay(date);
}

/** A booking's local day and time range: 'Thu 10 Sep · 3 – 6 PM'. */
export function formatBookingWhen(
  startsAt: string,
  endsAt: string,
  timeZone: string,
  today?: string,
): string {
  const start = instantToZoned(startsAt, timeZone);
  const end = instantToZoned(endsAt, timeZone);
  const day = today ? formatDateRelative(start.date, today) : formatDateWithDay(start.date);
  return `${day} · ${formatTimeRange(start.time, end.time)}`;
}

/** '15:00'–'18:00' → '3 – 6 PM'; drops the repeated meridiem. */
export function formatTimeRange(startTime: string, endTime: string): string {
  const start = formatTimeLabel(startTime);
  const end = formatTimeLabel(endTime);
  const startSuffix = start.slice(-2);
  const endSuffix = end.slice(-2);
  if (startSuffix === endSuffix) return `${start.slice(0, -3)} – ${end}`;
  return `${start} – ${end}`;
}

export function formatDuration(startsAt: string, endsAt: string): string {
  const hours = durationHours(startsAt, endsAt);
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 0) return `${whole} ${whole === 1 ? 'hour' : 'hours'}`;
  return `${whole}h ${minutes}m`;
}

/** '10 minutes ago', '3 days ago', '2 Sep'. */
export function formatRelativeTime(instant: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - Date.parse(instant);
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  return formatDate(new Date(instant).toISOString().slice(0, 10));
}

/* ── Misc ───────────────────────────────────────────────────────── */

/** '+919820012345' → '+91 98200 12345'. Leaves unknown formats alone. */
/**
 * A phone number reduced to one comparable form.
 *
 * This is identity-critical, not cosmetic: WhatsApp identifies a studio
 * by its number, so "+91 98200 12345" and "9820012345" have to collapse
 * to the same string or the same owner resolves to nobody. It also binds
 * the verification hash, which is why it lives here rather than being
 * reimplemented per caller.
 *
 * Bare ten-digit numbers are assumed Indian, matching where PL·CE
 * currently operates.
 */
export function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export function formatPhone(phone: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function formatRating(average: number | null, count: number): string {
  if (average == null || count === 0) return 'New';
  return `${average.toFixed(1)} (${count})`;
}
