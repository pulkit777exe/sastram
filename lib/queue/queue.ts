import { Queue, QueueEvents } from 'bullmq';
import { logger } from '@/lib/infrastructure/logger';
import {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  FAILED_QUEUE_NAME,
  AIJobType,
  type QueueName,
} from './config';
import { getRedisConnection } from './connection';
import type { AIInlineJobData } from './types';
import type { JobsOptions } from 'bullmq';

const queueCache = new Map<string, Queue>();

function getQueue(queueName: QueueName): Queue {
  const existing = queueCache.get(queueName);
  if (existing) return existing;

  const queue = new Queue(queueName, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  queueCache.set(queueName, queue);
  logger.info(`[queue] Initialized: ${queueName}`);

  return queue;
}

const eventsCache = new Map<string, QueueEvents>();

function getQueueEvents(queueName: QueueName): QueueEvents {
  const key = `events:${queueName}`;
  const existing = eventsCache.get(key);
  if (existing) return existing;

  const events = new QueueEvents(queueName, {
    connection: getRedisConnection(),
  });

  eventsCache.set(key, events);
  return events;
}

let _failedQueue: Queue | null = null;

export function getFailedQueue(): Queue {
  if (!_failedQueue) {
    _failedQueue = new Queue(FAILED_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _failedQueue;
}

async function addJob(
  queueName: QueueName,
  jobName: string,
  data: Record<string, unknown>,
  opts?: Partial<JobsOptions>,
) {
  const queue = getQueue(queueName);
  return queue.add(jobName, data, opts);
}

// Queue getters

export function getThreadSummaryQueue(): Queue {
  return getQueue(QUEUE_NAMES.THREAD_SUMMARY);
}

function getThreadSummaryQueueEvents(): QueueEvents {
  return getQueueEvents(QUEUE_NAMES.THREAD_SUMMARY);
}

export function getResolutionScoreQueue(): Queue {
  return getQueue(QUEUE_NAMES.RESOLUTION_SCORE);
}

export function getThreadDnaQueue(): Queue {
  return getQueue(QUEUE_NAMES.THREAD_DNA);
}

export function getConflictDetectionQueue(): Queue {
  return getQueue(QUEUE_NAMES.CONFLICT_DETECTION);
}

export function getDailyDigestQueue(): Queue {
  return getQueue(QUEUE_NAMES.DAILY_DIGEST);
}

export function getAiInsightNotificationsQueue(): Queue {
  return getQueue(QUEUE_NAMES.AI_INSIGHT_NOTIFICATIONS);
}

export function getEmailQueue(): Queue {
  return getQueue(QUEUE_NAMES.EMAIL);
}

export function getAiInlineQueue(): Queue {
  return getQueue(QUEUE_NAMES.AI_INLINE);
}

export function getStalenessCheckQueue(): Queue {
  return getQueue(QUEUE_NAMES.STALENESS_CHECK);
}

export async function enqueueInlineJob(data: AIInlineJobData): Promise<void> {
  const { AIJobType, DEFAULT_JOB_OPTIONS } = await import('./config');
  await getAiInlineQueue().add(AIJobType.GENERATE_AI_INLINE, data, DEFAULT_JOB_OPTIONS);
}

export function getAiPipelineQueues(): Queue[] {
  return [
    getThreadSummaryQueue(),
    getThreadDnaQueue(),
    getResolutionScoreQueue(),
    getConflictDetectionQueue(),
    getDailyDigestQueue(),
    getAiInsightNotificationsQueue(),
    getAiInlineQueue(),
    getStalenessCheckQueue(),
  ];
}

// Backward-compatible export
export function getAiJobQueue(): Queue {
  return getThreadSummaryQueue();
}

function getAiJobQueueEvents(): QueueEvents {
  return getThreadSummaryQueueEvents();
}

export function getQueueForAIJobType(jobType: AIJobType): Queue {
  switch (jobType) {
    case AIJobType.GENERATE_THREAD_SUMMARY:
      return getThreadSummaryQueue();
    case AIJobType.GENERATE_THREAD_DNA:
      return getThreadDnaQueue();
    case AIJobType.CALCULATE_RESOLUTION_SCORE:
      return getResolutionScoreQueue();
    case AIJobType.DETECT_CONFLICTS:
      return getConflictDetectionQueue();
    case AIJobType.GENERATE_DAILY_DIGEST:
      return getDailyDigestQueue();
    case AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS:
      return getAiInsightNotificationsQueue();
    default:
      return getThreadSummaryQueue();
  }
}

async function closeAllQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const [, queue] of queueCache) {
    closePromises.push(queue.close());
  }
  for (const [, events] of eventsCache) {
    closePromises.push(events.close());
  }
  if (_failedQueue) {
    closePromises.push(_failedQueue.close());
  }
  await Promise.all(closePromises);
  queueCache.clear();
  eventsCache.clear();
  _failedQueue = null;
  logger.info('[queue] All queues closed');
}
