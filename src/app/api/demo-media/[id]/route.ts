import { NextResponse } from 'next/server';

import { getDemoMedia } from '@/lib/storage/demo-media';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Serves an image uploaded in demo mode.
 *
 * Live mode never reaches here — Supabase Storage returns a CDN URL and
 * this route is simply never referenced. It exists so that the listing
 * wizard's upload step behaves identically on a laptop and on a host
 * with a read-only filesystem.
 *
 * A miss is a plain 404 rather than an error: demo media lives on one
 * server instance, so a URL minted by another one is expected to be
 * missing, and the listing falls back to its monogram placeholder.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const media = getDemoMedia(id);

  if (!media) {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(Buffer.from(media.bytes), {
    status: 200,
    headers: {
      'content-type': media.contentType,
      'content-length': String(media.bytes.byteLength),
      /*
        Cached hard by the browser but never by a shared cache. The id is
        unique per upload so the bytes can never change under it, while
        `private` keeps a CDN from holding an object that only exists on
        one instance's heap and would 404 from anywhere else.
      */
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
