/**
 * AiJobs — deep module concentrating 6 shallow workers behind one seam.
 * Before: 7 files averaging 30 lines (interface ≈ implementation).
 * After: one interface `jobHandlers` with 7 entries, locality wins.
 * Kept separate: ai-inline (192 lines, real streaming) + email (I/O).
 */

import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '../config';
import { sanitizeHtmlContent } from '@/lib/services/content-safety';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { NotificationType } from '@prisma/client';
import { notifyMultipleUsers } from '@/modules/notifications';
import { assertSpendCapAvailable, assertThreadJob, runAiGeneration } from './_shared';
import type {
  ThreadSummaryJobData,
  ThreadDnaJobData,
  ResolutionScoreJobData,
  ConflictDetectionJobData,
  DailyDigestJobData,
  StalenessCheckJobData,
  AIInsightNotificationJobData,
  AIConflictResult,
  JobMessageData,
} from '../types';

// ------------------------------------------------------------------
// thread-summary
// ------------------------------------------------------------------

async function generateThreadSummary(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread summary for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('thread-summary', threadId, () =>
    aiService.generateThreadSummary(messages)
  );
  if (!result.ok) return { summary: null, skipped: true };
  const { sanitized: summary } = sanitizeUserContent(result.value);
  await prisma.thread.update({ where: { id: threadId }, data: { aiSummary: summary } });
  return { summary };
}

export async function handleThreadSummaryJob(data: ThreadSummaryJobData) {
  logger.info('[worker:ai] thread-summary job');
  assertThreadJob(data);
  return generateThreadSummary(data.threadId, data.messages);
}

// ------------------------------------------------------------------
// thread-dna
// ------------------------------------------------------------------

async function generateThreadDNA(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread DNA for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('thread-dna', threadId, () => aiService.generateThreadDNA(messages));
  if (!result.ok) return { threadDNA: null, skipped: true };
  await prisma.thread.update({ where: { id: threadId }, data: { threadDna: result.value } });
  return { threadDNA: result.value };
}

export async function handleThreadDnaJob(data: ThreadDnaJobData) {
  logger.info('[worker:ai] thread-dna job');
  assertThreadJob(data);
  return generateThreadDNA(data.threadId, data.messages);
}

// ------------------------------------------------------------------
// resolution-score
// ------------------------------------------------------------------

async function calculateResolutionScore(threadId: string, messages: JobMessageData[]) {
  logger.info(`Calculating resolution score for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('resolution-score', threadId, () =>
    aiService.calculateResolutionScore(messages)
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

export async function handleResolutionScoreJob(data: ResolutionScoreJobData) {
  logger.info('[worker:ai] resolution-score job');
  assertThreadJob(data);
  const { threadId, messages, subscriberIds, threadName, isOutdated, cronJob } = data;
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

// ------------------------------------------------------------------
// conflict-detection
// ------------------------------------------------------------------

async function detectConflicts(threadId: string, messages: JobMessageData[]) {
  logger.info(`Detecting conflicts for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('conflict-detection', threadId, () =>
    aiService.detectConflicts(messages)
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

// ------------------------------------------------------------------
// daily-digest
// ------------------------------------------------------------------

async function generateDailyDigest(messages: JobMessageData[], subscriberIds: string[]) {
  logger.info(`Generating daily digest for ${subscriberIds.length} subscribers`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('daily-digest', 'global', () => aiService.generateDailyDigest(messages));
  if (!result.ok) return { digestLength: 0, skipped: true };
  const digest = sanitizeHtmlContent(result.value);
  await notifyMultipleUsers(subscriberIds, NotificationType.AI_INSIGHT, 'Daily Digest', digest, {
    type: 'daily_digest',
  });
  return { digestLength: digest.length };
}

export async function handleDailyDigestJob(data: DailyDigestJobData) {
  logger.info('[worker:ai] daily-digest job');
  const { messages, subscriberIds } = data;
  if (!messages || !subscriberIds) {
    throw new Error('Missing required fields: messages and subscriberIds');
  }
  return generateDailyDigest(messages, subscriberIds);
}

// ------------------------------------------------------------------
// staleness-check
// ------------------------------------------------------------------

const STALE_THRESHOLD_DAYS = 30;
const RESOLUTION_SCORE_THRESHOLD = 50;
const STALE_BATCH_SIZE = 100;

function isStale(updatedAt: Date, resolutionScore: number | null): boolean {
  const ageDays = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < STALE_THRESHOLD_DAYS) return false;
  return resolutionScore === null || resolutionScore < RESOLUTION_SCORE_THRESHOLD;
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
        OR: [{ resolutionScore: null }, { resolutionScore: { lt: RESOLUTION_SCORE_THRESHOLD } }],
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

// ------------------------------------------------------------------
// insight-notifications
// ------------------------------------------------------------------

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

export async function handleAIInsightNotificationsJob(data: AIInsightNotificationJobData) {
  logger.info('[worker:ai] ai-insight-notifications job');
  const { subscriberIds, threadId, threadName, oldScore, newScore, isOutdated, conflictResult } = data;
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
