import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <Link href="/" aria-label="PL·CE home">
        <Logo />
      </Link>

      <h1 className="display mt-10 text-5xl text-ink">Nothing here</h1>
      <p className="mt-3 max-w-sm text-ink-muted">
        This page has moved, or the studio you are looking for is not on PL·CE right now.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/discover">Explore studios</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Back to PL·CE</Link>
        </Button>
      </div>
    </div>
  );
}
