import { Worker, type Job } from 'bullmq';
import { logger } from '@/lib/infrastructure/logger';
import { QUEUE_NAMES, DEFAULT_WORKER_OPTIONS } from '../config';
import { getRedisConnection } from '../connection';
import { getFailedQueue } from '../queue';

import {
  handleThreadSummaryJob,
  handleThreadDnaJob,
  handleResolutionScoreJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleAIInsightNotificationsJob,
  handleAIInlineJob,
  handleStalenessCheckJob,
} from './ai.worker';
import { handleEmailJob } from './email.worker';

const workers: Worker[] = [];

interface WorkerDefinition {
  queueName: string;
  handler: (job: Job) => Promise<unknown>;
  concurrency?: number;
}

const definitions: WorkerDefinition[] = [
  { queueName: QUEUE_NAMES.THREAD_SUMMARY, handler: handleThreadSummaryJob },
  { queueName: QUEUE_NAMES.RESOLUTION_SCORE, handler: handleResolutionScoreJob },
  { queueName: QUEUE_NAMES.THREAD_DNA, handler: handleThreadDnaJob },
  { queueName: QUEUE_NAMES.CONFLICT_DETECTION, handler: handleConflictDetectionJob },
  { queueName: QUEUE_NAMES.DAILY_DIGEST, handler: handleDailyDigestJob },
  { queueName: QUEUE_NAMES.AI_INSIGHT_NOTIFICATIONS, handler: handleAIInsightNotificationsJob },
  { queueName: QUEUE_NAMES.EMAIL, handler: handleEmailJob },
  { queueName: QUEUE_NAMES.AI_INLINE, handler: handleAIInlineJob },
  { queueName: QUEUE_NAMES.STALENESS_CHECK, handler: handleStalenessCheckJob },
];

function createWorker({ queueName, handler }: WorkerDefinition): Worker {
  const worker = new Worker(queueName, handler, {
    ...DEFAULT_WORKER_OPTIONS,
    connection: getRedisConnection(),
  });

  worker.on('completed', (job) => {
    logger.info(`[worker] ${queueName}: job ${job?.id} completed`);
  });

  worker.on('failed', async (job, err) => {
    logger.error(`[worker] ${queueName}: job ${job?.id} failed after ${job?.attemptsMade} attempts`, {
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });

    if (job && job.attemptsMade === job.opts.attempts) {
      const failedQueue = getFailedQueue();
      await failedQueue.add('dlq', {
        originalQueue: queueName,
        jobId: job.id,
        jobData: job.data,
        failedError: err.message,
        failedAt: new Date().toISOString(),
      });
      logger.error(`[worker] ${queueName}: job ${job.id} moved to dead letter queue`);
    }
  });

  worker.on('error', (err) => {
    logger.error(`[worker] ${queueName}: error`, { error: err.message });
  });

  worker.on('ready', () => {
    logger.info(`[worker] ${queueName}: ready`);
  });

  worker.on('closing', (msg) => {
    logger.info(`[worker] ${queueName}: closing — ${msg}`);
  });

  return worker;
}

export function startAllWorkers(): Worker[] {
  if (workers.length > 0) {
    logger.warn('[worker] Workers already running, skipping initialization');
    return workers;
  }

  logger.info('[worker] Starting all workers...', {
    queues: definitions.map((d) => d.queueName),
  });

  for (const def of definitions) {
    const worker = createWorker(def);
    workers.push(worker);
  }

  logger.info(`[worker] ${workers.length} workers started`);
  return workers;
}

export async function stopAllWorkers(): Promise<void> {
  if (workers.length === 0) return;

  logger.info('[worker] Shutting down all workers...');
  await Promise.all(
    workers.map(async (worker) => {
      try {
        await worker.close();
      } catch (err) {
        logger.error('[worker] Error closing worker', { error: String(err) });
      }
    }),
  );
  workers.length = 0;
  logger.info('[worker] All workers shut down');
}

export { definitions as workerDefinitions };
