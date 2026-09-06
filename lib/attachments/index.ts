// Deep Module — lib/attachments
// External Seam: sanitize() + store()  (see service.ts for invariants, types.ts for error modes)
// Internal Seams (private): BlobStore, ImageModerator via ports.ts adapters

import type { AttachmentKind } from './types';
import { storeDefault } from './service';

export { sanitize, createAttachments, storeDefault as store } from './service';
export { AttachmentError, type StoredFile, type AttachmentKind, type StoreOptions } from './types';
export type { BlobStore, ImageModerator, AttachmentsDeps } from './ports';
export { InMemoryBlobStore, vercelBlobStore } from './adapters/vercel-blob';
export { aiModerator, FakeModerator, FakeModeratorFactory } from './adapters/ai-moderation';

// Ergonomic aliases — same Seam, same singleton behind storeDefault
export function postAttachments(files: File[]) {
  return storeDefault(files, { kind: 'message' });
}

export function uploadAttachments(files: File[], opts?: { kind?: AttachmentKind }) {
  return storeDefault(files, opts);
}

// Single-file helper for avatar/banner (maxFiles 1 enforced)
export async function uploadProfileImage(
  file: File,
  opts: { folder: 'avatars' | 'banners' }
): Promise<{ url: string }> {
  let kind: AttachmentKind = 'banner';
  if (opts.folder === 'avatars') kind = 'avatar';
  const [stored] = await storeDefault([file], { kind });
  if (!stored) throw new Error('Failed to store profile image');
  return { url: stored.url };
}
