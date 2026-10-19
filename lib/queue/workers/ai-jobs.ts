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
import { sanitizeHtmlContent, isSafePublicUrl } from '@/lib/services/content-safety';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { dispatch } from '@/modules/notifications/dispatcher';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { z } from 'zod';
import { AppError } from '@/lib/utils/errors';
import { assertThreadJob, readAlreadyBilled, runGuardedWorker } from './_shared';
import { hasTrustedProvenance } from '@/modules/threads/confidence-decay';
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

async function getForkedContext(threadId: string): Promise<JobMessageData[]> {
  try {
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { forkedFromId: true, description: true },
    });
    const extra: JobMessageData[] = [];
    if (thread?.forkedFromId) {
      const source = await prisma.thread.findUnique({
        where: { id: thread.forkedFromId },
        select: { aiSummary: true, description: true, name: true },
      });
      if (source?.aiSummary) {
        extra.push({ id: thread.forkedFromId, content: `Original thread "${source.name}" summary: ${source.aiSummary.slice(0, 2000)}`, senderId: null, createdAt: new Date() } as unknown as JobMessageData);
      } else if (source?.description) {
        extra.push({ id: thread.forkedFromId, content: `Original thread "${source.name}": ${source.description.slice(0, 1000)}`, senderId: null, createdAt: new Date() } as unknown as JobMessageData);
      }
      const sourceMessages = await prisma.message.findMany({
        where: { threadId: thread.forkedFromId, deletedAt: null },
        select: { id: true, content: true, senderId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      for (const m of sourceMessages.reverse()) {
        extra.push({ id: m.id, content: `[Forked context] ${m.content.slice(0, 800)}`, senderId: m.senderId, createdAt: m.createdAt } as JobMessageData);
      }
    }
    // For external forks, description contains "Forked from https://..."
    const urlMatch = thread?.description?.match(/https?:\/\/[^\s"')\]]+/);
    if (urlMatch) {
      const url = urlMatch[0];
      if (url.length >= 2048 || !isSafePublicUrl(url)) {
        // SSRF protection: skip private/internal or overlong URLs
      } else {
        try {
          const exaKey = process.env.SASTRAM_EXA_KEY;
          if (exaKey) {
            const res = await fetch('https://api.exa.ai/contents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': exaKey },
              body: JSON.stringify({ urls: [url], text: { maxCharacters: 4000 } }),
              signal: AbortSignal.timeout(4000),
            });
            if (res.ok) {
              const json = (await res.json()) as { results?: Array<{ text?: string; title?: string }> };
              const text = json.results?.[0]?.text?.slice(0, 3000);
              const title = json.results?.[0]?.title;
              if (text) extra.unshift({ id: 'fork-external', content: `External source ${url} ${title ? `(${title})` : ''}: ${text}`, senderId: null, createdAt: new Date() } as unknown as JobMessageData);
            }
          }
        } catch {
          // best-effort, ignore fetch failures
        }
      }
    }
    return extra;
  } catch {
    return [];
  }
}

async function generateThreadSummary(threadId: string, messages: JobMessageData[], alreadyBilled?: string) {
  logger.info(`Generating thread summary for thread: ${threadId}`);
  const forkedExtra = await getForkedContext(threadId);
  const allMessages = [...forkedExtra, ...messages];
  const result = await runGuardedWorker('thread-summary', AiCallPath.THREAD_SUMMARY, threadId, () =>
    aiService.generateThreadSummary(allMessages), { alreadyBilled }
  );
  if (!result.ok) return { summary: null, skipped: true };
  const { sanitized: summary } = sanitizeUserContent(result.value);
  await prisma.thread.update({ where: { id: threadId }, data: { aiSummary: summary } });
  return { summary };
}

export async function handleThreadSummaryJob(data: ThreadSummaryJobData) {
  logger.info('[worker:ai] thread-summary job');
  assertThreadJob(data);
  return generateThreadSummary(data.threadId, data.messages, readAlreadyBilled(data));
}

// ------------------------------------------------------------------
// thread-dna
// ------------------------------------------------------------------

async function generateThreadDNA(threadId: string, messages: JobMessageData[], alreadyBilled?: string) {
  logger.info(`Generating thread DNA for thread: ${threadId}`);
  const forkedExtra = await getForkedContext(threadId);
  const allMessages = [...forkedExtra, ...messages];
  const result = await runGuardedWorker('thread-dna', AiCallPath.THREAD_DNA, threadId, () => aiService.generateThreadDNA(allMessages), { alreadyBilled });
  if (!result.ok) return { threadDNA: null, skipped: true };
  await prisma.thread.update({ where: { id: threadId }, data: { threadDna: result.value } });
  return { threadDNA: result.value };
}

export async function handleThreadDnaJob(data: ThreadDnaJobData) {
  logger.info('[worker:ai] thread-dna job');
  assertThreadJob(data);
  return generateThreadDNA(data.threadId, data.messages, readAlreadyBilled(data));
}

// ------------------------------------------------------------------
// resolution-score
// ------------------------------------------------------------------

async function calculateResolutionScore(threadId: string, messages: JobMessageData[], alreadyBilled?: string) {
  logger.info(`Calculating resolution score for thread: ${threadId}`);
  const forkedExtra = await getForkedContext(threadId);
  const allMessages = [...forkedExtra, ...messages];
  const result = await runGuardedWorker('resolution-score', AiCallPath.RESOLUTION_SCORE, threadId, () =>
    aiService.calculateResolutionScore(allMessages), { alreadyBilled }
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
  const resolutionScore = await calculateResolutionScore(threadId, messages, readAlreadyBilled(data));

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

async function detectConflicts(threadId: string, messages: JobMessageData[], alreadyBilled?: string) {
  logger.info(`Detecting conflicts for thread: ${threadId}`);
  const forkedExtra = await getForkedContext(threadId);
  const allMessages = [...forkedExtra, ...messages];
  const result = await runGuardedWorker('conflict-detection', AiCallPath.CONFLICT_DETECTION, threadId, () =>
    aiService.detectConflicts(allMessages), { alreadyBilled }
  );
  if (!result.ok) return { conflictResult: null, skipped: true };
  const conflictResult = result.value;
  if (conflictResult.hasConflict) {
    // Marking a conflict must not fake score provenance: lastVerifiedAt is
    // written only when the resolution score is actually (re)computed.
    await prisma.thread.update({
      where: { id: threadId },
      data: { isOutdated: true },
    });
  }
  return { conflictResult };
}

export async function handleConflictDetectionJob(data: ConflictDetectionJobData) {
  logger.info('[worker:ai] conflict-detection job');
  assertThreadJob(data);
  const { threadId, messages, subscriberIds, threadName, oldScore, cronJob } = data;
  const { conflictResult } = await detectConflicts(threadId, messages, readAlreadyBilled(data));
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

async function generateDailyDigest(messages: JobMessageData[], subscriberIds: string[], alreadyBilled?: string) {
  logger.info(`Generating daily digest for ${subscriberIds.length} subscribers`);
  const result = await runGuardedWorker('daily-digest', AiCallPath.DAILY_DIGEST, 'global', () => aiService.generateDailyDigest(messages), { alreadyBilled });
  if (!result.ok) return { digestLength: 0, skipped: true };
  const digest = sanitizeHtmlContent(result.value);
  await dispatch({
    recipients: { userIds: subscriberIds },
    category: 'AI_INSIGHT',
    title: 'Daily Digest',
    message: digest,
    data: { type: 'daily_digest' },
  });
  return { digestLength: digest.length };
}

export async function handleDailyDigestJob(data: DailyDigestJobData) {
  logger.info('[worker:ai] daily-digest job');
  const { messages, subscriberIds } = data;
  if (!messages || !subscriberIds) {
    throw new Error('Missing required fields: messages and subscriberIds');
  }
  return generateDailyDigest(messages, subscriberIds, readAlreadyBilled(data));
}

// ------------------------------------------------------------------
// staleness-check
// ------------------------------------------------------------------

const STALE_BATCH_SIZE = 100;
// Bound the sweep so one job can't walk the whole (unbounded) thread table;
// the next scheduled run continues from a fresh scan.
const STALE_MAX_BATCHES = 50;

async function handleStalenessBatchCheck() {
  let checked = 0;
  let updated = 0;
  let cursor: string | undefined;
  let batches = 0;

  while (true) {
    const whereClause: Record<string, unknown> = {
      isOutdated: false,
      deletedAt: null,
    };
    if (cursor) {
      (whereClause as { id: { gt: string } }).id = { gt: cursor };
    }

    const batch = await prisma.thread.findMany({
      where: whereClause as never,
      select: { id: true, lastVerifiedAt: true, verifiedAt: true },
      orderBy: { id: 'asc' },
      take: STALE_BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const staleIds = batch.filter((t) => !hasTrustedProvenance(t.verifiedAt, t.lastVerifiedAt)).map((t) => t.id);

    if (staleIds.length > 0) {
      // Only the staleness flag moves — lastVerifiedAt keeps meaning "last AI
      // score", so the cron trust gate re-enriches marked threads instead of
      // resetting their ~120-day window.
      await prisma.thread.updateMany({
        where: { id: { in: staleIds } },
        data: { isOutdated: true },
      });
      updated += staleIds.length;
    }
    checked += batch.length;
    cursor = batch[batch.length - 1].id;
    batches++;

    if (batch.length < STALE_BATCH_SIZE) break;

    if (batches >= STALE_MAX_BATCHES) {
      logger.warn(
        `[worker:ai] staleness batch check hit its ${STALE_MAX_BATCHES}-batch bound — remaining threads left for the next run`
      );
      break;
    }
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
    select: { id: true, lastVerifiedAt: true, verifiedAt: true, isOutdated: true },
  });

  if (!thread) {
    logger.warn(`[worker:ai] Thread ${threadId} not found for staleness check`);
    return { handled: true, checked: 1, updated: 0 };
  }

  if (thread.isOutdated) {
    return { handled: true, checked: 1, updated: 0 };
  }

  if (!hasTrustedProvenance(thread.verifiedAt, thread.lastVerifiedAt)) {
    await prisma.thread.update({
      where: { id: threadId! },
      data: { isOutdated: true },
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
    await dispatch({
      recipients: { userIds: subscriberIds },
      category: 'AI_INSIGHT',
      title,
      message,
      data,
    });
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

export async function handleDeepResearchJob(data: import('../types').DeepResearchJobData) {
  // zod validation for QStash payload — prevents injection / overlong queries
  const deepResearchJobSchema = z.object({
    query: z.string().min(3).max(500),
    userId: z.string().cuid(),
    collectionId: z.string().cuid().optional(),
    sessionId: z.string().cuid().optional(),
  });
  const parsed = deepResearchJobSchema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid deep research payload', 'VALIDATION_ERROR', 400);
  }
  const validated = parsed.data;
  if (validated.collectionId) {
    const owned = await prisma.collection.findFirst({ where: { id: validated.collectionId, userId: validated.userId } });
    if (!owned) {
      throw new AppError('Collection not found', 'NOT_FOUND', 404);
    }
  }
  logger.info('[worker:ai] deep-research job', { query: validated.query, userId: validated.userId });
  let expertiseLevel: string | undefined;
  try {
    const u = await prisma.user.findUnique({ where: { id: validated.userId }, select: { preferences: true } });
    expertiseLevel = (u?.preferences as unknown as { expertiseLevel?: string })?.expertiseLevel;
  } catch (err) {
    logger.debug('[deep-research] failed to load expertiseLevel', { error: err });
  }
  const { executeAISearch } = await import('@/modules/ai-search/service');
  const { createKeyedLlm } = await import('@/lib/ai/text');
  const { searchWithExa, searchWithTavily } = await import('@/modules/ai-search/search-providers');
  const { prismaSearchStore } = await import('@/modules/ai-search/cache');
  const deepKeys = {
    exa: process.env.SASTRAM_EXA_KEY ?? '',
    tavily: process.env.SASTRAM_TAVILY_KEY ?? '',
    gemini: process.env.SASTRAM_GEMINI_KEY ?? process.env.GEMINI_API_KEY ?? '',
  };
  const result = await runGuardedWorker('deep-research', AiCallPath.FORUM_SEARCH_SYNTHESIZE, validated.query, () =>
    executeAISearch(
      validated.query,
      { exaMode: 'agentic', tavilyMode: 'research', sourceFilter: 'all', searchMode: 'advanced' },
      {
        llm: createKeyedLlm({ gemini: deepKeys.gemini }),
        search: {
          exa: (query, classification, config) => searchWithExa(query, classification, deepKeys.exa, config),
          tavily: async (query, classification, config) => {
            const { sources, answer } = await searchWithTavily(query, classification, deepKeys.tavily, config);
            return { sources, answer };
          },
        },
        store: prismaSearchStore(),
        expertise: expertiseLevel,
      }
    ),
    { alreadyBilled: readAlreadyBilled(data) }
  );
  if (!result.ok) return { skipped: true };

  await dispatch({
    recipients: { userIds: [validated.userId] },
    category: 'AI_INSIGHT',
    title: 'Deep research ready',
    message: `Your deep research for "${validated.query.slice(0, 60)}" is ready.`,
    data: { query: validated.query, sessionId: validated.sessionId, collectionId: validated.collectionId },
  });

  return { query: validated.query, done: true };
}
