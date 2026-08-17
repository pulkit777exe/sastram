import { del } from '@vercel/blob';
import { aiService } from '@/lib/ai';
import { env } from '@/lib/config/env';
import { consumeImageModerationQuota } from '@/lib/services/daily-quota';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AiCallPath } from '@/lib/services/ai-cost-classification';

export type ImageModerationResult = {
  allowed: boolean;
  flagged?: boolean;
  reason?: string;
};

/**
 * Runs NSFW moderation on an uploaded image blob.
 *
 * Returns `{ allowed: true }` when the image passes or moderation is disabled.
 * Returns `{ allowed: false, reason }` when the image is rejected — the caller
 * is responsible for deleting the blob if needed.
 * Returns `{ allowed: true, flagged: true }` when the classification is UNKNOWN
 * (the upload route treats this differently from the messages route).
 */
export async function moderateImageUpload(
  blobUrl: string,
  fileCategory: string
): Promise<ImageModerationResult> {
  if (!env.CONTENT_MODERATION_ENABLED || (fileCategory !== 'IMAGE' && fileCategory !== 'GIF')) {
    return { allowed: true };
  }

  const quota = await consumeImageModerationQuota({});
  if (!quota.allowed) {
    await del(blobUrl);
    return { allowed: false, reason: 'Daily image moderation limit reached. Please try again tomorrow.' };
  }

  await enforceAiSpendCap(AiCallPath.IMAGE_MODERATION);
  const result = await aiService.moderateImageContent(blobUrl);

  if (result.classification === 'NSFW') {
    await del(blobUrl);
    return { allowed: false, reason: `Image rejected: ${result.reason}` };
  }

  if (result.classification === 'UNKNOWN') {
    return { allowed: true, flagged: true };
  }

  return { allowed: true };
}
