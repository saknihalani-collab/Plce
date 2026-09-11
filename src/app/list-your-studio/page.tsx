import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CalendarDays, MessageCircle, ShieldCheck } from 'lucide-react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Button } from '@/components/ui/button';
import {
  AmenitiesStep,
  BasicsStep,
  LocationStep,
  PhotosStep,
  PoliciesStep,
  ReviewStep,
  SpacesStep,
} from '@/features/application/components/steps';
import {
  completedSteps,
  isStepKey,
  StepHeader,
  STEPS,
  WizardShell,
  type StepKey,
} from '@/features/application/components/wizard-shell';
import { findDraft } from '@/features/application/lib/draft';
import { getSession } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { readinessProblems } from '@/lib/listing/service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'List your studio',
  description:
    'Put your space on PL·CE and get the calendar, customer list and WhatsApp booking that come with it.',
};

export default async function ListYourStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step: requested } = await searchParams;
  const session = await getSession();

  if (!session) return <Pitch />;

  const repository = await getRepository();
  const draft = await findDraft(repository, session);

  // While PL·CE has the application, the status page is where the
  // conversation happens. The wizard reopens when the ball is back in
  // the owner's court — changes requested, or a rejection they want to
  // answer — because that is when there is something to edit.
  const EDITABLE = ['draft', 'changes_requested', 'rejected'];
  if (draft && !EDITABLE.includes(draft.application.status)) redirect('/studio/application');

  const [categories, amenities] = await Promise.all([
    repository.listCategories(),
    repository.listAmenities(),
  ]);

  const studio = draft?.studio ?? null;
  const step = resolveStep(requested, studio ? completedSteps(studio) : new Set<StepKey>(), studio);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1080px] px-5 py-10 sm:px-8">
        <div className="mb-10">
          <p className="eyebrow">List your studio</p>
          <h1 className="display mt-3 text-4xl text-ink">
            {studio ? studio.name : 'Tell us about your space'}
          </h1>
        </div>

        <WizardShell current={step} studio={studio}>
          {step === 'basics' ? (
            <>
              <StepHeader
                title="What’s the place called?"
                blurb="The name people will see, and the two paragraphs that make them want it."
              />
              <BasicsStep
                studio={studio}
                categories={categories}
                defaultBusinessName={session.user.fullName}
              />
            </>
          ) : null}

          {step === 'location' && studio ? (
            <>
              <StepHeader
                title="Where is it?"
                blurb="The area matters most — it is what people search by, and what they judge the trip on."
              />
              <LocationStep studio={studio} />
            </>
          ) : null}

          {step === 'spaces' && studio ? (
            <>
              <StepHeader
                title="What can people book?"
                blurb="Every room someone can book by the hour. Add them one at a time; you can change the prices whenever you like."
              />
              <SpacesStep studio={studio} />
            </>
          ) : null}

          {step === 'amenities' && studio ? (
            <>
              <StepHeader
                title="What’s in it?"
                blurb="These are the filters people use on Discovery. Tick only what you actually have — a missing green screen is a bad first booking."
              />
              <AmenitiesStep studio={studio} amenities={amenities} />
            </>
          ) : null}

          {step === 'photos' && studio ? (
            <>
              <StepHeader
                title="Show us the room."
                blurb="Wide shots of the empty room, in the light you actually get. The cover image does most of the work."
              />
              <PhotosStep studio={studio} />
            </>
          ) : null}

          {step === 'policies' && studio ? (
            <>
              <StepHeader
                title="When are you open?"
                blurb="When you are open, what you expect, and what happens when someone cancels."
              />
              <PoliciesStep studio={studio} />
            </>
          ) : null}

          {step === 'review' && studio ? (
            <>
              <StepHeader
                title="One last read."
                blurb={`${studio.name} · ${studio.spaces.length} ${studio.spaces.length === 1 ? 'room' : 'rooms'} · ${studio.images.length} ${studio.images.length === 1 ? 'photograph' : 'photographs'}`}
              />
              <ReviewStep problems={readinessProblems(studio)} />
            </>
          ) : null}
        </WizardShell>
      </main>

      <SiteFooter />
    </>
  );
}

/**
 * The step to show when none was asked for: the first one that is not
 * yet saved. Coming back after a week lands you where you stopped.
 */
function resolveStep(
  requested: string | undefined,
  done: Set<StepKey>,
  studio: unknown,
): StepKey {
  if (isStepKey(requested)) {
    // The first step is the only one reachable before a draft exists.
    return studio || requested === 'basics' ? requested : 'basics';
  }
  if (!studio) return 'basics';
  return STEPS.find((step) => !done.has(step.key))?.key ?? 'review';
}

/* ── Signed-out ─────────────────────────────────────────────────── */

function Pitch() {
  return (
    <>
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-[1080px] px-5 py-16 sm:px-8 sm:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">PL·CE Studio</p>
            <h1 className="display mt-5 text-[clamp(2.5rem,6vw,4rem)] text-ink">
              List your studio.
              <br />
              <span className="display-italic text-clay-ink">Then stop chasing bookings.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted">
              A listing on PL·CE comes with the software to run the place: one calendar for
              every booking, a customer list that remembers who ran over, and WhatsApp that
              takes bookings while you are holding a light stand.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup?next=/list-your-studio">
                  Start an application
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login?next=/list-your-studio">I already have an account</Link>
              </Button>
            </div>
          </div>

          <ul className="mt-16 grid gap-8 sm:grid-cols-3">
            <Point icon={<ShieldCheck className="size-4" />} title="Reviewed, not auto-listed">
              A person at PL·CE reads every application. That is why the studios on here are
              worth the trip — and why yours sits next to good ones.
            </Point>
            <Point icon={<CalendarDays className="size-4" />} title="One calendar">
              Bookings from PL·CE, WhatsApp, Instagram and walk-ins all land in the same grid.
              Nothing gets double-booked.
            </Point>
            <Point icon={<MessageCircle className="size-4" />} title="Text it a booking">
              &ldquo;Book Main Studio tomorrow 3 to 6 for Rahul.&rdquo; It checks the calendar
              and books it, or asks you which room.
            </Point>
          </ul>

          <div className="mt-16 rounded-[--radius-lg] border border-line-soft bg-surface-sunken p-8 sm:p-10">
            <p className="eyebrow">What we ask for</p>
            <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.slice(0, 6).map((step, index) => (
                <li key={step.key} className="border-t border-line-strong pt-3">
                  <span className="tabular text-clay-ink">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="mt-1 text-sm font-medium text-ink">{step.label}</p>
                  <p className="mt-1 text-xs text-ink-muted">{step.hint}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-sm text-ink-subtle">
              About ten minutes. It saves as you go, so you can stop halfway and come back.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Point({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <span className="flex size-8 items-center justify-center rounded-full bg-clay-soft text-clay-ink">
        {icon}
      </span>
      <h3 className="mt-3 font-medium text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{children}</p>
    </li>
  );
}
