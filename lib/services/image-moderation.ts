import { del } from '@vercel/blob';
import { aiService } from '@/lib/ai';
import { env } from '@/lib/config/env';
import { consumeImageModerationQuota } from '@/lib/services/daily-quota';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { logger } from '@/lib/infrastructure/logger';

export type ImageModerationResult = {
  allowed: boolean;
  flagged?: boolean;
  reason?: string;
};

/**
 * Runs NSFW moderation on an uploaded image blob.
 *
 * Returns `{ allowed: true }` when the image passes or moderation is disabled.
 * Returns `{ allowed: false, reason }` when the image is rejected — the blob is
 * deleted by this function, not the caller.
 * Returns `{ allowed: true, flagged: true }` when the classification is UNKNOWN
 * (the upload route treats this differently from the messages route).
 *
 * If the check itself crashes (spend cap, provider outage), the blob is deleted
 * before rethrowing so an unmoderated file is never left publicly reachable.
 */
function shouldSkipModeration(fileCategory: string): boolean {
  if (!env.CONTENT_MODERATION_ENABLED) return true;
  if (fileCategory === 'IMAGE') return false;
  if (fileCategory === 'GIF') return false;
  return true;
}

async function handleQuotaExceeded(blobUrl: string): Promise<ImageModerationResult> {
  await del(blobUrl);
  return { allowed: false, reason: 'Daily image moderation limit reached. Please try again tomorrow.' };
}

async function handleNsfwImage(blobUrl: string, reason: string): Promise<ImageModerationResult> {
  await del(blobUrl);
  return { allowed: false, reason: `Image rejected: ${reason}` };
}

export async function moderateImageUpload(
  blobUrl: string,
  fileCategory: string
): Promise<ImageModerationResult> {
  if (shouldSkipModeration(fileCategory)) {
    return { allowed: true };
  }

  try {
    const quotaResult = await consumeImageModerationQuota({});
    if (!quotaResult.allowed) {
      return handleQuotaExceeded(blobUrl);
    }

    await enforceAiSpendCap(AiCallPath.IMAGE_MODERATION);
    const moderationResult = await aiService.moderateImageContent(blobUrl);

    if (moderationResult.classification === 'NSFW') {
      return handleNsfwImage(blobUrl, moderationResult.reason);
    }

    if (moderationResult.classification === 'UNKNOWN') {
      return { allowed: true, flagged: true };
    }

    return { allowed: true };
  } catch (moderationError) {
    logger.warn('[image-moderation] check failed, deleting unmoderated blob', { blobUrl });
    await del(blobUrl).catch(() => {});
    throw moderationError;
  }
}
