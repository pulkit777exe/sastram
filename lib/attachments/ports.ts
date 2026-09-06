// Ports at internal seams — not exposed to callers.
// Two adapters per port => real seam (DEEPENING.md:30). One adapter => hypothetical.

import type { FileCategory } from '@/lib/utils/file-upload';
import type { ImageModerationResult } from '@/lib/services/image-moderation';

export interface BlobStore {
  put(key: string, file: File): Promise<{ url: string }>;
  del(url: string): Promise<void>;
}

export interface ImageModerator {
  moderate(blobUrl: string, category: FileCategory): Promise<ImageModerationResult>;
}

export interface AttachmentsDeps {
  storage: BlobStore;
  moderator: ImageModerator;
}
