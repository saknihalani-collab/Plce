'use client';

import { useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, PauseCircle, PencilLine, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import {
  approveStudio,
  markUnderReview,
  rejectStudio,
  requestListingChanges,
  restoreListing,
  suspendListing,
  unpublishListing,
} from '@/features/admin/actions';
import type { ActionResult } from '@/lib/action-result';
import type { ListingStatus } from '@/types/domain';

type Result = ActionResult<null> | null;
type Action = (previous: Result, formData: FormData) => Promise<Result>;

/**
 * Opening an application is what puts it under review.
 *
 * "Under review" ought to mean a person has looked at it, and opening
 * this page is precisely that. Firing it from the client rather than
 * during render keeps the page a read and the transition a write.
 */
export function MarkUnderReview({
  applicationId,
  status,
}: {
  applicationId: string;
  status: ListingStatus;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (status !== 'submitted' || fired.current) return;
    fired.current = true;
    void markUnderReview(applicationId);
  }, [applicationId, status]);

  return null;
}

/**
 * The decision panel.
 *
 * Approve is one click because approving a good listing should be
 * frictionless. Everything that costs the owner something — changes,
 * rejection, suspension — asks for words first, and will not submit
 * without them, because "rejected" with no reason is the single most
 * common way a marketplace loses a good supplier.
 */
export function ReviewActions({
  applicationId,
  status,
  studioName,
}: {
  applicationId: string;
  status: ListingStatus;
  studioName: string;
}) {
  const [open, setOpen] = useState<'changes' | 'reject' | 'suspend' | null>(null);

  const isPending = status === 'submitted' || status === 'under_review';
  const isLive = status === 'approved';
  const isOff = status === 'suspended' || status === 'unpublished';

  return (
    <div className="card p-5">
      <p className="eyebrow">Decision</p>

      {isPending ? (
        <div className="mt-4 space-y-2">
          <ApproveForm applicationId={applicationId} studioName={studioName} />

          <Button
            variant="secondary"
            full
            onClick={() => setOpen(open === 'changes' ? null : 'changes')}
            aria-expanded={open === 'changes'}
          >
            <PencilLine className="size-4" />
            Request changes
          </Button>

          <Button
            variant="danger"
            full
            onClick={() => setOpen(open === 'reject' ? null : 'reject')}
            aria-expanded={open === 'reject'}
          >
            <XCircle className="size-4" />
            Reject
          </Button>
        </div>
      ) : null}

      {isLive ? (
        <div className="mt-4 space-y-2">
          <Button
            variant="secondary"
            full
            onClick={() => setOpen(open === 'suspend' ? null : 'suspend')}
            aria-expanded={open === 'suspend'}
          >
            <PauseCircle className="size-4" />
            Suspend listing
          </Button>

          <SimpleAction
            label="Unpublish"
            hint="Removes it from Discovery. All data kept."
            run={() => unpublishListing(applicationId)}
            confirm={`Unpublish ${studioName}? It comes off Discovery immediately.`}
          />
        </div>
      ) : null}

      {isOff ? (
        <div className="mt-4">
          <SimpleAction
            label="Restore to Discovery"
            hint="Puts the listing back in front of customers."
            run={() => restoreListing(applicationId)}
            icon={<RotateCcw className="size-4" />}
            primary
          />
        </div>
      ) : null}

      {status === 'rejected' ? (
        <p className="mt-4 text-sm text-ink-muted">
          Rejected. The owner can edit and resubmit, which brings it back to this queue.
        </p>
      ) : null}

      {status === 'changes_requested' ? (
        <p className="mt-4 text-sm text-ink-muted">
          Waiting on the owner. It returns here the moment they resubmit.
        </p>
      ) : null}

      {/* Reason forms */}
      {open === 'changes' ? (
        <ReasonForm
          key="changes"
          applicationId={applicationId}
          action={requestListingChanges as Action}
          label="What needs to change?"
          hint="The owner sees this word for word on their application page. Be specific — “clearer cover image” beats “better photos”."
          submitLabel="Send to owner"
          placeholder="Please upload a daylight cover image, and add your operating hours before we can list this."
          onDone={() => setOpen(null)}
        />
      ) : null}

      {open === 'reject' ? (
        <ReasonForm
          key="reject"
          applicationId={applicationId}
          action={rejectStudio as Action}
          label="Why is this being rejected?"
          hint="Kept on the application and shown to the owner."
          submitLabel="Reject application"
          danger
          placeholder="We could not verify that the applicant has the right to let this space."
          onDone={() => setOpen(null)}
        />
      ) : null}

      {open === 'suspend' ? (
        <ReasonForm
          key="suspend"
          applicationId={applicationId}
          action={suspendListing as Action}
          label="Why is this being suspended?"
          hint="The owner sees this, and it goes in the audit log."
          submitLabel="Suspend listing"
          danger
          placeholder="Three customer reports of the studio not being open at the booked time."
          onDone={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function ApproveForm({
  applicationId,
  studioName,
}: {
  applicationId: string;
  studioName: string;
}) {
  const [state, action] = useActionState<Result, FormData>(approveStudio as Action, null);

  useEffect(() => {
    if (state?.ok) toast.success(`${studioName} is live on PL·CE`);
    if (state && !state.ok) toast.error(state.error);
  }, [state, studioName]);

  return (
    <form action={action}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <ApproveButton />
    </form>
  );
}

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      <CheckCircle2 className="size-4" />
      {pending ? 'Approving…' : 'Approve and publish'}
    </Button>
  );
}

function ReasonForm({
  applicationId,
  action,
  label,
  hint,
  submitLabel,
  placeholder,
  danger = false,
  onDone,
}: {
  applicationId: string;
  action: Action;
  label: string;
  hint: string;
  submitLabel: string;
  placeholder: string;
  danger?: boolean;
  onDone: () => void;
}) {
  const [state, submit] = useActionState<Result, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success('Sent');
      onDone();
    }
    if (state && !state.ok) toast.error(state.error);
  }, [state, onDone]);

  return (
    <form action={submit} className="mt-5 border-t border-line pt-5">
      <input type="hidden" name="applicationId" value={applicationId} />

      <label className="field-label" htmlFor={`message-${applicationId}`}>
        {label}
      </label>
      <Textarea
        id={`message-${applicationId}`}
        name="message"
        rows={5}
        required
        minLength={10}
        placeholder={placeholder}
        autoFocus
      />
      <p className="field-hint mt-1.5">{hint}</p>

      {state && !state.ok ? (
        <p className="field-error mt-2" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <ReasonSubmit label={submitLabel} danger={danger} />
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReasonSubmit({ label, danger }: { label: string; danger: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={pending}>
      {pending ? 'Sending…' : label}
    </Button>
  );
}

/**
 * An action with no message, but with a confirmation.
 *
 * Unpublishing takes a studio off the marketplace instantly, which is
 * not something to do by mis-click.
 */
function SimpleAction({
  label,
  hint,
  run,
  confirm,
  icon,
  primary = false,
}: {
  label: string;
  hint: string;
  run: () => Promise<void>;
  confirm?: string;
  icon?: React.ReactNode;
  primary?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <Button
        variant={primary ? 'primary' : 'secondary'}
        full
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          try {
            await run();
            toast.success('Done');
          } catch {
            toast.error('That did not go through. Try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {icon}
        {busy ? 'Working…' : label}
      </Button>
      <p className="mt-1.5 text-xs text-ink-soft">{hint}</p>
    </div>
  );
}
