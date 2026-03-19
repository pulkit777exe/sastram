import { Job, Worker } from "bullmq";
import { logger } from "../lib/infrastructure/logger";
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
  type EmailJobData,
  type ResolutionScoreJobData,
  type StalenessCheckJobData,
  type ThreadDnaJobData,
  type ThreadSummaryJobData,
} from "../lib/infrastructure/bullmq";

type QueueDefinition = {
  queueName: string;
  handler: (job: Job) => Promise<unknown>;
};

const queueDefinitions: QueueDefinition[] = [
  {
    queueName: QUEUE_NAMES.THREAD_SUMMARY,
    handler: (job) => handleThreadSummaryJob(job as Job<ThreadSummaryJobData>),
  },
  {
    queueName: QUEUE_NAMES.RESOLUTION_SCORE,
    handler: (job) =>
      handleResolutionScoreJob(job as Job<ResolutionScoreJobData>),
  },
  {
    queueName: QUEUE_NAMES.THREAD_DNA,
    handler: (job) => handleThreadDnaJob(job as Job<ThreadDnaJobData>),
  },
  {
    queueName: QUEUE_NAMES.CONFLICT_DETECTION,
    handler: (job) =>
      handleConflictDetectionJob(job as Job<ConflictDetectionJobData>),
  },
  {
    queueName: QUEUE_NAMES.DAILY_DIGEST,
    handler: (job) => handleDailyDigestJob(job as Job<DailyDigestJobData>),
  },
  {
    queueName: QUEUE_NAMES.AI_INSIGHT_NOTIFICATIONS,
    handler: (job) =>
      handleAIInsightNotificationsJob(job as Job<AIInsightNotificationJobData>),
  },
  {
    queueName: QUEUE_NAMES.EMAIL,
    handler: (job) => handleEmailJob(job as Job<EmailJobData>),
  },
  {
    queueName: QUEUE_NAMES.AI_INLINE,
    handler: (job) => handleAIInlineJob(job as Job<AIInlineJobData>),
  },
  {
    queueName: QUEUE_NAMES.STALENESS_CHECK,
    handler: (job) =>
      handleStalenessCheckJob(job as Job<StalenessCheckJobData>),
  },
];

const workers = queueDefinitions.map(({ queueName, handler }) => {
  const worker = new Worker(queueName, handler, {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  worker.on("failed", (job, err) => {
    logger.error(`[${queueName}] job ${job?.id} failed`, {
      error: err.message,
      jobData: job?.data,
      attemptsMade: job?.attemptsMade,
    });
  });

  worker.on("error", (err) => {
    logger.error(`[${queueName}] worker error`, { error: err.message });
  });

  worker.on("ready", () => {
    logger.info(`[${queueName}] worker ready`);
  });

  return worker;
});

async function shutdown(signal: string) {
  logger.info(`Worker shutdown signal received: ${signal}`);

  await Promise.all(
    workers.map(async (worker) => {
      await worker.close();
    }),
  );

  logger.info("All BullMQ workers shut down cleanly");
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

logger.info("BullMQ worker process started", {
  queues: queueDefinitions.map((definition) => definition.queueName),
});
