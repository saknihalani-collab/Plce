'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Keeps a CRM screen current without a reload.
 *
 * A booking made over WhatsApp has to appear on the calendar the owner
 * already has open — otherwise they take a second booking for the same
 * hour while looking at a stale screen, which is the exact failure the
 * booking engine exists to prevent.
 *
 * This polls `router.refresh()`, which re-runs the server components and
 * patches the tree in place: no full reload, no lost scroll position, no
 * form state thrown away. A websocket would be tighter, but it would
 * also be a second source of truth to keep honest; a five-second refresh
 * of the real page is simpler and cannot drift.
 *
 * It pauses while the tab is hidden — nobody needs a studio calendar
 * refreshed in a background tab, and it stops the poll running all night
 * on a laptop someone left open.
 */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);

    // Coming back to the tab should show the truth immediately rather
    // than up to `seconds` later.
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, seconds]);

  return null;
}
