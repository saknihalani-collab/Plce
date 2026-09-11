'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarRange,
  ClipboardCheck,
  History,
  LayoutGrid,
  Layers,
  Settings,
  Sparkles,
  Store,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The admin sidebar.
 *
 * The queue badge is the point of it: the number of applications waiting
 * is the one thing the platform owner needs to see from any screen,
 * because a marketplace with an unattended queue quietly stops growing.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match this route exactly rather than by prefix. */
  exact?: boolean;
  /** Show the pending-application count on this item. */
  badge?: boolean;
}

const ITEMS: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/admin/applications', label: 'Applications', icon: ClipboardCheck, badge: true },
  { href: '/admin/studios', label: 'Live studios', icon: Store },
  { href: '/admin/bookings', label: 'Bookings', icon: CalendarRange },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/categories', label: 'Categories', icon: Layers },
  { href: '/admin/amenities', label: 'Amenities', icon: Sparkles },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/audit', label: 'Audit log', icon: History },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminNav({ pending }: { pending: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="space-y-0.5">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        const showBadge = item.badge && pending > 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-[--radius-sm] px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-stone text-ink'
                : 'text-ink-muted hover:bg-stone/60 hover:text-ink',
            )}
          >
            <Icon className={cn('size-4', active ? 'text-clay-ink' : 'text-ink-soft')} />
            <span className="flex-1">{item.label}</span>
            {showBadge ? (
              <span className="tabular rounded-full bg-clay px-1.5 py-0.5 text-[0.625rem] leading-none text-white">
                {pending}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
