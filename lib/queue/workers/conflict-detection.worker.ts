import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '../config';
import { assertSpendCapAvailable, assertThreadJob, runAiGeneration } from './_shared';
import type { ConflictDetectionJobData, JobMessageData } from '../types';

async function detectConflicts(threadId: string, messages: JobMessageData[]) {
  logger.info(`Detecting conflicts for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('conflict-detection', threadId, () =>
    aiService.detectConflicts(messages),
  );
  if (!result.ok) return { conflictResult: null, skipped: true };
  const conflictResult = result.value;
  if (conflictResult.hasConflict) {
    await prisma.thread.update({
      where: { id: threadId },
      data: { isOutdated: true, lastVerifiedAt: new Date() },
    });
  }
  return { conflictResult };
}

export async function handleConflictDetectionJob(data: ConflictDetectionJobData) {
  logger.info('[worker:ai] conflict-detection job');
  assertThreadJob(data);
  const { threadId, messages, subscriberIds, threadName, oldScore, cronJob } = data;

  const { conflictResult } = await detectConflicts(threadId, messages);

  if (
    conflictResult?.hasConflict &&
    Array.isArray(subscriberIds) &&
    subscriberIds.length > 0 &&
    typeof threadName === 'string'
  ) {
    await enqueueJob(AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS, {
      subscriberIds,
      threadId,
      threadName,
      oldScore: oldScore ?? undefined,
      isOutdated: true,
      conflictResult,
      cronJob,
    });
  }

  return { conflictResult };
}
