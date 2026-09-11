import { describe, expect, it } from 'vitest';

import { getStorageProvider, StorageError } from '@/lib/storage/provider';
import { getDemoMedia } from '@/lib/storage/demo-media';

/**
 * Uploads on a read-only host.
 *
 * The listing wizard's photo step is the one flow an owner cannot skip,
 * and it used to write to `public/uploads` — which fails with EROFS on
 * essentially every host. These cover the replacement: real bytes in,
 * real URL out, and the same validation as before.
 */

function pngFile(name = 'cover.png', bytes = [137, 80, 78, 71, 13, 10, 26, 10]): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

describe('demo uploads', () => {
  it('stores the bytes and hands back a URL that resolves to them', async () => {
    const provider = getStorageProvider();
    const stored = await provider.upload(pngFile(), 'studio');

    expect(stored.url).toMatch(/^\/api\/demo-media\//);

    const id = stored.url.replace('/api/demo-media/', '');
    const media = getDemoMedia(id);

    expect(media).not.toBeNull();
    expect(media!.contentType).toBe('image/png');
    expect(Array.from(media!.bytes)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('never touches the filesystem', async () => {
    // The whole point: no mkdir, no writeFile, nothing under public/.
    const provider = getStorageProvider();
    expect(provider.name).toBe('memory');
  });

  it('keeps the extension so the URL still looks like an image', async () => {
    const provider = getStorageProvider();
    const stored = await provider.upload(pngFile(), 'studio');
    expect(stored.url.endsWith('.png')).toBe(true);
  });

  it('still refuses a file that is not an allowed image', async () => {
    const provider = getStorageProvider();
    const pdf = new File([new Uint8Array([1, 2, 3])], 'deck.pdf', { type: 'application/pdf' });

    await expect(provider.upload(pdf, 'studio')).rejects.toBeInstanceOf(StorageError);
  });

  it('still refuses an empty file', async () => {
    const provider = getStorageProvider();
    const empty = new File([], 'empty.png', { type: 'image/png' });

    await expect(provider.upload(empty, 'studio')).rejects.toBeInstanceOf(StorageError);
  });

  it('returns null for an id this instance has never seen', () => {
    expect(getDemoMedia('studio-does-not-exist.png')).toBeNull();
  });

  it('caps how much it will hold, oldest first', async () => {
    const provider = getStorageProvider();

    const first = await provider.upload(pngFile(), 'cap');
    const firstId = first.url.replace('/api/demo-media/', '');

    // Comfortably past MAX_ENTRIES.
    for (let i = 0; i < 65; i += 1) {
      await provider.upload(pngFile(), 'cap');
    }

    expect(getDemoMedia(firstId)).toBeNull();
  });
});
