import type { FileCategory } from '@/lib/utils/file-upload';
import { moderateImageUpload, type ImageModerationResult } from '@/lib/services/image-moderation';
import type { ImageModerator } from '../ports';

export const aiModerator: ImageModerator = {
  async moderate(blobUrl: string, category: FileCategory): Promise<ImageModerationResult> {
    // moderateImageUpload is authoritative: owns quota, spend cap, AI call,
    // and blob deletion on NSFW/UNKNOWN edge + crash-before-rethrow.
    return moderateImageUpload(blobUrl, category);
  },
};

// Test fakes
export class FakeModerator implements ImageModerator {
  constructor(private result: ImageModerationResult) {}
  async moderate(): Promise<ImageModerationResult> {
    return this.result;
  }
}

export class FakeModeratorFactory implements ImageModerator {
  private queue: ImageModerationResult[] = [];
  private defaultResult: ImageModerationResult = { allowed: true };

  enqueue(result: ImageModerationResult) {
    this.queue.push(result);
  }

  setDefault(result: ImageModerationResult) {
    this.defaultResult = result;
  }

  async moderate(): Promise<ImageModerationResult> {
    return this.queue.shift() ?? this.defaultResult;
  }
}
