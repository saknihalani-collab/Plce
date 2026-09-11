'use client';

import Link from 'next/link';
import { useState } from 'react';

import { StudioImage } from '@/components/ui/studio-image';
import { cn } from '@/lib/utils';

export interface CategoryEntry {
  slug: string;
  name: string;
  count: number;
  /** A real studio in this category, to stand for it. */
  studio: { name: string; area: string; src: string | null; alt: string } | null;
}

/**
 * Discovery framed as intent rather than as a filter.
 *
 * Nobody sits down thinking "I need a studio". They think "I need
 * somewhere to shoot this" — so the question is asked that way, and
 * answered with the categories the marketplace actually has.
 *
 * Pointing at a category shows a real studio from it. That is the whole
 * interaction: a list of words on the left, a room on the right,
 * changing as you read. It makes a category feel like a place rather
 * than a tag, which is the entire argument of the section.
 *
 * Hover is an enhancement, not the mechanism — the rows are ordinary
 * links, they respond to keyboard focus the same way they respond to a
 * pointer, and with no JavaScript at all the list still works and still
 * navigates.
 */
export function CategoryExplorer({ categories }: { categories: CategoryEntry[] }) {
  const [active, setActive] = useState(0);
  const current = categories[active] ?? categories[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-start lg:gap-16">
      <ul className="border-t border-ink">
        {categories.map((category, index) => (
          <li key={category.slug} className="border-b border-line">
            <Link
              href={`/discover?category=${category.slug}`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              className="group flex items-baseline justify-between gap-6 py-5"
            >
              <span
                className={cn(
                  'display display-md transition-colors',
                  index === active ? 'text-clay-ink' : 'text-ink',
                )}
              >
                {category.name}
              </span>
              <span className="tabular shrink-0 text-ink-soft">
                {String(category.count).padStart(2, '0')}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* The room behind the word. Stays put while the list changes
          under the cursor, so the eye is not dragged around the page. */}
      <div className="relative hidden aspect-4/5 overflow-hidden bg-stone lg:block">
        {categories.map((category, index) =>
          category.studio ? (
            <div
              key={category.slug}
              className={cn(
                'absolute inset-0 transition-opacity duration-500 ease-(--ease-settle) motion-reduce:transition-none',
                index === active ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden
            >
              <StudioImage
                src={category.studio.src}
                alt=""
                name={category.studio.name}
                sizes="(min-width: 1024px) 35vw, 0px"
              />
            </div>
          ) : null,
        )}

        {current?.studio ? (
          <div className="on-image absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/75 to-transparent p-5 pt-16">
            <p className="text-sm text-ink">{current.studio.name}</p>
            <p className="mt-1 flex items-center gap-2 text-[0.6875rem] tracking-[0.16em] text-ink-muted uppercase">
              <span className="dot text-clay" />
              {current.studio.area}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
