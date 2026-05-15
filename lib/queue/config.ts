import type { ConnectionOptions, JobsOptions, WorkerOptions } from 'bullmq';

export const QUEUE_NAMES = {
  THREAD_SUMMARY: 'thread-summary',
  RESOLUTION_SCORE: 'resolution-score',
  THREAD_DNA: 'thread-dna',
  CONFLICT_DETECTION: 'conflict-detection',
  DAILY_DIGEST: 'daily-digest',
  AI_INSIGHT_NOTIFICATIONS: 'ai-insight-notifications',
  EMAIL: 'email',
  AI_INLINE: 'ai-inline',
  STALENESS_CHECK: 'staleness-check',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

export const DEFAULT_WORKER_OPTIONS: Omit<WorkerOptions, 'connection'> = {
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
};

export enum AIJobType {
  GENERATE_THREAD_SUMMARY = 'generate-thread-summary',
  GENERATE_THREAD_DNA = 'generate-thread-dna',
  CALCULATE_RESOLUTION_SCORE = 'calculate-resolution-score',
  DETECT_CONFLICTS = 'detect-conflicts',
  GENERATE_DAILY_DIGEST = 'generate-daily-digest',
  SEND_AI_INSIGHT_NOTIFICATIONS = 'send-ai-insight-notifications',
  GENERATE_AI_INLINE = 'generate-ai-inline',
}

export const FAILED_QUEUE_NAME = 'failed-jobs';

interface RedisConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  retryStrategy?: (times: number) => number | null;
}

export type { RedisConnectionConfig, ConnectionOptions };
