'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { UserMinus } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { inviteMember, removeMember } from '@/features/studio/actions';
import type { ActionResult } from '@/lib/action-result';
import { initialsOf } from '@/lib/utils';
import { ORG_ROLE_LABELS, type OrganizationMemberDetail } from '@/types/domain';

type Result = ActionResult<null> | null;

/**
 * The team.
 *
 * Roles are described by what they let someone do rather than named and
 * left to be guessed — "staff" means nothing until you know they cannot
 * see the money.
 */
export function TeamManager({
  members,
  ownerUserId,
  currentUserId,
}: {
  members: OrganizationMemberDetail[];
  ownerUserId: string;
  currentUserId: string;
}) {
  const [state, action] = useActionState<Result, FormData>(
    inviteMember as (previous: Result, formData: FormData) => Promise<Result>,
    null,
  );

  useEffect(() => {
    if (state?.ok) toast.success('Added to the team');
    if (state && !state.ok && !state.field) toast.error(state.error);
  }, [state]);

  const error = state && !state.ok ? state : null;

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <ul className="divide-y divide-line-soft">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center gap-4 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone text-[0.6875rem] font-semibold text-ink">
                {initialsOf(member.fullName)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{member.fullName}</span>
                <span className="block truncate text-xs text-ink-soft">{member.email}</span>
              </span>

              <Badge tone={member.role === 'owner' ? 'brand' : 'neutral'}>
                {ORG_ROLE_LABELS[member.role]}
              </Badge>

              {member.userId === ownerUserId || member.userId === currentUserId ? (
                <span className="w-9" />
              ) : (
                <RemoveMember userId={member.userId} name={member.fullName} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <form action={action} className="card space-y-4 p-5">
        <p className="eyebrow">Add someone</p>

        <Field
          label="Their PL·CE email"
          htmlFor="member-email"
          required
          hint="They need a PL·CE account first — ask them to sign up, then add them here."
          error={error?.field === 'email' ? error.error : null}
        >
          <Input id="member-email" name="email" type="email" required />
        </Field>

        <Field label="What they can do" htmlFor="member-role" required>
          <Select id="member-role" name="role" defaultValue="staff">
            <option value="staff">Staff — calendar, bookings and customers</option>
            <option value="manager">Manager — all of that, plus hours and the listing</option>
          </Select>
        </Field>

        <Submit />
      </form>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Adding…' : 'Add to team'}
    </Button>
  );
}

function RemoveMember({ userId, name }: { userId: string; name: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      disabled={busy}
      className="rounded-[--radius-xs] p-2 text-ink-soft transition-colors hover:bg-alert/15 hover:text-alert-ink disabled:opacity-50"
      onClick={async () => {
        if (!window.confirm(`Remove ${name} from the team?`)) return;
        setBusy(true);
        try {
          await removeMember(userId);
          toast.success('Removed');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'That did not go through.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <UserMinus className="size-4" />
    </button>
  );
}
