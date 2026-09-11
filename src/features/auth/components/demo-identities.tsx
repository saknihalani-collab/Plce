import { signInAsDemoUser } from '@/features/auth/actions';
import { isDemoMode } from '@/lib/env';

/**
 * Demo-mode identity switcher.
 *
 * PL·CE only makes sense when you can see all three sides of it, and the
 * approval loop is impossible to judge from one account. This panel
 * exists so a reviewer can be the owner, the admin and the customer in
 * the same sitting.
 *
 * It renders only when there is no auth provider configured, and the
 * action it posts to refuses outright in live mode — a hidden button is
 * not a guard.
 */
export function DemoIdentities({ next }: { next?: string }) {
  if (!isDemoMode) return null;

  const identities = [
    {
      email: 'priya@findplce.com',
      name: 'Priya Nair',
      role: 'PL·CE Admin',
      blurb: 'Three applications waiting in the queue.',
    },
    {
      email: 'kabir@studio404.in',
      name: 'Kabir Shah',
      role: 'Studio owner · Studio 404',
      blurb: 'A live studio with a month of bookings behind it.',
    },
    {
      email: 'zoya@terracesessions.in',
      name: 'Zoya Khan',
      role: 'Studio owner · awaiting changes',
      blurb: 'PL·CE has asked for two fixes before going live.',
    },
    {
      email: 'rahul@example.com',
      name: 'Rahul Menon',
      role: 'Customer',
      blurb: 'Books the cyc, always runs over.',
    },
  ];

  return (
    <div className="mt-10 rounded-[--radius] border border-dashed border-line-strong bg-surface-sunken p-5">
      <p className="eyebrow">Demo mode · no database configured</p>
      <p className="mt-2 text-sm text-ink-muted">
        Sign in as anyone below to walk the whole loop. Everything you change is real
        within this session and resets when the server restarts.
      </p>

      <ul className="mt-4 space-y-2">
        {identities.map((identity) => (
          <li key={identity.email}>
            <form
              action={async () => {
                'use server';
                await signInAsDemoUser(identity.email);
              }}
            >
              <button
                type="submit"
                className="flex w-full items-center justify-between gap-4 rounded-[--radius-sm] border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-clay hover:bg-clay-soft"
              >
                <span>
                  <span className="block text-sm font-medium text-ink">{identity.name}</span>
                  <span className="block text-xs text-ink-muted">{identity.blurb}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-subtle">{identity.role}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      {next ? <p className="mt-3 text-xs text-ink-subtle">You will land on {next}.</p> : null}
    </div>
  );
}
