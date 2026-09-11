import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { StudioImage } from '@/components/ui/studio-image';
import { getRepository } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * The way in — a threshold rather than a form page.
 *
 * Signing in is the moment the public world hands over to the product,
 * so the split is deliberately uneven: the room gets the larger share
 * and carries the brand, the form gets the smaller share and carries
 * nothing at all. A 50/50 split with a photograph in a panel is the
 * shape of every SaaS login ever built; this is meant to read as
 * standing in the doorway of somewhere real.
 *
 * The photograph is a live listing, not a stock interior — the same
 * room someone could go and book, named in the corner so the claim is
 * checkable. Nothing is invented to populate it: if the marketplace has
 * no published studios yet, the panel falls back to bare material and
 * the type still works.
 *
 * On a phone the room is dropped rather than stacked. A photograph
 * above a sign-in form stops being half the composition and becomes
 * decoration that pushes the fields below the fold.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const repository = await getRepository();
  const [studio] = await repository.listFeaturedStudios(1);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.25fr_1fr]">
      {/* ── The room ─────────────────────────────────────────── */}
      <div className="relative hidden overflow-hidden bg-stone-deep lg:sticky lg:top-0 lg:block lg:h-dvh">
        {studio ? (
          <StudioImage
            src={studio.coverImage?.url}
            alt=""
            name={studio.name}
            sizes="60vw"
            priority
            className="scale-105"
          />
        ) : null}

        {/* Two washes rather than one: a light veil over the whole
            frame so the wordmark holds at the top, and a deeper foot so
            the statement holds at the bottom. A single flat scrim would
            grey out the middle of the photograph, which is usually the
            part worth showing. */}
        <div className="absolute inset-0 bg-linear-to-b from-ink/45 via-ink/10 to-ink/80" />

        {/* `on-image` flips the palette without painting a ground, so
            the wordmark, its clay dot and the metadata all resolve to
            their on-dark values instead of being overridden one by
            one. */}
        <div className="on-image absolute inset-0 flex flex-col justify-between p-10 xl:p-14">
          <Link href="/" aria-label="PL·CE home" className="w-fit">
            <Logo className="text-ink" />
          </Link>

          <div>
            <p className="display display-lg max-w-lg text-ink">
              A place for
              <br />
              good work.
            </p>

            {studio ? (
              <p className="mt-8 flex items-center gap-2.5 text-[0.6875rem] tracking-[0.16em] text-ink-muted uppercase">
                <span className="dot text-clay" />
                {studio.name} · {studio.area}, {studio.city}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── The desk ─────────────────────────────────────────── */}
      <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-14 lg:py-10">
        <header className="lg:hidden">
          <Link href="/" aria-label="PL·CE home">
            <Logo />
          </Link>
        </header>

        <main className="flex flex-1 items-center py-12">
          <div className="w-full max-w-[380px]">{children}</div>
        </main>

        <footer className="meta">
          <Link href="/discover" className="transition-colors hover:text-clay-ink">
            Browse without an account
          </Link>
        </footer>
      </div>
    </div>
  );
}
