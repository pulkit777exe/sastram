import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { wrapUserContent, DATA_ONLY_INSTRUCTION } from '@/lib/utils/prompt-boundary';
import { sanitizeUserContent, sanitizeHtmlContent } from '@/lib/services/content-safety';
import { consumeSpendCap } from '@/lib/ai/spend-cap';
import { NotificationType } from '@prisma/client';
import { isQuotaError } from '@/lib/utils/errors';
import { notifyMultipleUsers } from '@/modules/notifications';
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

// Job payloads arrive as untyped JSON from QStash, so the required fields are
// re-checked at the boundary rather than trusted from the type signature.
function assertThreadJob(data: { threadId?: string; messages?: unknown }) {
  if (!data.threadId || !data.messages) {
    throw new Error('Missing required fields: threadId and messages');
  }
}

export async function handleThreadSummaryJob(data: ThreadSummaryJobData) {
  logger.info('[worker:ai] thread-summary job');
  assertThreadJob(data);
  return generateThreadSummary(data.threadId, data.messages);
}

export async function handleThreadDnaJob(data: ThreadDnaJobData) {
  logger.info('[worker:ai] thread-dna job');
  assertThreadJob(data);
  return generateThreadDNA(data.threadId, data.messages);
}

export async function handleResolutionScoreJob(data: ResolutionScoreJobData) {
  logger.info('[worker:ai] resolution-score job');
  assertThreadJob(data);
  const { threadId, messages, subscriberIds, threadName, isOutdated, cronJob } = data;

  // Fetch the current score from DB to avoid stale-oldScore race with on-demand API
  const currentThread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { resolutionScore: true },
  });
  const oldScore = currentThread?.resolutionScore ?? data.oldScore ?? null;

  const resolutionScore = await calculateResolutionScore(threadId, messages);

  if (
    resolutionScore !== null &&
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
  logger.info('[worker:ai] conflict-detection job');
  assertThreadJob(data);
  const { threadId, messages, subscriberIds, threadName, oldScore, cronJob } = data;

  const { conflictResult } = await detectConflicts(threadId, messages);

  if (
    conflictResult?.hasConflict &&
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
  logger.info('[worker:ai] daily-digest job');
  const { messages, subscriberIds } = data;
  if (!messages || !subscriberIds) {
    throw new Error('Missing required fields: messages and subscriberIds');
  }
  return generateDailyDigest(messages, subscriberIds);
}

export async function handleAIInsightNotificationsJob(data: AIInsightNotificationJobData) {
  logger.info('[worker:ai] ai-insight-notifications job');
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

  const thread = await prisma.thread.findFirst({
    where: { id: threadId!, deletedAt: null },
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
        deletedAt: null,
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
  logger.info('[worker:ai] ai-inline job');
  const { messageId, threadId, query } = data;
  if (!messageId || !threadId || !query) {
    throw new Error('Missing required fields: messageId, threadId, query');
  }
  return generateAIInlineResponse(messageId, threadId, query);
}

/**
 * Quota/rate-limit errors (429) are swallowed rather than rethrown so `/api/jobs`
 * answers 200 and QStash skips its 3x retry — the limit won't clear inside the
 * retry window and retrying only amplifies it. Other errors still propagate.
 */
async function runAiGeneration<T>(
  label: string,
  threadId: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; skipped: true }> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    if (isQuotaError(error)) {
      logger.warn(`[worker:ai] ${label} skipped for thread ${threadId} (AI quota/rate-limit)`, {
        error: error instanceof Error ? error.message : error,
      });
      return { ok: false, skipped: true };
    }
    throw error;
  }
}

async function generateThreadSummary(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread summary for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('thread-summary', threadId, () =>
    aiService.generateThreadSummary(messages),
  );
  if (!result.ok) return { summary: null, skipped: true };
  const { sanitized: summary } = sanitizeUserContent(result.value);
  await prisma.thread.update({
    where: { id: threadId },
    data: { aiSummary: summary },
  });
  return { summary };
}

async function generateThreadDNA(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread DNA for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('thread-dna', threadId, () =>
    aiService.generateThreadDNA(messages),
  );
  if (!result.ok) return { threadDNA: null, skipped: true };
  await prisma.thread.update({
    where: { id: threadId },
    data: { threadDna: result.value },
  });
  return { threadDNA: result.value };
}

async function calculateResolutionScore(threadId: string, messages: JobMessageData[]) {
  logger.info(`Calculating resolution score for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('resolution-score', threadId, () =>
    aiService.calculateResolutionScore(messages),
  );
  if (!result.ok) return null;
  const score = result.value;

  if (score === null) {
    logger.warn(`Resolution score unavailable (malformed AI response) for ${threadId}, skipping DB write`);
    return null;
  }

  await prisma.thread.update({
    where: { id: threadId },
    data: { resolutionScore: score, lastVerifiedAt: new Date() },
  });
  return score;
}

async function detectConflicts(threadId: string, messages: JobMessageData[]) {
  logger.info(`Detecting conflicts for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('conflict-detection', threadId, () =>
    aiService.detectConflicts(messages),
  );
  if (!result.ok) return { conflictResult: null, skipped: true };
  const conflictResult = result.value;
  if (conflictResult.hasConflict) {
    await prisma.thread.update({
      where: { id: threadId },
      data: { isOutdated: true, lastVerifiedAt: new Date() },
    });
  }
  return { conflictResult };
}

async function generateDailyDigest(messages: JobMessageData[], subscriberIds: string[]) {
  logger.info(`Generating daily digest for ${subscriberIds.length} subscribers`);
  await assertSpendCapAvailable();
  // Daily digest has no threadId scope; use a stable placeholder for logging.
  const result = await runAiGeneration('daily-digest', 'global', () =>
    aiService.generateDailyDigest(messages),
  );
  if (!result.ok) return { digestLength: 0, skipped: true };
  const digest = sanitizeHtmlContent(result.value);
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

  const notifications: Array<{ title: string; message: string; data: Record<string, unknown> }> = [];

  // Only a meaningful swing is worth interrupting subscribers over.
  if (oldScore != null && newScore != null && Math.abs(newScore - oldScore) >= 20) {
    notifications.push({
      title: `Resolution score updated for "${threadName}"`,
      message: `The resolution score for this thread has changed from ${oldScore} to ${newScore}.`,
      data: { threadId, threadName, oldScore, newScore, type: 'resolution_score_change' },
    });
  }

  if (isOutdated) {
    notifications.push({
      title: `Thread "${threadName}" may be outdated`,
      message: "This thread hasn't been updated in over a week and may contain outdated information.",
      data: { threadId, threadName, type: 'thread_outdated' },
    });
  }

  if (conflictResult?.hasConflict) {
    notifications.push({
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

  for (const { title, message, data } of notifications) {
    await notifyMultipleUsers(subscriberIds, NotificationType.AI_INSIGHT, title, message, data);
  }

  return { notificationsSent: notifications.length };
}

async function generateAIInlineResponse(
  messageId: string,
  threadId: string,
  query: string,
) {
  const parentMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, depth: true, threadId: true },
  });

  if (!parentMessage) {
    logger.error('[worker:ai] Parent message not found', { messageId });
    return { queued: false, handled: false, error: 'Parent message not found' };
  }

  // The inline @sai reply is a best-effort, user-facing enhancement. Any failure
  // along the way (spend cap, quota, auth, network) must NOT crash the job or
  // leave a broken empty message — we write a clear placeholder and return 200 so
  // QStash does not retry a failure the user has already seen.
  let aiMessage: { id: string } | null = null;

  try {
    await assertSpendCapAvailable();

    // A previous attempt may have already created the placeholder message;
    // reuse it so a retry doesn't post a second reply.
    const existingAiMessage = await prisma.message.findFirst({
      where: { threadId, parentId: parentMessage.id, isAiResponse: true },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    const context = await fetchThreadContext(threadId);

    if (existingAiMessage) {
      logger.info(`[worker:ai] Reusing existing AI message ${existingAiMessage.id} for parent ${messageId} (retry)`);
      aiMessage = existingAiMessage;
    } else {
      const aiUser = await getOrCreateAiUser();
      aiMessage = await createAiMessage(threadId, parentMessage.id, (parentMessage.depth ?? 0) + 1, aiUser.id);
    }

    await streamAiResponse(query, context, aiMessage);
  } catch (error) {
    logger.error('[worker:ai] AI inline generation failed:', error);

    const isCapOrQuota =
      isQuotaError(error) || /spend cap/i.test(error instanceof Error ? error.message : '');

    if (aiMessage) {
      await prisma.message.update({
        where: { id: aiMessage.id },
        data: {
          content: isCapOrQuota
            ? "I'm temporarily over my AI quota, so I couldn't reply just now. Please try again later."
            : "Sorry, I couldn't generate a response right now. Please try again later.",
        },
      });
    }
  }

  logger.info('[worker:ai] AI inline job complete');
  return { queued: true, handled: true, aiMessageId: aiMessage?.id };
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
  // Create + counter bumps share a transaction so the denormalized counts stay
  // in sync, mirroring what MessageService.processMessage does for user replies.
  return prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
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

    if (parentId) {
      await tx.message.update({
        where: { id: parentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    await tx.thread.update({
      where: { id: threadId },
      data: { messageCount: { increment: 1 } },
    });

    return msg;
  });
}

// Partial content is flushed to the DB as it streams so a reader polling the
// message sees it grow, rather than waiting for the whole generation.
const DB_THROTTLE_MS = 500;
const MAX_AI_REPLY_CHARS = 2000;

async function streamAiResponse(
  query: string,
  context: string,
  aiMessage: { id: string },
): Promise<void> {
  let fullContent = '';
  let lastDbUpdateTime = Date.now();

  await aiService.generateStreamingResponse(
    `Answer this forum question in under 200 words and stay grounded in thread context.${DATA_ONLY_INSTRUCTION}\nQuestion: ${wrapUserContent(query)}\n\nRecent thread context:\n${wrapUserContent(context)}`,
    async (chunk) => {
      fullContent += chunk;
      const now = Date.now();
      if (now - lastDbUpdateTime >= DB_THROTTLE_MS) {
        await prisma.message.update({
          where: { id: aiMessage.id },
          data: { content: fullContent.slice(0, MAX_AI_REPLY_CHARS) },
        });
        lastDbUpdateTime = now;
      }
    },
  );

  const { sanitized } = sanitizeUserContent(fullContent.slice(0, MAX_AI_REPLY_CHARS));
  await prisma.message.update({
    where: { id: aiMessage.id },
    data: { content: sanitized },
  });
}
