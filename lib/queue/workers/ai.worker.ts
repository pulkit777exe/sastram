import type { Job } from 'bullmq';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/services/ai';
import { NotificationType } from '@prisma/client';
import { notifyMultipleUsers } from '@/modules/notifications/repository';
import { emitThreadMessage } from '@/modules/ws/publisher';
import { getAiInsightNotificationsQueue } from '../queue';
import { DEFAULT_JOB_OPTIONS, AIJobType } from '../config';
import type {
  ThreadSummaryJobData,
  ThreadDnaJobData,
  ResolutionScoreJobData,
  ConflictDetectionJobData,
  DailyDigestJobData,
  AIInsightNotificationJobData,
  AIInlineJobData,
  StalenessCheckJobData,
  AIConflictResult,
  JobMessageData,
} from '../types';

export async function handleThreadSummaryJob(job: Job<ThreadSummaryJobData>) {
  logger.info(`[worker:ai] thread-summary job ${job.id}`);
  const { threadId, messages } = job.data;
  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }
  return generateThreadSummary(threadId, messages);
}

export async function handleThreadDnaJob(job: Job<ThreadDnaJobData>) {
  logger.info(`[worker:ai] thread-dna job ${job.id}`);
  const { threadId, messages } = job.data;
  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }
  return generateThreadDNA(threadId, messages);
}

export async function handleResolutionScoreJob(job: Job<ResolutionScoreJobData>) {
  logger.info(`[worker:ai] resolution-score job ${job.id}`);
  const { threadId, messages, subscriberIds, threadName, oldScore, isOutdated, cronJob } = job.data;
  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }

  const resolutionScore = await calculateResolutionScore(threadId, messages);

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
      DEFAULT_JOB_OPTIONS,
    );
  }

  return { resolutionScore };
}

export async function handleConflictDetectionJob(job: Job<ConflictDetectionJobData>) {
  logger.info(`[worker:ai] conflict-detection job ${job.id}`);
  const { threadId, messages, subscriberIds, threadName, oldScore, cronJob } = job.data;
  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }

  const { conflictResult } = await detectConflicts(threadId, messages);

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
      DEFAULT_JOB_OPTIONS,
    );
  }

  return { conflictResult };
}

export async function handleDailyDigestJob(job: Job<DailyDigestJobData>) {
  logger.info(`[worker:ai] daily-digest job ${job.id}`);
  const { messages, subscriberIds } = job.data;
  if (!messages || !subscriberIds) {
    throw new Error('Missing required fields: messages and subscriberIds');
  }
  return generateDailyDigest(messages, subscriberIds);
}

export async function handleAIInsightNotificationsJob(job: Job<AIInsightNotificationJobData>) {
  logger.info(`[worker:ai] ai-insight-notifications job ${job.id}`);
  const { subscriberIds, threadId, threadName, oldScore, newScore, isOutdated, conflictResult } =
    job.data;
  if (!subscriberIds || !threadId || !threadName) {
    throw new Error('Missing required fields: subscriberIds, threadId, and threadName');
  }
  return sendAIInsightNotifications(
    subscriberIds,
    threadId,
    threadName,
    oldScore,
    newScore,
    isOutdated,
    conflictResult,
  );
}

export async function handleStalenessCheckJob(job: Job<StalenessCheckJobData>) {
  logger.warn(
    `[worker:ai] staleness-check job ${job.id} — handler not yet implemented`,
    { data: job.data },
  );
  return { queued: true, handled: false };
}

export async function handleAIInlineJob(job: Job<AIInlineJobData>) {
  logger.info(`[worker:ai] ai-inline job ${job.id}`);
  const { messageId, sectionId, query } = job.data;
  if (!messageId || !sectionId || !query) {
    throw new Error('Missing required fields: messageId, sectionId, query');
  }
  return generateAIInlineResponse(job.id, messageId, sectionId, query);
}

async function generateThreadSummary(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread summary for thread: ${threadId}`);
  const summary = await aiService.generateThreadSummary(messages);
  await prisma.section.update({
    where: { id: threadId },
    data: { aiSummary: summary },
  });
  return { summary };
}

async function generateThreadDNA(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread DNA for thread: ${threadId}`);
  const threadDNA = await aiService.generateThreadDNA(messages);
  await prisma.section.update({
    where: { id: threadId },
    data: { threadDna: threadDNA },
  });
  return { threadDNA };
}

async function calculateResolutionScore(threadId: string, messages: JobMessageData[]) {
  logger.info(`Calculating resolution score for thread: ${threadId}`);
  const score = await aiService.calculateResolutionScore(messages);
  await prisma.section.update({
    where: { id: threadId },
    data: { resolutionScore: score },
  });
  return score;
}

async function detectConflicts(threadId: string, messages: JobMessageData[]) {
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

async function generateDailyDigest(messages: JobMessageData[], subscriberIds: string[]) {
  logger.info(`Generating daily digest for ${subscriberIds.length} subscribers`);
  const digest = await aiService.generateDailyDigest(messages);
  await notifyMultipleUsers(subscriberIds, NotificationType.AI_INSIGHT, 'Daily Digest', digest, {
    type: 'daily_digest',
  });
  return { digestLength: digest.length };
}

async function sendAIInsightNotifications(
  subscriberIds: string[],
  threadId: string,
  threadName: string,
  oldScore?: number,
  newScore?: number,
  isOutdated?: boolean,
  conflictResult?: AIConflictResult,
) {
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
      data: { threadId, threadName, oldScore, newScore, type: 'resolution_score_change' },
    });
  }

  if (isOutdated) {
    notifications.push({
      userIds: subscriberIds,
      type: NotificationType.AI_INSIGHT,
      title: `Thread "${threadName}" may be outdated`,
      message: "This thread hasn't been updated in over a week and may contain outdated information.",
      data: { threadId, threadName, type: 'thread_outdated' },
    });
  }

  if (conflictResult?.hasConflict) {
    notifications.push({
      userIds: subscriberIds,
      type: NotificationType.AI_INSIGHT,
      title: `Conflict detected in "${threadName}"`,
      message: conflictResult.reason || 'A conflict has been detected in this thread.',
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
      notification.data,
    );
  }

  return { notificationsSent: notifications.length };
}

async function generateAIInlineResponse(
  jobId: string | undefined,
  messageId: string,
  sectionId: string,
  query: string,
) {

  const parentMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, depth: true, sectionId: true },
  });

  if (!parentMessage) {
    logger.error('[worker:ai] Parent message not found', { messageId, jobId });
    return { queued: false, handled: false, error: 'Parent message not found' };
  }

  const recentMessages = await prisma.message.findMany({
    where: { sectionId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      content: true,
      sender: { select: { name: true } },
    },
  });

  const context = recentMessages
    .reverse()
    .map((m) => `${m.sender?.name || 'User'}: ${m.content}`)
    .join('\n');

  const aiUser = await prisma.user.upsert({
    where: { email: 'ai@sastram.system' },
    update: { name: 'Sastram AI', emailVerified: true },
    create: {
      email: 'ai@sastram.system',
      name: 'Sastram AI',
      emailVerified: true,
      role: 'USER',
      status: 'ACTIVE',
    },
    select: { id: true, name: true, image: true },
  });

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
      section: { select: { id: true, name: true, slug: true } },
    },
  });

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
    isComplete: false,
    reactions: [],
    attachments: [],
  });

  let fullContent = '';
  let lastDbUpdateTime = Date.now();

  try {
    await aiService.generateStreamingResponse(
      `Answer this forum question in under 200 words and stay grounded in thread context.\nQuestion: ${query}\n\nRecent thread context:\n${context}`,
      async (chunk) => {
        fullContent += chunk;
        const now = Date.now();
        if (now - lastDbUpdateTime >= 500) {
          await prisma.message.update({
            where: { id: aiMessage.id },
            data: { content: fullContent.slice(0, 2000) },
          });
          lastDbUpdateTime = now;
        }
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
      },
    );

    await prisma.message.update({
      where: { id: aiMessage.id },
      data: { content: fullContent.slice(0, 2000) },
    });

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
    logger.error('[worker:ai] AI streaming error:', error);
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
    throw error; // BullMQ will retry with exponential backoff (configured 3 attempts)
  }

  logger.info(`[worker:ai] AI inline job complete: ${jobId}`);
  return { queued: true, handled: true, aiMessageId: aiMessage.id };
}
