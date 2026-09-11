'use client';

import { createElement, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Content arriving as you reach it.
 *
 * The whole motion vocabulary of the public site is this one gesture:
 * a short rise and a fade, once, when a section comes into view. It is
 * meant to read like something settling into place rather than like an
 * effect — physical space moving slowly, not "look, we have animations".
 *
 * Three rules keep it from becoming noise:
 *
 *   - it fires once and disconnects, so nothing re-animates on scroll-up
 *   - `delay` staggers siblings by a beat, never more than a few
 *   - anyone who has asked for reduced motion gets the finished state
 *     immediately, with no observer attached at all
 *
 * Content is visible by default in the markup and only hidden once the
 * observer is known to be running, so a failed hydration or a crawler
 * sees a complete page rather than a blank one.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Component = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  /** Milliseconds to stagger behind its siblings. Keep it under ~300. */
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<'static' | 'hidden' | 'shown'>('static');

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Anything already on screen at mount should not animate in — that
    // would flash the top of the page on every navigation.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85) {
      setState('shown');
      return;
    }

    setState('hidden');

    /*
      Geometry decides; the observer is just the cheap way to watch it.

      This component wraps nearly every section of the landing page, so
      an observer that never delivers its first callback would leave the
      whole page blank — a far worse failure than a missing animation.
      A scroll listener re-reads the rectangle as a backstop, and both
      watchers come off the moment the content has been shown.
    */
    const reveal = () => {
      setState('shown');
      stopWatching();
    };

    const check = () => {
      const box = node.getBoundingClientRect();
      if (box.top < window.innerHeight * 0.95 && box.bottom > 0) reveal();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal();
        }
      },
      // A generous bottom margin means the rise finishes just as the
      // section reaches comfortable reading position, rather than
      // starting there.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    const onScroll = () => check();

    function stopWatching() {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    }

    observer.observe(node);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return stopWatching;
  }, []);

  /*
    Built with `createElement` rather than `<Component>` because JSX
    intersects the props of every tag the `as` union allows, and the four
    element types disagree about what their ref accepts. This keeps one
    HTMLElement ref for all of them without casting it away.
  */
  return createElement(
    Component,
    {
      ref,
      className: cn(
        state !== 'static' &&
          'transition-[opacity,transform] duration-(--duration-slow) ease-(--ease-enter) motion-reduce:transition-none',
        state === 'hidden' && 'translate-y-3 opacity-0',
        className,
      ),
      style: state === 'shown' && delay ? { transitionDelay: `${delay}ms` } : undefined,
    },
    children,
  );
}
