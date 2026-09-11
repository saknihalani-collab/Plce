'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';

import { CheckChip, Select } from '@/components/ui/field';
import { formatMoney } from '@/lib/format';
import { AMENITY_GROUP_LABELS, STUDIO_SORT_LABELS } from '@/types/domain';
import type { Amenity, AmenityGroup, Category, DiscoveryFilters } from '@/types/domain';

/**
 * Filters as a plain GET form.
 *
 * The result is that every filtered view has a real URL — shareable,
 * bookmarkable, back-button-able, and rendered on the server. Changing a
 * control submits the form, so it behaves like a modern filter panel;
 * with JavaScript off it still works, because it is still a form.
 */
export function DiscoveryFilters({
  categories,
  amenities,
  cities,
  filters,
  maxPrice,
}: {
  categories: Category[];
  amenities: Amenity[];
  cities: Array<{ city: string; count: number }>;
  filters: DiscoveryFilters;
  maxPrice: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const submit = () => form.current?.requestSubmit();

  const grouped = amenities.reduce<Record<string, Amenity[]>>((groups, amenity) => {
    (groups[amenity.group] ??= []).push(amenity);
    return groups;
  }, {});

  const activeCount =
    (filters.city ? 1 : 0) +
    (filters.categorySlug ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    (filters.minCapacity ? 1 : 0) +
    (filters.date ? 1 : 0) +
    (filters.amenitySlugs?.length ?? 0);

  return (
    <form ref={form} action="/discover" method="get" className="space-y-7">
      {/* The text query lives in the page header, so it is carried
          through here rather than typed twice. */}
      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}

      <div className="flex items-center justify-between">
        <p className="eyebrow">Filters{activeCount > 0 ? ` · ${activeCount}` : ''}</p>
        {activeCount > 0 ? (
          <Link
            href={filters.q ? `/discover?q=${encodeURIComponent(filters.q)}` : '/discover'}
            className="inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-clay-ink"
          >
            <X className="size-3" />
            Clear
          </Link>
        ) : null}
      </div>

      <FilterGroup label="Sort by">
        <Select name="sort" defaultValue={filters.sort ?? 'recommended'} onChange={submit}>
          {Object.entries(STUDIO_SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FilterGroup>

      <FilterGroup label="City">
        <Select name="city" defaultValue={filters.city ?? ''} onChange={submit}>
          <option value="">Anywhere</option>
          {cities.map((city) => (
            <option key={city.city} value={city.city}>
              {city.city} ({city.count})
            </option>
          ))}
        </Select>
      </FilterGroup>

      <FilterGroup label="Studio type">
        <Select name="category" defaultValue={filters.categorySlug ?? ''} onChange={submit}>
          <option value="">Any type</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name}
            </option>
          ))}
        </Select>
      </FilterGroup>

      {/* Availability. All three are needed for the filter to mean
          anything, so the hours only appear once a date is chosen. */}
      <FilterGroup label="Free on" hint="Checks each studio's real calendar.">
        <input
          type="date"
          name="date"
          className="field"
          defaultValue={filters.date ?? ''}
          onChange={submit}
        />
        {filters.date ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="time"
              name="start"
              step={1800}
              className="field"
              defaultValue={filters.startTime ?? '10:00'}
              onChange={submit}
            />
            <span className="text-sm text-ink-subtle">to</span>
            <input
              type="time"
              name="end"
              step={1800}
              className="field"
              defaultValue={filters.endTime ?? '14:00'}
              onChange={submit}
            />
          </div>
        ) : null}
      </FilterGroup>

      <FilterGroup label={`Up to ${formatMoney(filters.maxPrice ?? maxPrice)} an hour`}>
        <input
          type="range"
          name="maxPrice"
          min={Math.min(500, maxPrice)}
          max={maxPrice}
          step={100}
          defaultValue={filters.maxPrice ?? maxPrice}
          onMouseUp={submit}
          onTouchEnd={submit}
          onKeyUp={submit}
          className="w-full accent-[var(--clay)]"
        />
      </FilterGroup>

      <FilterGroup label="Fits at least">
        <Select
          name="capacity"
          defaultValue={String(filters.minCapacity ?? '')}
          onChange={submit}
        >
          <option value="">Any size</option>
          {[2, 5, 10, 20, 30, 50].map((size) => (
            <option key={size} value={size}>
              {size} people
            </option>
          ))}
        </Select>
      </FilterGroup>

      {Object.entries(grouped).map(([group, items]) => (
        <FilterGroup key={group} label={AMENITY_GROUP_LABELS[group as AmenityGroup] ?? group}>
          <div className="flex flex-wrap gap-1.5">
            {items.map((amenity) => (
              <CheckChip
                key={amenity.id}
                name="amenity"
                value={amenity.slug}
                label={amenity.name}
                defaultChecked={filters.amenitySlugs?.includes(amenity.slug)}
                onChange={submit}
              />
            ))}
          </div>
        </FilterGroup>
      ))}

      {/* The escape hatch when JavaScript has not loaded. */}
      <noscript>
        <button type="submit" className="btn btn-primary w-full">
          Apply filters
        </button>
      </noscript>
    </form>
  );
}

function FilterGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line-soft pt-5 first-of-type:border-0 first-of-type:pt-0">
      <p className="mb-2 text-sm font-medium text-ink">{label}</p>
      {hint ? <p className="mb-2 text-xs text-ink-subtle">{hint}</p> : null}
      {children}
    </div>
  );
}
