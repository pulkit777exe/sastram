/**
 * Backward-compatible re-exports from the refactored lib/queue module.
 *
 * All new code should import directly from `@/lib/queue`.
 */
export {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  DEFAULT_WORKER_OPTIONS,
  AIJobType,
  FAILED_QUEUE_NAME,
} from '@/lib/queue/config';

export type { QueueName, RedisConnectionConfig } from '@/lib/queue/config';

export type {
  JobMessageData,
  AIConflictResult,
  ThreadSummaryJobData,
  ThreadDnaJobData,
  ResolutionScoreJobData,
  ConflictDetectionJobData,
  DailyDigestJobData,
  AIInsightNotificationJobData,
  EmailJobData,
  AIInlineJobData,
  StalenessCheckJobData,
} from '@/lib/queue/types';

export {
  getRedisConnection,
  closeRedisConnection,
} from '@/lib/queue/connection';

export {
  getThreadSummaryQueue,
  getResolutionScoreQueue,
  getThreadDnaQueue,
  getConflictDetectionQueue,
  getDailyDigestQueue,
  getAiInsightNotificationsQueue,
  getEmailQueue,
  getAiInlineQueue,
  getStalenessCheckQueue,
  getAiJobQueue,
  getAiPipelineQueues,
  getQueueForAIJobType,
  getFailedQueue,
  enqueueInlineJob,
} from '@/lib/queue/queue';

export {
  handleThreadSummaryJob,
  handleThreadDnaJob,
  handleResolutionScoreJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleAIInsightNotificationsJob,
  handleAIInlineJob,
  handleStalenessCheckJob,
} from '@/lib/queue/workers/ai.worker';

export { handleEmailJob } from '@/lib/queue/workers/email.worker';

import { getRedisConnection as _getRedisConn } from '@/lib/queue/connection';

/**
 * Backward-compatible Redis connection object.
 * Previously returned a plain config object; now returns the live IORedis instance.
 */
export const redisConnection = _getRedisConn();
