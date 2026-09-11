'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * The last line of defence.
 *
 * It says what happened and offers the one action that usually fixes it.
 * The digest is shown because it is the only thing that connects what a
 * person saw to what the server logged.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] unhandled error', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <h1 className="display text-4xl text-ink">That did not load</h1>
      <p className="mt-3 max-w-sm text-ink-muted">
        Something broke on our end rather than yours. Trying again usually works.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        {/* A plain anchor on purpose: after a render error the client tree
            may be in a bad state, and a full document load is the reliable
            way out of it. Slot takes exactly one child, so the comment
            lives out here. */}
        <Button asChild variant="secondary">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Back to PL·CE</a>
        </Button>
      </div>

      {error.digest ? (
        <p className="tabular mt-8 text-xs text-ink-subtle">Reference {error.digest}</p>
      ) : null}
    </div>
  );
}
