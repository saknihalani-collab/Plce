import type { Metadata } from 'next';

import { TeamManager } from '@/features/studio/components/team-manager';
import { assertStudioPermission, requireStudioContext } from '@/features/studio/lib/context';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings', robots: { index: false } };

export default async function StudioSettingsPage() {
  const context = await requireStudioContext('/studio/settings');
  assertStudioPermission(context, 'org.manage_members');

  const { repository, organizationId, session, studio } = context;
  const [members, organization] = await Promise.all([
    repository.listMembers(organizationId),
    repository.getOrganization(organizationId),
  ]);

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Organisation</p>
      <h1 className="display mt-3 text-4xl text-ink">
        {organization?.name ?? studio.name}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        On PL·CE since{' '}
        {formatDate((organization?.createdAt ?? studio.createdAt).slice(0, 10))}
      </p>

      <section className="mt-10">
        <h2 className="eyebrow mb-4">Team</h2>
        <TeamManager
          members={members}
          ownerUserId={organization?.ownerUserId ?? session.user.id}
          currentUserId={session.user.id}
        />
      </section>

      <section className="mt-10 rounded-[--radius] border border-line bg-stone p-5">
        <h2 className="eyebrow">What each role can do</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-ink">Owner</dt>
            <dd className="text-ink-muted">
              Everything, including revenue and the team.
            </dd>
          </div>
          <div>
            <dt className="text-ink">Manager</dt>
            <dd className="text-ink-muted">
              Runs the studio day to day — calendar, bookings, customers, hours, spaces and
              the listing. Not the money, and not the team.
            </dd>
          </div>
          <div>
            <dt className="text-ink">Staff</dt>
            <dd className="text-ink-muted">
              Works the calendar: sees, creates, moves and cancels bookings, and looks after
              customers. Not pricing, hours, or the listing.
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          Nobody on your team can approve your listing — that is PL·CE&rsquo;s decision, and
          the database refuses it regardless of role.
        </p>
      </section>
    </div>
  );
}
