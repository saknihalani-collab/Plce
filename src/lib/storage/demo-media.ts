import 'server-only';

/**
 * Uploaded images, in memory.
 *
 * Demo mode used to write uploads to `public/uploads`. That works on a
 * laptop and fails on virtually every host: serverless filesystems are
 * read-only outside `/tmp`, so the photo step of the listing wizard —
 * the one flow an owner cannot skip — died with `EROFS` the moment the
 * demo left localhost. Writing to `/tmp` instead would not have helped,
 * because Next only serves `public/` as it was at build time.
 *
 * So the bytes live beside the rest of the demo database: on
 * `globalThis`, seeded per instance, gone on restart. An upload here is
 * still a real file with real bytes behind a real URL — it is served by
 * `/api/demo-media/[id]` rather than by the static handler.
 *
 * The same caveat as every other demo record applies: an image uploaded
 * on one serverless instance does not exist on another. That is a
 * property of running without a database, not of this module.
 */

interface DemoMedia {
  contentType: string;
  bytes: Uint8Array;
  createdAt: number;
}

const GLOBAL_KEY = Symbol.for('plce.demo.media');

type GlobalWithMedia = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, DemoMedia>;
};

/**
 * A cap, because this is a process's heap rather than a disk.
 *
 * A demo left open all afternoon with someone repeatedly re-uploading
 * cover images should not be able to exhaust the function's memory. The
 * oldest entries go first; a demo image that ages out simply falls back
 * to the listing's monogram placeholder.
 */
const MAX_ENTRIES = 60;

function store(): Map<string, DemoMedia> {
  const scope = globalThis as GlobalWithMedia;
  scope[GLOBAL_KEY] ??= new Map();
  return scope[GLOBAL_KEY];
}

export function putDemoMedia(id: string, contentType: string, bytes: Uint8Array): void {
  const media = store();

  media.set(id, { contentType, bytes, createdAt: Date.now() });

  while (media.size > MAX_ENTRIES) {
    // Map preserves insertion order, so the first key is the oldest.
    const oldest = media.keys().next();
    if (oldest.done) break;
    media.delete(oldest.value);
  }
}

export function getDemoMedia(id: string): DemoMedia | null {
  return store().get(id) ?? null;
}
