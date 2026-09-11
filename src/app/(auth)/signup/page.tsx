import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthForm } from '@/features/auth/components/auth-form';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  const session = await getSession();
  if (session) redirect(safeNext(next) ?? '/');

  return (
    <>
      <h1 className="display display-md text-ink">Let&rsquo;s find you a place.</h1>
      <p className="lede mt-4 text-base">
        Book studios today. List your own whenever you are ready — it is the same account.
      </p>

      <div className="mt-10">
        <AuthForm mode="sign-up" next={safeNext(next)} />
      </div>
    </>
  );
}

function safeNext(next: string | undefined): string | undefined {
  if (!next) return undefined;
  return next.startsWith('/') && !next.startsWith('//') ? next : undefined;
}
