import { NextRequest, NextResponse } from 'next/server';
import { Worker } from 'bullmq';
import { logger } from '@/lib/infrastructure/logger';
import {
  QUEUE_NAMES,
  redisConnection,
  handleAIInlineJob,
  handleAIInsightNotificationsJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleEmailJob,
  handleResolutionScoreJob,
  handleStalenessCheckJob,
  handleThreadDnaJob,
  handleThreadSummaryJob,
  type AIInlineJobData,
  type AIInsightNotificationJobData,
  type ConflictDetectionJobData,
  type DailyDigestJobData,
  type ResolutionScoreJobData,
  type StalenessCheckJobData,
  type ThreadDnaJobData,
  type ThreadSummaryJobData,
} from '@/lib/infrastructure/bullmq';

export const maxDuration = 300;

const queueHandlers: Record<string, (job: any) => Promise<unknown>> = {
  [QUEUE_NAMES.THREAD_SUMMARY]: (job) => handleThreadSummaryJob(job),
  [QUEUE_NAMES.RESOLUTION_SCORE]: (job) => handleResolutionScoreJob(job),
  [QUEUE_NAMES.THREAD_DNA]: (job) => handleThreadDnaJob(job),
  [QUEUE_NAMES.CONFLICT_DETECTION]: (job) => handleConflictDetectionJob(job),
  [QUEUE_NAMES.DAILY_DIGEST]: (job) => handleDailyDigestJob(job),
  [QUEUE_NAMES.AI_INSIGHT_NOTIFICATIONS]: (job) => handleAIInsightNotificationsJob(job),
  [QUEUE_NAMES.EMAIL]: (job) => handleEmailJob(job),
  [QUEUE_NAMES.AI_INLINE]: (job) => handleAIInlineJob(job),
  [QUEUE_NAMES.STALENESS_CHECK]: (job) => handleStalenessCheckJob(job),
};

async function processQueue(queueName: string, handler: (job: any) => Promise<unknown>) {
  const worker = new Worker(queueName, handler, {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  let processed = 0;
  let failed = 0;

  worker.on('completed', () => {
    processed++;
  });

  worker.on('failed', (_, error) => {
    logger.error(`[${queueName}] Job failed:`, error);
    failed++;
  });

  await worker.run();

  setTimeout(async () => {
    await worker.close();
  }, 25000);

  return { processed, failed };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const queue = url.searchParams.get('queue');

  if (!queue || !queueHandlers[queue]) {
    return NextResponse.json({
      availableQueues: Object.keys(queueHandlers),
      usage: '/api/cron/worker?queue=THREAD_SUMMARY',
    });
  }

  try {
    const result = await processQueue(queue, queueHandlers[queue]);
    return NextResponse.json({
      queue,
      ...result,
    });
  } catch (error) {
    logger.error(`[Worker] ${queue} failed:`, error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}