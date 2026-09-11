import { cn } from '@/lib/utils';

/**
 * The wordmark.
 *
 * PL·CE is "place" with the A replaced by a middot — the dot is a pin,
 * and the joke only works if it stays visually distinct from the
 * letters, so it is rendered as its own element at its own optical size
 * rather than typed as a character in a string.
 */
export function Logo({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const scale = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-3xl',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-baseline font-semibold tracking-[0.08em] uppercase select-none',
        scale,
        className,
      )}
    >
      PL
      <span
        aria-hidden
        className="mx-[0.12em] inline-block size-[0.22em] translate-y-[-0.28em] rounded-full bg-clay"
      />
      CE
      <span className="sr-only">PL·CE</span>
    </span>
  );
}
