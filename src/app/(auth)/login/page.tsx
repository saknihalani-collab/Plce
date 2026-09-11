import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthForm } from '@/features/auth/components/auth-form';
import { DemoIdentities } from '@/features/auth/components/demo-identities';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Nobody needs to sign in twice.
  const session = await getSession();
  if (session) redirect(safeNext(next) ?? '/');

  return (
    <>
      <h1 className="display display-md text-ink">Welcome back.</h1>
      <p className="lede mt-4 text-base">Your place is waiting.</p>

      <div className="mt-10">
        <AuthForm mode="sign-in" next={safeNext(next)} />
      </div>

      <DemoIdentities next={safeNext(next)} />
    </>
  );
}

function safeNext(next: string | undefined): string | undefined {
  if (!next) return undefined;
  return next.startsWith('/') && !next.startsWith('//') ? next : undefined;
}
