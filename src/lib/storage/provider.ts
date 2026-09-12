import 'server-only';

import { randomUUID } from 'node:crypto';

import { env, isDemoMode } from '@/lib/env';
import { putDemoMedia } from '@/lib/storage/demo-media';

/**
 * Image storage.
 *
 * Studio photography is the single most important thing on a listing, so
 * uploading it has to actually work in both modes:
 *
 *   live — Supabase Storage, public bucket, CDN-backed URL
 *   demo — memory, served back by `/api/demo-media/[id]`
 *
 * The demo path keeps real bytes and hands back a real URL. That
 * matters: an upload control that quietly discarded the file would make
 * the listing wizard untestable, which is exactly what demo mode exists
 * to prevent. It deliberately does not touch the filesystem — hosts are
 * read-only, and an upload that only works on a laptop is not a working
 * upload.
 */

export interface StoredFile {
  url: string;
  path: string;
}

export interface StorageProvider {
  readonly name: string;
  upload(file: File, prefix: string): Promise<StoredFile>;
}

/*
  Kept in step with `serverActions.bodySizeLimit` in next.config.ts. A
  cap above that one is a promise the framework will not keep: the
  request dies before this check ever runs.
*/
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export class StorageError extends Error {}

function assertUploadable(file: File): void {
  if (!ALLOWED.has(file.type)) {
    throw new StorageError('Images must be JPEG, PNG, WebP or AVIF.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new StorageError('Images need to be under 4 MB. Export a smaller version.');
  }
  if (file.size === 0) {
    throw new StorageError('That file was empty.');
  }
}

function extensionFor(file: File): string {
  switch (file.type) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    default:
      return 'jpg';
  }
}

class MemoryStorageProvider implements StorageProvider {
  readonly name = 'memory';

  async upload(file: File, prefix: string): Promise<StoredFile> {
    assertUploadable(file);

    const id = `${prefix}-${randomUUID()}.${extensionFor(file)}`;
    putDemoMedia(id, file.type, new Uint8Array(await file.arrayBuffer()));

    return { url: `/api/demo-media/${id}`, path: id };
  }
}

class SupabaseStorageProvider implements StorageProvider {
  readonly name = 'supabase';
  private readonly bucket = 'studio-images';

  constructor(private readonly url: string) {}

  async upload(file: File, prefix: string): Promise<StoredFile> {
    assertUploadable(file);

    // Imported here rather than at module scope so demo mode never pulls
    // the Supabase client into a request that has no use for it.
    const { createClient } = await import('@/lib/supabase/server');
    const client = await createClient();

    const objectPath = `${prefix}/${randomUUID()}.${extensionFor(file)}`;
    const { error } = await client.storage.from(this.bucket).upload(objectPath, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      /*
        The reason matters more than the fact. "Try again" is advice for
        a blip, and every common cause here is not a blip: a missing
        bucket and a missing policy both fail identically forever, and
        telling somebody to retry sends them round a loop that cannot
        end. The specific message goes to the log; the person gets the
        one sentence that tells them whether this is theirs to fix.
      */
      console.error('[storage] upload failed', error.message);
      throw new StorageError(describeUploadFailure(error.message));
    }

    return {
      url: `${this.url}/storage/v1/object/public/${this.bucket}/${objectPath}`,
      path: objectPath,
    };
  }
}

/**
 * Turns a Supabase Storage failure into something worth reading.
 *
 * The two setup failures are worth separating from everything else
 * because they are permanent and they are ours — an owner retrying an
 * upload will never fix either one.
 */
export function describeUploadFailure(message: string): string {
  const reason = message.toLowerCase();

  if (reason.includes('bucket not found')) {
    return 'Image storage is not set up on this deployment yet. This is ours to fix, not yours.';
  }
  if (reason.includes('row-level security') || reason.includes('violates')) {
    return 'This deployment is not allowing image uploads yet. This is ours to fix, not yours.';
  }
  if (reason.includes('payload too large') || reason.includes('maximum allowed size')) {
    return 'That image is too large for storage. Export a smaller version.';
  }
  if (reason.includes('already exists')) {
    return 'That image is already uploaded.';
  }

  return 'That image could not be uploaded. Try again.';
}

export function getStorageProvider(): StorageProvider {
  if (!isDemoMode && env.supabase.url) return new SupabaseStorageProvider(env.supabase.url);
  return new MemoryStorageProvider();
}
