import { Job, Queue, QueueEvents, type JobsOptions } from 'bullmq';
import { logger } from '@/lib/infrastructure/logger';

const DEFAULT_REDIS_PORT = 6379;

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

export enum AIJobType {
  GENERATE_THREAD_SUMMARY = 'generate-thread-summary',
  GENERATE_THREAD_DNA = 'generate-thread-dna',
  CALCULATE_RESOLUTION_SCORE = 'calculate-resolution-score',
  DETECT_CONFLICTS = 'detect-conflicts',
  GENERATE_DAILY_DIGEST = 'generate-daily-digest',
  SEND_AI_INSIGHT_NOTIFICATIONS = 'send-ai-insight-notifications',
}

export interface AIConflictResult {
  hasConflict: boolean;
  conflictingMessages?: number[];
  reason?: string;
}

export interface ThreadSummaryJobData {
  threadId: string;
  messages: any[];
  userId?: string;
  cronJob?: boolean;
}

export interface ThreadDnaJobData {
  threadId: string;
  messages: any[];
  userId?: string;
  cronJob?: boolean;
}

export interface ResolutionScoreJobData {
  threadId: string;
  messages: any[];
  subscriberIds?: string[];
  threadName?: string;
  oldScore?: number | null;
  isOutdated?: boolean;
  userId?: string;
  cronJob?: boolean;
}

export interface ConflictDetectionJobData {
  threadId: string;
  messages: any[];
  subscriberIds?: string[];
  threadName?: string;
  oldScore?: number | null;
  userId?: string;
  cronJob?: boolean;
}

export interface DailyDigestJobData {
  messages: any[];
  subscriberIds: string[];
  threadId?: string;
  userId?: string;
  cronJob?: boolean;
}

export interface AIInsightNotificationJobData {
  subscriberIds: string[];
  threadId: string;
  threadName: string;
  oldScore?: number;
  newScore?: number;
  isOutdated?: boolean;
  conflictResult?: AIConflictResult;
  userId?: string;
  cronJob?: boolean;
}

export interface EmailJobData {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface AIInlineJobData {
  messageId: string;
  threadId: string;
  sectionId: string;
  query: string;
  userId: string;
}

export interface StalenessCheckJobData {
  threadId?: string;
  cronJob?: boolean;
  triggeredBy?: string;
}

type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
};

function buildRedisConnection(): RedisConnectionOptions {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : DEFAULT_REDIS_PORT,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        tls: parsed.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };
    } catch (error) {
      logger.warn('Invalid REDIS_URL. Falling back to REDIS_HOST/REDIS_PORT', error);
    }
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || String(DEFAULT_REDIS_PORT)),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export const redisConnection = buildRedisConnection();

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

export const FAILED_QUEUE_NAME = 'failed-jobs';

export const failedQueue = new Queue(FAILED_QUEUE_NAME, {
  connection: redisConnection,
});

const queueCache = new Map<QueueName, Queue>();

function getQueue(queueName: QueueName): Queue {
  const existingQueue = queueCache.get(queueName);
  if (existingQueue) {
    return existingQueue;
  }

  const queue = new Queue(queueName, {
    connection: redisConnection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  queueCache.set(queueName, queue);
  logger.info(`Queue initialized: ${queueName}`);

  return queue;
}

let threadSummaryQueueEvents: QueueEvents | null = null;
export function getThreadSummaryQueueEvents(): QueueEvents {
  if (!threadSummaryQueueEvents) {
    threadSummaryQueueEvents = new QueueEvents(QUEUE_NAMES.THREAD_SUMMARY, {
      connection: redisConnection,
    });
  }

  return threadSummaryQueueEvents;
}

export function getThreadSummaryQueue(): Queue {
  return getQueue(QUEUE_NAMES.THREAD_SUMMARY);
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

// Backward-compatible exports used by existing routes.
export function getAiJobQueue(): Queue {
  return getThreadSummaryQueue();
}

// Backward-compatible exports used by existing routes.
export function getAiJobQueueEvents(): QueueEvents {
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

export async function handleThreadSummaryJob(job: Job<ThreadSummaryJobData>) {
  logger.info(`Processing thread summary job ${job.id}`);
  const { threadId, messages } = job.data;

  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }

  return handleGenerateThreadSummary(threadId, messages);
}

export async function handleThreadDnaJob(job: Job<ThreadDnaJobData>) {
  logger.info(`Processing thread DNA job ${job.id}`);
  const { threadId, messages } = job.data;

  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }

  return handleGenerateThreadDNA(threadId, messages);
}

export async function handleResolutionScoreJob(job: Job<ResolutionScoreJobData>) {
  logger.info(`Processing resolution score job ${job.id}`);
  const { threadId, messages, subscriberIds, threadName, oldScore, isOutdated, cronJob } = job.data;

  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }

  const resolutionScore = await handleCalculateResolutionScore(threadId, messages);

  if (
    Array.isArray(subscriberIds) &&
    subscriberIds.length > 0 &&
    typeof threadName === 'string' &&
    oldScore != null &&
    Math.abs(resolutionScore - oldScore) >= 20
  ) {
    await getAiInsightNotificationsQueue().add(
      AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS,
      {
        subscriberIds,
        threadId,
        threadName,
        oldScore,
        newScore: resolutionScore,
        isOutdated,
        cronJob,
      } satisfies AIInsightNotificationJobData,
      DEFAULT_JOB_OPTIONS
    );
  }

  return { resolutionScore };
}

export async function handleConflictDetectionJob(job: Job<ConflictDetectionJobData>) {
  logger.info(`Processing conflict detection job ${job.id}`);
  const { threadId, messages, subscriberIds, threadName, oldScore, cronJob } = job.data;

  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }

  const { conflictResult } = await handleDetectConflicts(threadId, messages);

  if (
    conflictResult.hasConflict &&
    Array.isArray(subscriberIds) &&
    subscriberIds.length > 0 &&
    typeof threadName === 'string'
  ) {
    await getAiInsightNotificationsQueue().add(
      AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS,
      {
        subscriberIds,
        threadId,
        threadName,
        oldScore: oldScore ?? undefined,
        isOutdated: true,
        conflictResult,
        cronJob,
      } satisfies AIInsightNotificationJobData,
      DEFAULT_JOB_OPTIONS
    );
  }

  return { conflictResult };
}

export async function handleDailyDigestJob(job: Job<DailyDigestJobData>) {
  logger.info(`Processing daily digest job ${job.id}`);
  const { messages, subscriberIds } = job.data;

  if (!messages || !subscriberIds) {
    throw new Error('Missing required fields: messages and subscriberIds');
  }

  return handleGenerateDailyDigest(messages, subscriberIds);
}

export async function handleAIInsightNotificationsJob(job: Job<AIInsightNotificationJobData>) {
  logger.info(`Processing AI insight notifications job ${job.id}`);
  const { subscriberIds, threadId, threadName, oldScore, newScore, isOutdated, conflictResult } =
    job.data;

  if (!subscriberIds || !threadId || !threadName) {
    throw new Error('Missing required fields: subscriberIds, threadId, and threadName');
  }

  return handleSendAIInsightNotifications(
    subscriberIds,
    threadId,
    threadName,
    oldScore,
    newScore,
    isOutdated,
    conflictResult
  );
}

export async function handleEmailJob(job: Job<EmailJobData>) {
  logger.info(`Processing email job ${job.id}`);
  const { sendEmailNow } = await import('@/lib/services/email');
  return sendEmailNow(job.data);
}

export async function handleAIInlineJob(job: Job<AIInlineJobData>) {
  logger.info(`Processing AI inline job ${job.id}`);
  const { messageId, sectionId, query } = job.data;

  if (!messageId || !sectionId || !query) {
    throw new Error('Missing required fields: messageId, sectionId, query');
  }

  const { prisma } = await import('@/lib/infrastructure/prisma');
  const { aiService } = await import('@/lib/services/ai');
  const { emitThreadMessage } = await import('@/modules/ws/publisher');

  const parentMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      depth: true,
      sectionId: true,
    },
  });

  if (!parentMessage) {
    throw new Error(`Parent message ${messageId} not found`);
  }

  const recentMessages = await prisma.message.findMany({
    where: { sectionId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      content: true,
      sender: {
        select: {
          name: true,
        },
      },
    },
  });

  const context = recentMessages
    .reverse()
    .map((message) => `${message.sender?.name || 'User'}: ${message.content}`)
    .join('\n');

  const aiUser = await prisma.user.upsert({
    where: { email: 'ai@sastram.system' },
    update: {
      name: 'Sastram AI',
      emailVerified: true,
    },
    create: {
      email: 'ai@sastram.system',
      name: 'Sastram AI',
      emailVerified: true,
      role: 'USER',
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      image: true,
    },
  });

  // Create initial AI message with empty content
  const aiMessage = await prisma.message.create({
    data: {
      content: '',
      sectionId,
      senderId: aiUser.id,
      parentId: parentMessage.id,
      depth: Math.min((parentMessage.depth ?? 0) + 1, 4),
      isAiResponse: true,
      isEdited: false,
      isPinned: false,
      likeCount: 0,
      replyCount: 0,
    },
    include: {
      section: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  // Emit initial empty message to notify clients
  emitThreadMessage(sectionId, {
    id: aiMessage.id,
    content: '',
    senderId: aiUser.id,
    senderName: aiUser.name,
    senderAvatar: aiUser.image ?? null,
    createdAt: aiMessage.createdAt,
    sectionId,
    parentId: aiMessage.parentId ?? null,
    depth: aiMessage.depth ?? 0,
    likeCount: 0,
    replyCount: 0,
    isAiResponse: true,
    reactions: [],
    attachments: [],
  });

  let fullContent = '';
  let lastDbUpdateTime = Date.now();

  try {
    await aiService.generateStreamingResponse(
      `Answer this forum question in under 200 words and stay grounded in thread context.
Question: ${query}

Recent thread context:
${context}`,
      async (chunk) => {
        fullContent += chunk;

        // Update the database only once every 500ms to reduce load
        const now = Date.now();
        if (now - lastDbUpdateTime >= 500) {
          await prisma.message.update({
            where: { id: aiMessage.id },
            data: { content: fullContent.slice(0, 2000) },
          });
          lastDbUpdateTime = now;
        }

        // Emit update event with the new content
        emitThreadMessage(sectionId, {
          id: aiMessage.id,
          content: fullContent.slice(0, 2000),
          senderId: aiUser.id,
          senderName: aiUser.name ?? 'Sastram AI',
          senderAvatar: aiUser.image ?? null,
          createdAt: aiMessage.createdAt,
          sectionId,
          parentId: aiMessage.parentId ?? null,
          depth: aiMessage.depth ?? 0,
          likeCount: 0,
          replyCount: 0,
          isAiResponse: true,
          reactions: [],
          attachments: [],
        });
      }
    );

    // Ensure the final content is saved to the database
    await prisma.message.update({
      where: { id: aiMessage.id },
      data: { content: fullContent.slice(0, 2000) },
    });

    // Emit a final completion event so clients can clear pending state immediately.
    emitThreadMessage(sectionId, {
      id: aiMessage.id,
      content: fullContent.slice(0, 2000),
      senderId: aiUser.id,
      senderName: aiUser.name ?? 'Sastram AI',
      senderAvatar: aiUser.image ?? null,
      createdAt: aiMessage.createdAt,
      sectionId,
      parentId: aiMessage.parentId ?? null,
      depth: aiMessage.depth ?? 0,
      likeCount: 0,
      replyCount: 0,
      isAiResponse: true,
      isComplete: true,
      reactions: [],
      attachments: [],
    });
  } catch (error) {
    logger.error('AI streaming error:', error);
    const errorMessage = "Sorry, I couldn't generate a response right now. Please try again later.";
    await prisma.message.update({
      where: { id: aiMessage.id },
      data: { content: errorMessage },
    });
    emitThreadMessage(sectionId, {
      id: aiMessage.id,
      content: errorMessage,
      senderId: aiUser.id,
      senderName: aiUser.name ?? 'Sastram AI',
      senderAvatar: aiUser.image ?? null,
      createdAt: aiMessage.createdAt,
      sectionId,
      parentId: aiMessage.parentId ?? null,
      depth: aiMessage.depth ?? 0,
      likeCount: 0,
      replyCount: 0,
      isAiResponse: true,
      isComplete: true,
      reactions: [],
      attachments: [],
    });
    return;
  }

  logger.info(`AI inline job complete: ${job.id}`);

  return {
    queued: true,
    handled: true,
    aiMessageId: aiMessage.id,
  };
}

export async function handleStalenessCheckJob(job: Job<StalenessCheckJobData>) {
  logger.warn(
    `Staleness check handler is not implemented yet. Job ${job.id} parked for future blocks.`,
    { data: job.data }
  );

  return { queued: true, handled: false };
}

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

  return score;
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

  await notifyMultipleUsers(subscriberIds, NotificationType.AI_INSIGHT, 'Daily Digest', digest, {
    type: 'daily_digest',
  });

  return { digestLength: digest.length };
}

async function handleSendAIInsightNotifications(
  subscriberIds: string[],
  threadId: string,
  threadName: string,
  oldScore?: number,
  newScore?: number,
  isOutdated?: boolean,
  conflictResult?: AIConflictResult
) {
  const { notifyMultipleUsers } = await import('@/modules/notifications/repository');
  const { NotificationType } = await import('@prisma/client');

  logger.info(`Sending AI insight notifications for thread: ${threadId}`);

  const notifications: Array<{
    userIds: string[];
    type: typeof NotificationType.AI_INSIGHT;
    title: string;
    message: string;
    data: Record<string, unknown>;
  }> = [];

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
        type: 'resolution_score_change',
      },
    });
  }

  if (isOutdated) {
    notifications.push({
      userIds: subscriberIds,
      type: NotificationType.AI_INSIGHT,
      title: `Thread "${threadName}" may be outdated`,
      message:
        "This thread hasn't been updated in over a week and may contain outdated information.",
      data: {
        threadId,
        threadName,
        type: 'thread_outdated',
      },
    });
  }

  if (conflictResult?.hasConflict) {
    notifications.push({
      userIds: subscriberIds,
      type: NotificationType.AI_INSIGHT,
      title: `Conflict detected in "${threadName}"`,
      message:
        conflictResult.reason ||
        'A conflict has been detected in this thread. Please review the messages.',
      data: {
        threadId,
        threadName,
        conflictingMessages: conflictResult.conflictingMessages,
        type: 'conflict_detected',
      },
    });
  }

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
