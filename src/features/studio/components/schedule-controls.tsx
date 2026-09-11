'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Jump to a date.
 *
 * A native date input rather than a bespoke calendar popover: it is
 * keyboard-accessible for free, it speaks the platform's own date
 * conventions, and on a phone it opens the system picker the owner
 * already knows. Choosing a date navigates, keeping the URL the single
 * source of truth for what the screen is showing.
 */
export function ScheduleDatePicker({
  value,
  view,
  space,
}: {
  value: string;
  view: string;
  space?: string;
}) {
  const router = useRouter();

  return (
    <input
      type="date"
      value={value}
      aria-label="Jump to date"
      onChange={(event) => {
        const next = event.target.value;
        if (!next) return;

        const params = new URLSearchParams({ view, date: next });
        if (space) params.set('space', space);
        router.push(`/studio/schedule?${params.toString()}`);
      }}
      className="field h-9 w-auto py-1 text-sm"
    />
  );
}

/**
 * Remembers the view the owner last chose.
 *
 * Someone who works in Week view should not be dropped back into Day
 * every time they open the schedule. Stored as a cookie rather than in
 * `localStorage` so the server can read it while rendering and the right
 * view arrives in the first paint — no flash of the wrong layout.
 */
export function RememberView({ view, cookieName }: { view: string; cookieName: string }) {
  useEffect(() => {
    // Lax, so it survives normal navigation but is not sent on
    // cross-site requests. It is a display preference, not a credential.
    document.cookie = `${cookieName}=${view}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [view, cookieName]);

  return null;
}
