import { redirect } from 'next/navigation';

/**
 * The calendar became the Schedule — the CRM's primary operational
 * screen. This keeps every existing link, bookmark and revalidation path
 * working, carrying the view and date across so nobody loses their place.
 */
export default async function LegacyCalendarRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const carried = new URLSearchParams();

  for (const key of ['view', 'date', 'space', 'booking'] as const) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) carried.set(key, single);
  }

  const query = carried.toString();
  redirect(query ? `/studio/schedule?${query}` : '/studio/schedule');
}
