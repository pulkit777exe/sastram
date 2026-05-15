export {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  DEFAULT_WORKER_OPTIONS,
  AIJobType,
  FAILED_QUEUE_NAME,
  type QueueName,
  type RedisConnectionConfig,
} from './config';

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
} from './types';

export {
  getRedisConnection,
  closeRedisConnection,
} from './connection';

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
} from './queue';

export {
  startAllWorkers,
  workerDefinitions,
} from './workers';

export {
  handleThreadSummaryJob,
  handleThreadDnaJob,
  handleResolutionScoreJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleAIInsightNotificationsJob,
  handleAIInlineJob,
  handleStalenessCheckJob,
} from './workers/ai.worker';

export { handleEmailJob } from './workers/email.worker';
