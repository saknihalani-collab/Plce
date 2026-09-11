'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { StudioImage } from '@/components/ui/studio-image';
import { cn } from '@/lib/utils';

export interface HeroStudio {
  slug: string;
  name: string;
  area: string;
  city: string;
  src: string | null;
  alt: string;
}

/**
 * The visual field under the headline.
 *
 * Not a hero image in a card — a full-bleed view into the product, one
 * real listing at a time. The rotation exists to answer the question the
 * headline raises: *what kind of place?* One photograph answers it once;
 * three answer it with range, which is what a marketplace needs to show
 * in its first screen.
 *
 * Everything here is a real published studio, named and linked. The
 * counter is not decoration — it tells you how many places you are being
 * shown and lets you go back to one.
 *
 * Restraint, deliberately:
 *
 *   - a slow cross-fade and nothing else. No parallax, no pan, no zoom.
 *   - rotation stops while the tab is hidden, so returning to the page
 *     does not fast-forward through a queue of missed frames.
 *   - `prefers-reduced-motion` disables the timer entirely and leaves
 *     the manual controls working.
 *
 * A single studio renders as a still photograph with no counter, so the
 * component degrades to the simplest thing when the data is thin.
 */
export function HeroGallery({ studios }: { studios: HeroStudio[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = studios.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [count, paused]);

  // A rotation running against a hidden tab is wasted work, and coming
  // back to a page mid-fade looks like a glitch rather than a transition.
  useEffect(() => {
    const onVisibility = () => setPaused(document.visibilityState !== 'visible');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const current = studios[index];
  if (!current) return null;

  return (
    <div className="relative">
      <div className="relative h-[62vh] min-h-[380px] overflow-hidden bg-stone sm:h-[70vh] lg:h-[78vh]">
        {studios.map((studio, position) => (
          <div
            key={studio.slug}
            className={cn(
              'absolute inset-0 transition-opacity duration-1000 ease-(--ease-settle) motion-reduce:transition-none',
              position === index ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden={position !== index}
          >
            <StudioImage
              src={studio.src}
              alt={position === index ? studio.alt : ''}
              name={studio.name}
              sizes="100vw"
              priority={position === 0}
            />
          </div>
        ))}

        {/* Just enough shade at the foot to hold the caption. The top of
            the frame is left alone — that is usually the light, and the
            light is the reason to book a room. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-ink/70 to-transparent" />

        <div className="on-image absolute inset-x-0 bottom-0 px-(--gutter) pb-6">
          <div className="mx-auto flex max-w-(--measure) flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <Link href={`/studios/${current.slug}`} className="group min-w-0">
              <p className="display display-sm truncate text-ink transition-colors group-hover:text-clay-ink">
                {current.name}
              </p>
              <p className="mt-1 flex items-center gap-2 text-[0.6875rem] tracking-[0.16em] text-ink-muted uppercase">
                <span className="dot text-clay" />
                {current.area} · {current.city}
              </p>
            </Link>

            {count > 1 ? (
              <div className="flex items-center gap-4">
                <p className="tabular text-ink-muted">
                  {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
                </p>

                <div className="flex items-center gap-2">
                  {studios.map((studio, position) => (
                    <button
                      key={studio.slug}
                      type="button"
                      onClick={() => setIndex(position)}
                      aria-label={`Show ${studio.name}`}
                      aria-current={position === index}
                      className="group py-2"
                    >
                      <span
                        className={cn(
                          'block h-px w-8 transition-colors',
                          position === index
                            ? 'bg-clay'
                            : 'bg-ink-soft group-hover:bg-ink-muted',
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
