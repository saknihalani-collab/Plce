import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Variants map to the design system's component classes rather than to
 * utility strings, so the whole product changes from one file.
 *
 * Primary is ink, not colour. On warm paper a near-black button is both
 * the calmest and the most confident thing on the page, and it leaves
 * clay free to mean "this needs you" rather than "this is a button".
 * `clay` is the single emphatic variant, for the one moment on a public
 * page that has to be taken.
 */
const button = cva('btn', {
  variants: {
    variant: {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      ink: 'btn-ink',
      clay: 'btn-clay',
      danger: 'btn-danger',
    },
    size: {
      sm: 'btn-sm',
      md: '',
      lg: 'btn-lg',
      icon: 'btn-icon',
    },
    full: { true: 'w-full', false: '' },
  },
  defaultVariants: { variant: 'primary', size: 'md', full: false },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  full,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      // A button inside a form with no type submits it. That is right for
      // the one submit button and wrong for every other button on the
      // page, so the safe default is stated rather than inherited.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(button({ variant, size, full }), className)}
      {...props}
    />
  );
}
