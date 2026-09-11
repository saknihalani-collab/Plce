'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { setPlatformRole, setUserSuspended } from '@/features/admin/actions';
import type { PlatformRole, UserAccount } from '@/types/domain';

/**
 * Role and suspension controls.
 *
 * Both are one click with a confirmation, because both are consequential
 * and neither is reversible without someone noticing. An admin cannot
 * act on their own account — the server refuses, and the controls are
 * absent so nobody tries.
 */
export function UserActions({
  user,
  isSelf,
}: {
  user: UserAccount;
  isSelf: boolean;
}) {
  const [busy, setBusy] = useState(false);

  if (isSelf) {
    return <span className="text-xs text-ink-soft">That&rsquo;s you</span>;
  }

  const suspended = Boolean(user.suspendedAt);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        disabled={busy}
        className="btn btn-ghost btn-sm"
        onClick={() => {
          const next: PlatformRole = user.platformRole === 'admin' ? 'customer' : 'admin';
          const message =
            next === 'admin'
              ? `Make ${user.fullName} a PL·CE administrator? They will be able to approve and unpublish any listing.`
              : `Remove admin access from ${user.fullName}?`;
          if (!window.confirm(message)) return;
          void run(next === 'admin' ? 'Admin access granted' : 'Admin access removed', () =>
            setPlatformRole(user.id, next),
          );
        }}
      >
        {user.platformRole === 'admin' ? 'Remove admin' : 'Make admin'}
      </button>

      <button
        type="button"
        disabled={busy}
        className="btn btn-ghost btn-sm"
        onClick={() => {
          const message = suspended
            ? `Restore ${user.fullName}'s account?`
            : `Suspend ${user.fullName}? They will not be able to sign in.`;
          if (!window.confirm(message)) return;
          void run(suspended ? 'Account restored' : 'Account suspended', () =>
            setUserSuspended(user.id, !suspended),
          );
        }}
      >
        {suspended ? 'Restore' : 'Suspend'}
      </button>
    </div>
  );
}
