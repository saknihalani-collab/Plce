'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Clock,
  LayoutGrid,
  MessageCircle,
  Settings,
  Store,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Permission } from '@/lib/auth/permissions';

/**
 * The Studio sidebar.
 *
 * Items are filtered by the permissions the person actually holds, so a
 * staff member does not see an Availability tab that would bounce them
 * back. The route guard still runs — this is about not showing someone a
 * door they cannot open.
 */

const ITEMS: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: Permission;
  exact?: boolean;
}> = [
  { href: '/studio', label: 'Today', icon: LayoutGrid, permission: 'studio.view', exact: true },
  { href: '/studio/schedule', label: 'Schedule', icon: CalendarDays, permission: 'booking.view' },
  { href: '/studio/bookings', label: 'Bookings', icon: ClipboardList, permission: 'booking.view' },
  { href: '/studio/customers', label: 'Customers', icon: Users, permission: 'customer.view' },
  { href: '/studio/spaces', label: 'Spaces', icon: Store, permission: 'space.edit' },
  { href: '/studio/availability', label: 'Availability', icon: Clock, permission: 'availability.edit' },
  { href: '/studio/analytics', label: 'Analytics', icon: BarChart3, permission: 'billing.view' },
  { href: '/studio/listing', label: 'Listing', icon: Store, permission: 'studio.edit' },
  { href: '/studio/whatsapp', label: 'WhatsApp', icon: MessageCircle, permission: 'whatsapp.manage' },
  { href: '/studio/settings', label: 'Settings', icon: Settings, permission: 'org.manage_members' },
];

export function StudioNav({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  const held = new Set(permissions);

  return (
    /*
       A tall sidebar on a phone pushes the schedule — the thing the owner
       opened the app for — entirely below the fold. Below `lg` the same
       items become a horizontal strip that scrolls.
    */
    <nav
      aria-label="Studio"
      className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0"
    >
      {ITEMS.filter((item) => held.has(item.permission)).map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[--radius-sm] px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-stone text-ink'
                : 'text-ink-muted hover:bg-stone/60 hover:text-ink',
            )}
          >
            <Icon className={cn('size-4', active ? 'text-clay-ink' : 'text-ink-soft')} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
