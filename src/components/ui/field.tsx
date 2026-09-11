import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * One wrapper for every labelled control.
 *
 * It exists so that the label, the hint and the error are always in the
 * same order, always associated with the input by id, and always
 * rendered — a hint that disappears when an error appears is how people
 * lose the format they were being told to use.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('w-full', className)}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="ml-1 text-clay-ink" aria-hidden>
            *
          </span>
        ) : (
          <span className="ml-2 text-xs font-normal text-ink-subtle">Optional</span>
        )}
      </label>
      {children}
      {hint ? <p className="field-hint mt-1.5">{hint}</p> : null}
      {error ? (
        <p className="field-error mt-1.5" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('field', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn('field resize-y', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  function Select({ className, ...props }, ref) {
    return (
      <select ref={ref} className={cn('field appearance-none pr-8', className)} {...props} />
    );
  },
);

/** A checkbox that reads as a chip — used for amenities and filters. */
export function CheckChip({
  label,
  name,
  value,
  defaultChecked,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  defaultChecked?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <label className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-sm transition-colors has-[:checked]:border-clay has-[:checked]:bg-clay-soft has-[:checked]:text-clay-hover">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        onChange={onChange}
        className="size-3.5 accent-[var(--clay)]"
      />
      {label}
    </label>
  );
}
