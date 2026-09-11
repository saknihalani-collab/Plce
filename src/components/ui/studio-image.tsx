'use client';

import Image from 'next/image';
import { useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * A studio photograph, with a considered fallback.
 *
 * Listing images are supplied by studio owners and hosted elsewhere, so
 * some fraction of them will one day 404. A broken-image icon on a
 * marketplace card is worse than no photograph at all, so a failure
 * degrades to a tinted panel carrying the studio's initial — which still
 * identifies the listing and still looks like PL·CE.
 */
export function StudioImage({
  src,
  alt,
  name,
  className,
  sizes,
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  /** Used for the fallback monogram. */
  name: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-surface-sunken',
          className,
        )}
        aria-label={alt}
        role="img"
      >
        <span className="display text-4xl text-ink-subtle">{name.trim().charAt(0) || '·'}</span>
      </div>
    );
  }

  /*
    Demo uploads are served from one server instance's memory, so the
    image optimiser's own fetch could land on a different instance and
    404. Going straight to the bytes removes that hop — and there is no
    point spending optimisation on an image that disappears on restart.
  */
  const ephemeral = src.startsWith('/api/demo-media/');

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'}
      priority={priority}
      unoptimized={ephemeral}
      className={cn('object-cover', className)}
      onError={() => setFailed(true)}
    />
  );
}
