import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '../config';
import { assertSpendCapAvailable, assertThreadJob, runAiGeneration } from './_shared';
import type { ResolutionScoreJobData, JobMessageData } from '../types';

async function calculateResolutionScore(threadId: string, messages: JobMessageData[]) {
  logger.info(`Calculating resolution score for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('resolution-score', threadId, () =>
    aiService.calculateResolutionScore(messages),
  );
  if (!result.ok) return null;
  const score = result.value;

  if (score === null) {
    logger.warn(`Resolution score unavailable (malformed AI response) for ${threadId}, skipping DB write`);
    return null;
  }

  await prisma.thread.update({
    where: { id: threadId },
    data: { resolutionScore: score, lastVerifiedAt: new Date() },
  });
  return score;
}

export async function handleResolutionScoreJob(data: ResolutionScoreJobData) {
  logger.info('[worker:ai] resolution-score job');
  assertThreadJob(data);
  const { threadId, messages, subscriberIds, threadName, isOutdated, cronJob } = data;

  // Fetch the current score from DB to avoid stale-oldScore race with on-demand API
  const currentThread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { resolutionScore: true },
  });
  const oldScore = currentThread?.resolutionScore ?? data.oldScore ?? null;

  const resolutionScore = await calculateResolutionScore(threadId, messages);

  if (
    resolutionScore !== null &&
    Array.isArray(subscriberIds) &&
    subscriberIds.length > 0 &&
    typeof threadName === 'string' &&
    oldScore != null &&
    Math.abs(resolutionScore - oldScore) >= 20
  ) {
    await enqueueJob(AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS, {
      subscriberIds,
      threadId,
      threadName,
      oldScore,
      newScore: resolutionScore,
      isOutdated,
      cronJob,
    });
  }

  return { resolutionScore };
}
