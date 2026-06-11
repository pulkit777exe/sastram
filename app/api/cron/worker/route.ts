import { NextRequest, NextResponse } from 'next/server';
import { Queue, type Job } from 'bullmq';
import { logger } from '@/lib/infrastructure/logger';
import {
  QUEUE_NAMES,
  handleAIInlineJob,
  handleAIInsightNotificationsJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleEmailJob,
  handleResolutionScoreJob,
  handleStalenessCheckJob,
  handleThreadDnaJob,
  handleThreadSummaryJob,
} from '@/lib/infrastructure/bullmq';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { ok, fail } from '@/lib/utils/api-response';
import { getRedisConnection } from '@/lib/queue/connection';

export const maxDuration = 300;

const queueHandlers: Record<string, (job: Job) => Promise<unknown>> = {
  [QUEUE_NAMES.THREAD_SUMMARY]: handleThreadSummaryJob,
  [QUEUE_NAMES.RESOLUTION_SCORE]: handleResolutionScoreJob,
  [QUEUE_NAMES.THREAD_DNA]: handleThreadDnaJob,
  [QUEUE_NAMES.CONFLICT_DETECTION]: handleConflictDetectionJob,
  [QUEUE_NAMES.DAILY_DIGEST]: handleDailyDigestJob,
  [QUEUE_NAMES.AI_INSIGHT_NOTIFICATIONS]: handleAIInsightNotificationsJob,
  [QUEUE_NAMES.EMAIL]: handleEmailJob,
  [QUEUE_NAMES.AI_INLINE]: handleAIInlineJob,
  [QUEUE_NAMES.STALENESS_CHECK]: handleStalenessCheckJob,
};

async function drainQueue(queueName: string, handler: (job: Job) => Promise<unknown>) {
  const queue = new Queue(queueName, { connection: getRedisConnection() });
  const jobs = await queue.getWaiting();

  if (jobs.length === 0) {
    await queue.close();
    return { processed: 0, failed: 0, total: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await handler(job);
      await job.moveToCompleted(undefined, 'cron-drain', false);
      processed++;
    } catch (error) {
      logger.error(`[${queueName}] Job ${job.id} failed:`, error);
      await job.moveToFailed(error as Error, 'cron-drain', false);
      failed++;
    }
  }

  await queue.close();
  return { processed, failed, total: jobs.length };
}

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  const url = new URL(req.url);
  const queue = url.searchParams.get('queue');

  if (!queue || !queueHandlers[queue]) {
    return NextResponse.json(
      ok({
        availableQueues: Object.keys(queueHandlers),
        usage: '/api/cron/worker?queue=THREAD_SUMMARY',
      })
    );
  }

  try {
    const result = await drainQueue(queue, queueHandlers[queue]);
    return NextResponse.json(ok({ queue, ...result }));
  } catch (error) {
    logger.error(`[Worker] ${queue} failed:`, error);
    return NextResponse.json(fail('INTERNAL_ERROR', `Failed to process queue: ${queue}`), { status: 500 });
  }
}
