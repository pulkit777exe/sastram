import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { logger } from '@/lib/infrastructure/logger';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

// AI Job Types
export enum AIJobType {
  GENERATE_THREAD_SUMMARY = 'generate-thread-summary',
  GENERATE_THREAD_DNA = 'generate-thread-dna',
  CALCULATE_RESOLUTION_SCORE = 'calculate-resolution-score',
  DETECT_CONFLICTS = 'detect-conflicts',
  GENERATE_DAILY_DIGEST = 'generate-daily-digest',
  SEND_AI_INSIGHT_NOTIFICATIONS = 'send-ai-insight-notifications',
}

// Job data types
export interface AIJobData {
  threadId?: string;
  threadName?: string;
  messages?: any[];
  subscriberIds?: string[];
  cronJob?: boolean;
  userId?: string; // Add userId for authorization
  oldScore?: number;
  newScore?: number;
  isOutdated?: boolean;
  conflictResult?: any;
}

// AI Job Queue - initialized lazily
let _aiJobQueue: Queue | null = null;
export function getAiJobQueue(): Queue {
  if (!_aiJobQueue) {
    try {
      _aiJobQueue = new Queue('ai-jobs', {
        connection: redisConfig,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      });
      logger.info('AI job queue initialized');
    } catch (error) {
      logger.error('Failed to initialize AI job queue', error);
      throw error;
    }
  }
  return _aiJobQueue;
}

// Job events listener - initialized lazily
let _aiJobQueueEvents: QueueEvents | null = null;
export function getAiJobQueueEvents(): QueueEvents {
  if (!_aiJobQueueEvents) {
    try {
      _aiJobQueueEvents = new QueueEvents('ai-jobs', {
        connection: redisConfig,
      });
      logger.info('AI job queue events listener initialized');
    } catch (error) {
      logger.error('Failed to initialize AI job queue events listener', error);
      throw error;
    }
  }
  return _aiJobQueueEvents;
}

// AI Job Worker - initialized lazily
let _aiJobWorker: Worker | null = null;
export function getAiJobWorker(): Worker {
  if (!_aiJobWorker) {
    try {
      _aiJobWorker = new Worker(
        'ai-jobs',
        async (job: Job<AIJobData>) => {
          logger.info(`Processing AI job: ${job.name} (${job.id})`);

          const { 
            threadId, 
            messages, 
            subscriberIds, 
            cronJob,
            oldScore,
            newScore,
            isOutdated,
            conflictResult,
            threadName
          } = job.data;

          try {
            switch (job.name) {
              case AIJobType.GENERATE_THREAD_SUMMARY:
                if (!threadId || !messages) {
                  throw new Error('Missing required fields: threadId and messages');
                }
                return await handleGenerateThreadSummary(threadId, messages);
              case AIJobType.GENERATE_THREAD_DNA:
                if (!threadId || !messages) {
                  throw new Error('Missing required fields: threadId and messages');
                }
                return await handleGenerateThreadDNA(threadId, messages);
              case AIJobType.CALCULATE_RESOLUTION_SCORE:
                if (!threadId || !messages) {
                  throw new Error('Missing required fields: threadId and messages');
                }
                return await handleCalculateResolutionScore(threadId, messages);
              case AIJobType.DETECT_CONFLICTS:
                if (!threadId || !messages) {
                  throw new Error('Missing required fields: threadId and messages');
                }
                return await handleDetectConflicts(threadId, messages);
              case AIJobType.GENERATE_DAILY_DIGEST:
                if (!messages || !subscriberIds) {
                  throw new Error('Missing required fields: messages and subscriberIds');
                }
                return await handleGenerateDailyDigest(messages, subscriberIds);
              case AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS:
                if (!subscriberIds || !threadId || !threadName) {
                  throw new Error('Missing required fields: subscriberIds, threadId, and threadName');
                }
                return await handleSendAIInsightNotifications(
                  subscriberIds, 
                  threadId, 
                  threadName, 
                  oldScore, 
                  newScore, 
                  isOutdated, 
                  conflictResult
                );
              default:
                throw new Error(`Unknown job type: ${job.name}`);
            }
          } catch (error) {
            logger.error(`Failed to process AI job: ${job.name} (${job.id})`, error);
            throw error;
          }
        },
        {
          connection: redisConfig,
          concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || '3', 10),
        },
      );

      // Job result handlers
      _aiJobWorker.on('completed', (job?: Job<AIJobData>) => {
        if (job) {
          logger.info(`AI job completed: ${job.name} (${job.id})`);
        }
      });

      _aiJobWorker.on('failed', (job?: Job<AIJobData>, err?: Error) => {
        if (job && err) {
          logger.error(`AI job failed: ${job.name} (${job.id})`, err);
        }
      });

      logger.info('AI job queue worker initialized');
    } catch (error) {
      logger.error('Failed to initialize AI job queue worker', error);
      throw error;
    }
  }
  return _aiJobWorker;
}

// Import handlers dynamically to avoid circular dependencies
async function handleGenerateThreadSummary(threadId: string, messages: any[]) {
  const { prisma } = await import('@/lib/infrastructure/prisma');
  const { aiService } = await import('@/lib/services/ai');

  logger.info(`Generating thread summary for thread: ${threadId}`);
  const summary = await aiService.generateThreadSummary(messages);
  
  await prisma.section.update({
    where: { id: threadId },
    data: { aiSummary: summary },
  });

  return { summary };
}

async function handleGenerateThreadDNA(threadId: string, messages: any[]) {
  const { prisma } = await import('@/lib/infrastructure/prisma');
  const { aiService } = await import('@/lib/services/ai');

  logger.info(`Generating thread DNA for thread: ${threadId}`);
  const threadDNA = await aiService.generateThreadDNA(messages);
  
  await prisma.section.update({
    where: { id: threadId },
    data: { threadDna: threadDNA },
  });

  return { threadDNA };
}

async function handleCalculateResolutionScore(threadId: string, messages: any[]) {
  const { prisma } = await import('@/lib/infrastructure/prisma');
  const { aiService } = await import('@/lib/services/ai');

  logger.info(`Calculating resolution score for thread: ${threadId}`);
  const score = await aiService.calculateResolutionScore(messages);
  
  await prisma.section.update({
    where: { id: threadId },
    data: { resolutionScore: score },
  });

  return { resolutionScore: score };
}

async function handleDetectConflicts(threadId: string, messages: any[]) {
  const { prisma } = await import('@/lib/infrastructure/prisma');
  const { aiService } = await import('@/lib/services/ai');

  logger.info(`Detecting conflicts for thread: ${threadId}`);
  const conflictResult = await aiService.detectConflicts(messages);
  
  if (conflictResult.hasConflict) {
    await prisma.section.update({
      where: { id: threadId },
      data: { 
        isOutdated: true,
        lastVerifiedAt: new Date(),
      },
    });
  }

  return { conflictResult };
}

async function handleGenerateDailyDigest(messages: any[], subscriberIds: string[]) {
  const { notifyMultipleUsers } = await import('@/modules/notifications/repository');
  const { NotificationType } = await import('@prisma/client');
  const { aiService } = await import('@/lib/services/ai');

  logger.info(`Generating daily digest for ${subscriberIds.length} subscribers`);
  
  const digest = await aiService.generateDailyDigest(messages);
  
  await notifyMultipleUsers(
    subscriberIds,
    NotificationType.AI_INSIGHT,
    'Daily Digest',
    digest,
    { type: 'daily_digest' }
  );

  return { digestLength: digest.length };
}

async function handleSendAIInsightNotifications(
  subscriberIds: string[],
  threadId: string,
  threadName: string,
  oldScore?: number,
  newScore?: number,
  isOutdated?: boolean,
  conflictResult?: any
) {
  const { notifyMultipleUsers } = await import('@/modules/notifications/repository');
  const { NotificationType } = await import('@prisma/client');

  logger.info(`Sending AI insight notifications for thread: ${threadId}`);
  
  const notifications = [];
  
  // Send resolution score change notification if significant (>= 20 points)
  if (oldScore != null && newScore != null && Math.abs(newScore - oldScore) >= 20) {
    notifications.push({
      userIds: subscriberIds,
      type: NotificationType.AI_INSIGHT,
      title: `Resolution score updated for "${threadName}"`,
      message: `The resolution score for this thread has changed from ${oldScore} to ${newScore}.`,
      data: {
        threadId,
        threadName,
        oldScore,
        newScore,
        type: "resolution_score_change"
      }
    });
  }

  // Send outdated thread notification
  if (isOutdated) {
    notifications.push({
      userIds: subscriberIds,
      type: NotificationType.AI_INSIGHT,
      title: `Thread "${threadName}" may be outdated`,
      message: "This thread hasn't been updated in over a week and may contain outdated information.",
      data: {
        threadId,
        threadName,
        type: "thread_outdated"
      }
    });
  }

  // Send conflict detection notification
  if (conflictResult?.hasConflict) {
    notifications.push({
      userIds: subscriberIds,
      type: NotificationType.AI_INSIGHT,
      title: `Conflict detected in "${threadName}"`,
      message: conflictResult.reason || "A conflict has been detected in this thread. Please review the messages.",
      data: {
        threadId,
        threadName,
        conflictingMessages: conflictResult.conflictingMessages,
        type: "conflict_detected"
      }
    });
  }

  // Send all notifications
  for (const notification of notifications) {
    await notifyMultipleUsers(
      notification.userIds,
      notification.type,
      notification.title,
      notification.message,
      notification.data
    );
  }

  return { notificationsSent: notifications.length };
}
