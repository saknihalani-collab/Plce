'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * The share affordance for a live listing.
 *
 * The URL is shown in full rather than hidden behind a button, because
 * the first thing an owner does with it is check that it looks right.
 */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused outright; the URL is on screen
      // either way, so say so rather than failing silently.
      toast.error('Copy blocked by your browser — select the link instead.');
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="tabular min-w-0 flex-1 truncate text-ink">{url}</code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[--radius-xs] border border-line px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
