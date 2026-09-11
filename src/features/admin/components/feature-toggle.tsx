'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { setFeatured } from '@/features/admin/actions';

/**
 * Feature or unfeature one studio.
 *
 * Reuses the existing `setFeatured` action rather than adding a second
 * path to the same column — so the audit log records a curation change
 * identically whether it was made here or on the studio's own page.
 */
export function FeatureToggle({
  studioId,
  name,
  isFeatured,
}: {
  studioId: string;
  name: string;
  isFeatured: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant={isFeatured ? 'secondary' : 'ghost'}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setFeatured(studioId, !isFeatured);
          toast.success(isFeatured ? `${name} unfeatured` : `${name} featured`);
        } catch {
          toast.error('That did not go through.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? '…' : isFeatured ? 'Unfeature' : 'Feature'}
    </Button>
  );
}
