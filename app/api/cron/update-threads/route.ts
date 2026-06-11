import { logger } from '@/lib/infrastructure/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import {
  AIJobType,
  DEFAULT_JOB_OPTIONS,
  getAiInsightNotificationsQueue,
  getConflictDetectionQueue,
  getDailyDigestQueue,
  getResolutionScoreQueue,
  getThreadDnaQueue,
} from '@/lib/infrastructure/bullmq';
import { updateAllThreadRelations } from '@/modules/threads';
import { prewarmFollowUpQueries } from '@/modules/ai-search';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { ok, fail } from '@/lib/utils/api-response';

const BATCH_SIZE = 100;

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  try {
    const threadDnaQueue = getThreadDnaQueue();
    const resolutionScoreQueue = getResolutionScoreQueue();
    const conflictDetectionQueue = getConflictDetectionQueue();
    const dailyDigestQueue = getDailyDigestQueue();
    const aiInsightNotificationsQueue = getAiInsightNotificationsQueue();

    let totalProcessed = 0;
    let totalJobsAdded = 0;
    let cursor: string | undefined;

    // Process threads in batches to avoid loading all into memory
    while (true) {
      const threads = await prisma.thread.findMany({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        include: {
          messages: {
            take: parseInt(process.env.AI_ANALYSIS_MESSAGE_LIMIT || '50', 10),
            orderBy: { createdAt: 'desc' },
            include: { sender: true },
          },
          subscriptions: true,
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });

      if (threads.length === 0) break;

      for (const thread of threads) {
        if (thread.messages.length === 0) {
          continue;
        }

        const messages = thread.messages.reverse();
        const subscriberIds = thread.subscriptions
          .filter((sub): sub is { userId: string } & Omit<typeof sub, 'userId'> => sub.userId !== null)
          .map((sub) => sub.userId);
        const isOutdated = thread.updatedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const oldScore = thread.resolutionScore;
        const ts = Date.now();

        const jobs: Promise<unknown>[] = [
          threadDnaQueue.add(
            AIJobType.GENERATE_THREAD_DNA,
            { threadId: thread.id, messages, cronJob: true },
            { ...DEFAULT_JOB_OPTIONS, jobId: `generate-dna-${thread.id}-${ts}` }
          ),
          resolutionScoreQueue.add(
            AIJobType.CALCULATE_RESOLUTION_SCORE,
            { threadId: thread.id, messages, subscriberIds, threadName: thread.name, oldScore, isOutdated, cronJob: true },
            { ...DEFAULT_JOB_OPTIONS, jobId: `resolution-score-${thread.id}-${ts}` }
          ),
          conflictDetectionQueue.add(
            AIJobType.DETECT_CONFLICTS,
            { threadId: thread.id, messages, subscriberIds, threadName: thread.name, oldScore, cronJob: true },
            { ...DEFAULT_JOB_OPTIONS, jobId: `conflict-detection-${thread.id}-${ts}` }
          ),
        ];

        if (subscriberIds.length > 0) {
          jobs.push(
            dailyDigestQueue.add(
              AIJobType.GENERATE_DAILY_DIGEST,
              { messages, subscriberIds, cronJob: true },
              { ...DEFAULT_JOB_OPTIONS, jobId: `generate-digest-${thread.id}-${ts}` }
            )
          );
        }

        if (subscriberIds.length > 0 && isOutdated) {
          jobs.push(
            aiInsightNotificationsQueue.add(
              AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS,
              { subscriberIds, threadId: thread.id, threadName: thread.name, oldScore: oldScore ?? undefined, isOutdated, cronJob: true },
              { ...DEFAULT_JOB_OPTIONS, jobId: `send-notifications-${thread.id}-${ts}` }
            )
          );
        }

        const results = await Promise.allSettled(jobs);
        totalJobsAdded += results.filter((r) => r.status === 'fulfilled').length;
        totalProcessed++;
      }

      // Move cursor to last processed thread
      cursor = threads[threads.length - 1].id;

      // If we got fewer than BATCH_SIZE, we've processed all threads
      if (threads.length < BATCH_SIZE) break;
    }

    const relationsResult = await updateAllThreadRelations();
    const prewarmResult = await prewarmFollowUpQueries();

    return NextResponse.json(
      ok({
        processed: totalProcessed,
        jobsAdded: totalJobsAdded,
        relationsUpdated: relationsResult.updated,
        prewarmedQueries: prewarmResult.prewarmed,
      })
    );
  } catch (error) {
    logger.error('Update threads cron error:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Update threads failed'), { status: 500 });
  }
}
