import { logger } from '@/lib/infrastructure/logger';
import { aiService } from '@/lib/ai';
import { sanitizeHtmlContent } from '@/lib/services/content-safety';
import { NotificationType } from '@prisma/client';
import { notifyMultipleUsers } from '@/modules/notifications';
import { assertSpendCapAvailable, runAiGeneration } from './_shared';
import type { DailyDigestJobData, JobMessageData } from '../types';

async function generateDailyDigest(messages: JobMessageData[], subscriberIds: string[]) {
  logger.info(`Generating daily digest for ${subscriberIds.length} subscribers`);
  await assertSpendCapAvailable();
  // Daily digest has no threadId scope; use a stable placeholder for logging.
  const result = await runAiGeneration('daily-digest', 'global', () =>
    aiService.generateDailyDigest(messages),
  );
  if (!result.ok) return { digestLength: 0, skipped: true };
  const digest = sanitizeHtmlContent(result.value);
  await notifyMultipleUsers(subscriberIds, NotificationType.AI_INSIGHT, 'Daily Digest', digest, {
    type: 'daily_digest',
  });
  return { digestLength: digest.length };
}

export async function handleDailyDigestJob(data: DailyDigestJobData) {
  logger.info('[worker:ai] daily-digest job');
  const { messages, subscriberIds } = data;
  if (!messages || !subscriberIds) {
    throw new Error('Missing required fields: messages and subscriberIds');
  }
  return generateDailyDigest(messages, subscriberIds);
}
