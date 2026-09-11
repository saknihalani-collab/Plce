import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { getRepository } from '@/lib/data';

/**
 * The last room.
 *
 * Every other section of the site is paper or stone; this one is
 * walnut, and the change of material is the point. You have walked
 * through the building and this is where it ends — so it gets a
 * statement at full display scale rather than a utility strip of links
 * in 12px grey.
 *
 * Two rules keep it honest:
 *
 *   - Every link goes somewhere that exists. Categories and cities are
 *     read from the database rather than hard-coded, so the footer
 *     cannot drift out of date or point at an empty search.
 *   - PL·CE Admin is absent, as it is from every other public surface.
 *     Administrators reach it by knowing the URL; nobody else is told
 *     it is there. The route is guarded server-side regardless.
 */
export async function SiteFooter() {
  const repository = await getRepository();

  const [categories, cities] = await Promise.all([
    repository.listCategories(),
    repository.listPublicCities(),
  ]);

  return (
    <footer className="on-ink">
      <div className="mx-auto max-w-(--measure) px-(--gutter) pt-(--section-y) pb-12">
        {/* The statement. */}
        <div className="border-b border-line pb-(--section-y)">
          <h2 className="display display-xl max-w-4xl text-ink">
            Find your place.
            <br />
            <span className="display-italic">Make</span> something.
          </h2>

          <div className="mt-12 flex flex-wrap gap-x-10 gap-y-4">
            <Link
              href="/discover"
              className="group inline-flex items-baseline gap-3 text-ink"
              data-testid="footer-explore"
            >
              <span className="dot text-clay" />
              <span className="display display-sm border-b border-line-strong pb-1 transition-colors group-hover:border-clay group-hover:text-clay-ink">
                Explore studios
              </span>
            </Link>

            <Link href="/list-your-studio" className="group inline-flex items-baseline gap-3 text-ink">
              <span className="dot text-clay" />
              <span className="display display-sm border-b border-line-strong pb-1 transition-colors group-hover:border-clay group-hover:text-clay-ink">
                List your studio
              </span>
            </Link>
          </div>
        </div>

        {/* The directory. */}
        <div className="grid gap-x-8 gap-y-12 py-16 sm:grid-cols-2 lg:grid-cols-4">
          <FooterColumn title="Discover">
            <FooterLink href="/discover">All studios</FooterLink>
            {categories.slice(0, 5).map((category) => (
              <FooterLink key={category.id} href={`/discover?category=${category.slug}`}>
                {category.name}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Where">
            {cities.map((entry) => (
              <FooterLink key={entry.city} href={`/discover?city=${encodeURIComponent(entry.city)}`}>
                {entry.city}
              </FooterLink>
            ))}
            <FooterLink href="/discover?sort=rating">Best rated</FooterLink>
            <FooterLink href="/discover?sort=price_asc">Lowest hourly rate</FooterLink>
          </FooterColumn>

          <FooterColumn title="Run a place">
            <FooterLink href="/list-your-studio">List your studio</FooterLink>
            <FooterLink href="/studio">PL·CE Studio</FooterLink>
            <FooterLink href="/studio/schedule">Your schedule</FooterLink>
            <FooterLink href="/studio/whatsapp">WhatsApp bookings</FooterLink>
          </FooterColumn>

          <FooterColumn title="Account">
            <FooterLink href="/login">Sign in</FooterLink>
            <FooterLink href="/signup">Create an account</FooterLink>
            <FooterLink href="/account/bookings">Your bookings</FooterLink>
            <FooterLink href="/account">Your details</FooterLink>
          </FooterColumn>
        </div>

        {/* The colophon. */}
        <div className="flex flex-col gap-6 border-t border-line pt-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
              The layer between people looking for creative spaces and the people who run them.
            </p>
          </div>

          <p className="meta">© {new Date().getFullYear()} PL·CE</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      <ul className="mt-5 space-y-3">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm text-ink-muted transition-colors hover:text-ink">
        {children}
      </Link>
    </li>
  );
}
