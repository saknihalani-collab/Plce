import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { getSession } from '@/lib/auth/session';
import { cn, initialsOf } from '@/lib/utils';

/**
 * The marketplace header.
 *
 * Deliberately thin. On a page whose opening move is a 7rem serif
 * statement, a conventional app bar — filled buttons, a dense row of
 * links, a shadow — is the single fastest way to make the whole thing
 * read as software. So this is a wordmark, three words, and one action,
 * with a hairline underneath and nothing else.
 *
 * It still has one job beyond navigation: making both halves of PL·CE
 * visible from the first screen. Someone who runs a studio should not
 * have to guess that "List your studio" is where their dashboard lives.
 *
 * PL·CE Admin is a private platform-owner area and is deliberately
 * absent from every public surface — this header, the footer, the
 * landing page, the sitemap and robots.txt. Administrators reach it by
 * knowing the URL; nobody else is told it exists. The route is guarded
 * server-side regardless, in `app/admin/layout.tsx`.
 */
export async function SiteHeader({ transparent = false }: { transparent?: boolean }) {
  const session = await getSession();

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b transition-colors',
        transparent
          ? 'border-transparent bg-paper/80 backdrop-blur-md'
          : 'border-line-soft bg-paper/95 backdrop-blur-md',
      )}
    >
      <div className="mx-auto flex h-20 max-w-(--measure) items-center gap-10 px-(--gutter)">
        <Link href="/" className="shrink-0" aria-label="PL·CE home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          <HeaderLink href="/discover">Discover</HeaderLink>
          <HeaderLink href="/list-your-studio">For studios</HeaderLink>
          {session?.isStudioOwner ? <HeaderLink href="/studio">PL·CE Studio</HeaderLink> : null}
        </nav>

        <div className="ml-auto flex items-center gap-5">
          {session ? (
            <>
              <Link
                href="/account/bookings"
                className="hidden text-sm text-ink-muted transition-colors hover:text-ink sm:block"
              >
                Your bookings
              </Link>
              <Link
                href="/account"
                className="flex size-9 items-center justify-center rounded-full bg-ink text-xs font-semibold tracking-wide text-paper"
                aria-label={`Account — ${session.user.fullName}`}
              >
                {initialsOf(session.user.fullName)}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm text-ink-muted transition-colors hover:text-ink sm:block"
              >
                Log in
              </Link>
              <Button asChild size="sm">
                <Link href="/discover">Explore</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm text-ink-muted underline-offset-[6px] transition-colors hover:text-ink hover:underline hover:decoration-clay"
    >
      {children}
    </Link>
  );
}
