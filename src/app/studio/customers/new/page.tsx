import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { CustomerForm } from '@/features/studio/components/customer-form';
import { assertStudioPermission, requireStudioContext } from '@/features/studio/lib/context';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New customer', robots: { index: false } };

export default async function NewCustomerPage() {
  const context = await requireStudioContext('/studio/customers/new');
  assertStudioPermission(context, 'customer.edit');

  return (
    <div className="max-w-2xl">
      <Link
        href="/studio/customers"
        className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-clay-ink"
      >
        <ArrowLeft className="size-4" />
        Customers
      </Link>

      <p className="eyebrow mt-6">Customers</p>
      <h1 className="display mt-3 text-4xl text-ink">Add someone</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Most customers add themselves by booking. This is for the ones who called.
      </p>

      <div className="mt-8">
        <CustomerForm />
      </div>
    </div>
  );
}
