import Link from 'next/link';

import { availabilitySummary, HourStrip, type HourCell } from '@/components/brand/hour-strip';
import { StudioImage } from '@/components/ui/studio-image';
import { formatMoney, formatRating } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { StudioSummary } from '@/types/domain';

/**
 * A discovery card — which is deliberately not a card.
 *
 * A studio is chosen with the eyes, so the photograph is the object and
 * everything else is a caption beneath it, set on the same paper as the
 * page. Boxing each one in a bordered panel would make six rooms look
 * like six database records.
 *
 * Under the caption: today's hours. That is the thing no other
 * marketplace shows and the thing every studio booking actually turns
 * on.
 */
export function StudioCard({
  studio,
  hours,
  day = 'today',
  priority = false,
  className,
}: {
  studio: StudioSummary;
  hours?: HourCell[];
  /** The day `hours` describes, so the caption cannot claim the wrong one. */
  day?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/studios/${studio.slug}`}
      className={cn('group flex flex-col', className)}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-stone">
        <StudioImage
          src={studio.coverImage?.url}
          alt={studio.coverImage?.alt ?? studio.name}
          name={studio.name}
          priority={priority}
          className="image-lift"
        />

        {studio.isFeatured ? (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 bg-paper/92 px-2 py-1 text-[0.625rem] font-medium tracking-[0.14em] text-ink uppercase backdrop-blur-sm">
            <span className="dot text-clay" />
            Featured
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-1 flex-col border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="display min-w-0 flex-1 truncate text-xl text-ink transition-colors group-hover:text-clay-ink">
            {studio.name}
          </h3>
          <span className="tabular shrink-0 text-ink-soft">
            {formatRating(studio.ratingAverage, studio.ratingCount)}
          </span>
        </div>

        <p className="meta mt-1.5 truncate">
          {studio.area} · {studio.category.name}
        </p>

        {hours && hours.length > 0 ? (
          <div className="mt-4">
            <HourStrip cells={hours} />
            <p className="mt-2 text-xs text-ink-muted">{availabilitySummary(hours, day)}</p>
          </div>
        ) : (
          <p className="mt-4 text-xs text-ink-soft">Hours on request</p>
        )}

        <div className="mt-auto flex items-baseline justify-between gap-3 pt-4">
          <p className="tabular text-ink">
            {formatMoney(studio.priceFrom)}
            <span className="text-ink-soft">/hr</span>
          </p>
          <p className="text-xs text-ink-soft">
            {studio.spaceCount} {studio.spaceCount === 1 ? 'space' : 'spaces'} · up to{' '}
            {studio.capacityMax}
          </p>
        </div>
      </div>
    </Link>
  );
}
