import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/services/ai';
import { applyConfidenceDecay } from '@/lib/utils/confidence-decay';
import { wrapUserContent, DATA_ONLY_INSTRUCTION } from '@/lib/utils/prompt-boundary';
import { sanitizeUserContent, sanitizeHtmlContent } from '@/lib/services/content-safety';
import { consumeSpendCap } from '@/lib/services/ai-spend-cap';
import { NotificationType } from '@prisma/client';
import { notifyMultipleUsers } from '@/modules/notifications';
import { emitThreadMessage } from '@/modules/ws';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '../config';
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

async function assertSpendCapAvailable(): Promise<void> {
  const cap = await consumeSpendCap();
  if (!cap.allowed) {
    throw new Error('AI spend cap exceeded — job skipped until UTC midnight reset');
  }
}

export async function handleThreadSummaryJob(data: ThreadSummaryJobData) {
  logger.info(`[worker:ai] thread-summary job`);
  const { threadId, messages } = data;
  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }
  return generateThreadSummary(threadId, messages);
}

export async function handleThreadDnaJob(data: ThreadDnaJobData) {
  logger.info(`[worker:ai] thread-dna job`);
  const { threadId, messages } = data;
  if (!threadId || !messages) {
    throw new Error('Missing required fields: threadId and messages');
  }
  return generateThreadDNA(threadId, messages);
}

export async function handleResolutionScoreJob(data: ResolutionScoreJobData) {
  logger.info(`[worker:ai] resolution-score job`);
  const { threadId, messages, subscriberIds, threadName, oldScore, isOutdated, cronJob } = data;
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
    await enqueueJob(AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS, {
      subscriberIds,
      threadId,
      threadName,
      oldScore,
      newScore: resolutionScore,
      isOutdated,
      cronJob,
    });
  }

  return { resolutionScore };
}

export async function handleConflictDetectionJob(data: ConflictDetectionJobData) {
  logger.info(`[worker:ai] conflict-detection job`);
  const { threadId, messages, subscriberIds, threadName, oldScore, cronJob } = data;
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
    await enqueueJob(AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS, {
      subscriberIds,
      threadId,
      threadName,
      oldScore: oldScore ?? undefined,
      isOutdated: true,
      conflictResult,
      cronJob,
    });
  }

  return { conflictResult };
}

export async function handleDailyDigestJob(data: DailyDigestJobData) {
  logger.info(`[worker:ai] daily-digest job`);
  const { messages, subscriberIds } = data;
  if (!messages || !subscriberIds) {
    throw new Error('Missing required fields: messages and subscriberIds');
  }
  return generateDailyDigest(messages, subscriberIds);
}

export async function handleAIInsightNotificationsJob(data: AIInsightNotificationJobData) {
  logger.info(`[worker:ai] ai-insight-notifications job`);
  const { subscriberIds, threadId, threadName, oldScore, newScore, isOutdated, conflictResult } =
    data;
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

const STALE_THRESHOLD_DAYS = 30;
const RESOLUTION_SCORE_THRESHOLD = 50;
const STALE_BATCH_SIZE = 100;

function isStale(updatedAt: Date, resolutionScore: number | null): boolean {
  const ageDays = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < STALE_THRESHOLD_DAYS) return false;
  return resolutionScore === null || resolutionScore < RESOLUTION_SCORE_THRESHOLD;
}

export async function handleStalenessCheckJob(data: StalenessCheckJobData) {
  const { threadId, cronJob } = data;

  if (!cronJob && !threadId) {
    throw new Error('Missing required fields: threadId or cronJob must be provided');
  }

  if (cronJob && !threadId) {
    logger.info(`[worker:ai] staleness-check batch job`);
    return handleStalenessBatchCheck();
  }

  logger.info(`[worker:ai] staleness-check for thread ${threadId}`);

  const thread = await prisma.thread.findUnique({
    where: { id: threadId! },
    select: { id: true, updatedAt: true, resolutionScore: true, isOutdated: true },
  });

  if (!thread) {
    logger.warn(`[worker:ai] Thread ${threadId} not found for staleness check`);
    return { handled: true, checked: 1, updated: 0 };
  }

  if (thread.isOutdated) {
    return { handled: true, checked: 1, updated: 0 };
  }

  if (isStale(thread.updatedAt, thread.resolutionScore)) {
    await prisma.thread.update({
      where: { id: threadId! },
      data: { isOutdated: true, lastVerifiedAt: new Date() },
    });
    logger.info(`[worker:ai] Thread ${threadId} marked as outdated`);
    return { handled: true, checked: 1, updated: 1 };
  }

  return { handled: true, checked: 1, updated: 0 };
}

async function handleStalenessBatchCheck() {
  let checked = 0;
  let updated = 0;
  let cursor: string | undefined;

  while (true) {
    const threads = await prisma.thread.findMany({
      where: {
        isOutdated: false,
        updatedAt: { lt: new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000) },
        OR: [
          { resolutionScore: null },
          { resolutionScore: { lt: RESOLUTION_SCORE_THRESHOLD } },
        ],
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: STALE_BATCH_SIZE,
    });

    if (threads.length === 0) break;

    await prisma.thread.updateMany({
      where: { id: { in: threads.map((t) => t.id) } },
      data: { isOutdated: true, lastVerifiedAt: new Date() },
    });

    updated += threads.length;
    checked += threads.length;
    cursor = threads[threads.length - 1].id;

    if (threads.length < STALE_BATCH_SIZE) break;
  }

  logger.info(`[worker:ai] staleness batch check complete — ${checked} checked, ${updated} updated`);
  return { handled: true, checked, updated };
}

export async function handleAIInlineJob(data: AIInlineJobData) {
  logger.info(`[worker:ai] ai-inline job`);
  const { messageId, threadId, query } = data;
  if (!messageId || !threadId || !query) {
    throw new Error('Missing required fields: messageId, threadId, query');
  }
  return generateAIInlineResponse(messageId, threadId, query);
}

async function generateThreadSummary(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread summary for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const rawSummary = await aiService.generateThreadSummary(messages);
  const { sanitized: summary } = sanitizeUserContent(rawSummary);
  await prisma.thread.update({
    where: { id: threadId },
    data: { aiSummary: summary },
  });
  return { summary };
}

async function generateThreadDNA(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread DNA for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const threadDNA = await aiService.generateThreadDNA(messages);
  await prisma.thread.update({
    where: { id: threadId },
    data: { threadDna: threadDNA },
  });
  return { threadDNA };
}

async function calculateResolutionScore(threadId: string, messages: JobMessageData[]) {
  logger.info(`Calculating resolution score for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const [score, thread] = await Promise.all([
    aiService.calculateResolutionScore(messages),
    prisma.thread.findUnique({
      where: { id: threadId },
      select: { updatedAt: true },
    }),
  ]);

  const { decayedScore, ageDays } = applyConfidenceDecay(score, thread?.updatedAt ?? new Date());
  if (ageDays >= 30) {
    logger.info(`Confidence decay applied for ${threadId}: raw=${score}, decayed=${decayedScore}, ageDays=${Math.round(ageDays)}`);
  }

  await prisma.thread.update({
    where: { id: threadId },
    data: { resolutionScore: decayedScore, lastVerifiedAt: new Date() },
  });
  return decayedScore;
}

async function detectConflicts(threadId: string, messages: JobMessageData[]) {
  logger.info(`Detecting conflicts for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const conflictResult = await aiService.detectConflicts(messages);
  if (conflictResult.hasConflict) {
    await prisma.thread.update({
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
  await assertSpendCapAvailable();
  const rawDigest = await aiService.generateDailyDigest(messages);
  const digest = sanitizeHtmlContent(rawDigest);
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
  messageId: string,
  threadId: string,
  query: string,
) {
  await assertSpendCapAvailable();

  const parentMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, depth: true, threadId: true },
  });

  if (!parentMessage) {
    logger.error('[worker:ai] Parent message not found', { messageId });
    return { queued: false, handled: false, error: 'Parent message not found' };
  }

  // Dedup: check if an AI response already exists for this parent message (e.g. from a previous job attempt)
  const existingAiMessage = await prisma.message.findFirst({
    where: {
      threadId,
      parentId: parentMessage.id,
      isAiResponse: true,
    },
    select: { id: true, createdAt: true, parentId: true, depth: true, content: true },
    orderBy: { createdAt: 'desc' },
  });

  const context = await fetchThreadContext(threadId);
  const aiUser = await getOrCreateAiUser();

  let aiMessage: { id: string; content: string; createdAt: Date; parentId: string | null; depth: number };
  let isRetry = false;

  if (existingAiMessage) {
    logger.info(`[worker:ai] Reusing existing AI message ${existingAiMessage.id} for parent ${messageId} (retry)`);
    aiMessage = existingAiMessage;
    isRetry = true;
  } else {
    aiMessage = await createAiMessage(threadId, parentMessage.id, (parentMessage.depth ?? 0) + 1, aiUser.id);
  }

  if (!isRetry) {
    emitAiMessage(threadId, aiMessage, aiUser, false);
  }

  try {
    const { content: finalContent, truncated } = await streamAiResponse(threadId, query, context, aiMessage, aiUser);
    emitAiMessage(threadId, { ...aiMessage, content: finalContent }, aiUser, true, truncated);
  } catch (error) {
    logger.error('[worker:ai] AI streaming error:', error);
    const errorMessage = "Sorry, I couldn't generate a response right now. Please try again later.";
    await prisma.message.update({
      where: { id: aiMessage.id },
      data: { content: errorMessage },
    });
    emitAiMessage(threadId, { ...aiMessage, content: errorMessage }, aiUser, true);
    throw error;
  }

  logger.info(`[worker:ai] AI inline job complete`);
  return { queued: true, handled: true, aiMessageId: aiMessage.id };
}

async function fetchThreadContext(threadId: string): Promise<string> {
  const recentMessages = await prisma.message.findMany({
    where: { threadId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      content: true,
      sender: { select: { name: true } },
    },
  });

  return recentMessages
    .reverse()
    .map((m) => `${m.sender?.name || 'User'}: ${m.content}`)
    .join('\n');
}

async function getOrCreateAiUser() {
  return prisma.user.upsert({
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
}

async function createAiMessage(
  threadId: string,
  parentId: string,
  depth: number,
  senderId: string,
) {
  return prisma.message.create({
    data: {
      content: '',
      threadId,
      senderId,
      parentId,
      depth: Math.min(depth, 4),
      isAiResponse: true,
      isEdited: false,
      isPinned: false,
      likeCount: 0,
      replyCount: 0,
    },
    include: {
      thread: { select: { id: true, name: true, slug: true } },
    },
  });
}

function emitAiMessage(
  threadId: string,
  message: { id: string; content: string; parentId: string | null; depth: number; createdAt: Date },
  aiUser: { id: string; name: string | null; image: string | null },
  isComplete: boolean,
  truncated = false,
) {
  emitThreadMessage(threadId, {
    id: message.id,
    content: message.content,
    senderId: aiUser.id,
    senderName: aiUser.name ?? 'Sastram AI',
    senderImage: aiUser.image ?? null,
    createdAt: message.createdAt,
    threadId,
    parentId: message.parentId ?? null,
    depth: message.depth ?? 0,
    likeCount: 0,
    replyCount: 0,
    isAiResponse: true,
    isComplete,
    truncated,
    reactions: [],
    attachments: [],
  });
}

async function streamAiResponse(
  threadId: string,
  query: string,
  context: string,
  aiMessage: { id: string; createdAt: Date; parentId: string | null; depth: number },
  aiUser: { id: string; name: string | null; image: string | null },
): Promise<{ content: string; truncated: boolean }> {
  let fullContent = '';
  let lastDbUpdateTime = Date.now();
  let lastEmitTime = Date.now();
  const DB_THROTTLE_MS = 500;
  const EMIT_THROTTLE_MS = 100;

  await aiService.generateStreamingResponse(
    `Answer this forum question in under 200 words and stay grounded in thread context.${DATA_ONLY_INSTRUCTION}\nQuestion: ${wrapUserContent(query)}\n\nRecent thread context:\n${wrapUserContent(context)}`,
    async (chunk) => {
      fullContent += chunk;
      const now = Date.now();
      if (now - lastDbUpdateTime >= DB_THROTTLE_MS) {
        await prisma.message.update({
          where: { id: aiMessage.id },
          data: { content: fullContent.slice(0, 2000) },
        });
        lastDbUpdateTime = now;
      }
      if (now - lastEmitTime >= EMIT_THROTTLE_MS) {
        emitAiMessage(threadId, { ...aiMessage, content: fullContent.slice(0, 2000) }, aiUser, false);
        lastEmitTime = now;
      }
    },
  );

  const truncated = fullContent.length > 2000;
  const finalContent = fullContent.slice(0, 2000);
  const { sanitized: sanitizedContent } = sanitizeUserContent(finalContent);
  await prisma.message.update({
    where: { id: aiMessage.id },
    data: { content: sanitizedContent },
  });
  return { content: sanitizedContent, truncated };
}
