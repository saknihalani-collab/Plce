'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * One message becoming one booking.
 *
 * The only animated thing on the site, because it is the only claim
 * that is genuinely hard to believe by reading it. An owner texts the
 * studio in the same words they would text a person; a few seconds
 * later the booking is on the calendar. Describing that takes a
 * paragraph nobody trusts. Showing it takes four beats.
 *
 * The sequence mirrors what the webhook actually does — receive,
 * confirm, write the booking, place it on the schedule — and every
 * label, colour and status word is the same one the real product uses.
 * It is an illustration, marked as one, carrying no customer data.
 *
 * It behaves itself: it does not start until it has been scrolled to,
 * it stops while the tab is hidden, and `prefers-reduced-motion` gets
 * the finished state immediately with no timers at all.
 */

const BEATS = 5;

export function WhatsAppStory() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  /*
    Two independent reasons to be running, tracked separately.

    Collapsing them into one `live` flag looks tidier and is wrong: the
    tab going hidden would switch it off, and nothing would ever switch
    it back, because the section never stopped intersecting so the
    observer had no change to report. The sequence would be dead for the
    rest of the session.
  */
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduced, setReduced] = useState(false);

  const live = inView && pageVisible && !reduced;

  // Only run while the section is actually on screen.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      setStep(BEATS - 1);
      return;
    }

    /*
      Geometry is the source of truth; the observer is the efficient way
      to watch it.

      An IntersectionObserver only reports *changes*, and there are
      environments where its first callback is late or never arrives —
      a backgrounded render, a paused compositor. Relying on it alone
      leaves the section as an empty calendar frame with no way to
      recover. So the rectangle is read directly on mount and on scroll,
      and both listeners come off as soon as the sequence has started.
    */
    const check = () => {
      const rect = node.getBoundingClientRect();
      const visible = rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
      if (visible) {
        setInView(true);
        stopWatching();
      }
      return visible;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            stopWatching();
          }
        }
      },
      { threshold: 0.35 },
    );

    const onScroll = () => {
      check();
    };

    function stopWatching() {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    }

    if (!check()) {
      observer.observe(node);
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
    }

    return stopWatching;
  }, []);

  /*
    Pause on an actual visibility *event*, not on the value at mount.

    Reading `visibilityState` eagerly sounds more correct and is worse in
    practice: some embedding contexts report a document as hidden while
    it is plainly on screen, and there the section would sit dead forever
    with no event ever arriving to revive it. Starting optimistically
    costs nothing — a genuinely backgrounded tab always fires the event,
    and the sequence pauses then.
  */
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  /*
    It plays once and stops on the finished booking.

    Looping was the obvious thing and the wrong one: every replay wipes
    the section back to empty, which reads as a glitch rather than as a
    story starting again, and a panel animating forever in the corner of
    someone's eye is exactly the restlessness this design avoids. The
    sequence is an explanation — once it has explained, the completed
    booking is the more useful thing to leave on screen.
  */
  useEffect(() => {
    if (!live || step >= BEATS - 1) return;

    const timer = window.setTimeout(() => setStep((current) => current + 1), 1100);
    return () => window.clearTimeout(timer);
  }, [live, step]);

  const shown = (beat: number) => step >= beat;

  return (
    <div ref={ref} className="grid gap-8 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6">
      {/* ── The message ──────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="eyebrow">WhatsApp</p>

        <Beat shown={shown(1)}>
          <p className="ml-auto max-w-[19rem] rounded-lg rounded-br-none bg-olive-soft px-4 py-3 text-sm text-ink">
            Booking for 5 to 7 for Shivam
          </p>
        </Beat>

        <Beat shown={shown(2)}>
          <div className="max-w-[19rem] rounded-lg rounded-bl-none border border-line px-4 py-3">
            <p className="text-sm text-ink">Booked.</p>
            <p className="mt-1 text-xs text-ink-muted">
              Shivam · 5:00 — 7:00 PM · Main Studio
            </p>
          </div>
        </Beat>
      </div>

      {/* The hand-off. A rule rather than an arrow — the two halves are
          the same system, not two apps talking. */}
      <div
        className={cn(
          'hidden transition-opacity duration-500 sm:block',
          shown(3) ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      >
        <div className="flex items-center gap-2">
          <span className="h-px w-8 bg-line-strong" />
          <span className="dot text-clay" />
          <span className="h-px w-8 bg-line-strong" />
        </div>
      </div>

      {/* ── The calendar ─────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="eyebrow">Your schedule</p>

        <div className="relative h-[13.5rem] overflow-hidden border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-xs font-medium text-ink">Main Studio</p>
            <p className="meta">Today</p>
          </div>

          <div className="relative h-[11rem]">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="absolute inset-x-0 border-b border-line-soft"
                style={{ top: `${(row + 1) * 20}%` }}
              />
            ))}

            {['3', '4', '5', '6', '7'].map((hour, position) => (
              <span
                key={hour}
                className="tabular absolute left-2 -translate-y-1/2 text-[0.625rem] text-ink-soft"
                style={{ top: `${position * 20 + 6}%` }}
              >
                {hour} PM
              </span>
            ))}

            {/* The booking taking its place. It arrives from slightly
                below and settles — the same gesture the rest of the site
                uses for anything appearing. */}
            <div
              className={cn(
                'absolute right-2 left-12 overflow-hidden border-l-2 border-l-olive bg-olive-soft px-2 py-1.5',
                'transition-[opacity,transform] duration-700 ease-(--ease-enter) motion-reduce:transition-none',
                shown(4) ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
              )}
              style={{ top: '46%', height: '38%' }}
            >
              <p className="tabular text-[0.625rem] text-ink-muted">17:00 — 19:00</p>
              <p className="mt-0.5 truncate text-xs text-ink">Shivam</p>
              <p className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-ink">
                <span className="dot bg-olive" />
                Confirmed
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One step of the sequence, arriving. */
function Beat({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'transition-[opacity,transform] duration-500 ease-(--ease-enter) motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      {children}
    </div>
  );
}
