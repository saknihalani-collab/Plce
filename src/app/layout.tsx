import type { Metadata, Viewport } from 'next';
import { Fraunces, Instrument_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/next';

import { env } from '@/lib/env';
import './globals.css';

/**
 * The serif carries PL·CE. The sans gets out of its way.
 *
 * Fraunces is a variable serif with optical-size, softness and wonk
 * axes. Softness and wonk are pinned to zero in `globals.css`, which
 * strips out the warmth-for-its-own-sake and leaves a sharp,
 * architectural face; the optical-size axis is what lets the same voice
 * work at a 7rem page opener and at a 1.5rem studio name.
 *
 * Instrument Sans stays as the working voice — neutral enough to
 * disappear in a dense calendar, warm enough not to feel like a
 * dashboard. Times, money and references use the system monospace,
 * because digits in a table have to line up before they look good.
 */
const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
});

const serif = Fraunces({
  subsets: ['latin'],
  variable: '--font-display-serif',
  axes: ['SOFT', 'WONK', 'opsz'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: 'PL·CE — Find a place to make something.',
    template: '%s · PL·CE',
  },
  description:
    'Find and book a studio for the work you want to make — and everything you need to run one.',
  openGraph: {
    title: 'PL·CE — Find a place to make something.',
    description:
      'Find and book a studio for the work you want to make — and everything you need to run one.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#f6f3ec',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--ink)',
              color: 'var(--paper)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-instrument-sans)',
            },
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
