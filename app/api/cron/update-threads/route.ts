import { logger } from '@/lib/infrastructure/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { env } from '@/lib/config/env';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob, getDailyQstashCount } from '@/lib/services/queue';
import { checkAndLogUsage } from '@/lib/services/usage-check';
import { updateAllThreadRelations } from '@/modules/threads';
import { prewarmFollowUpQueries } from '@/modules/ai-search';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { ok, fail } from '@/lib/utils/api-response';
import { purgeSoftDeleted } from '@/lib/services/soft-delete-purge';
import { reconcileCounters } from '@/lib/services/counter-reconciliation';

const BATCH_SIZE = 25;
const QSTASH_GUARD_THRESHOLD = 400;

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  const dailyCount = await getDailyQstashCount();
  if (dailyCount > QSTASH_GUARD_THRESHOLD) {
    logger.warn(`[cron/update-threads] Daily QStash count (${dailyCount}) exceeds guard threshold (${QSTASH_GUARD_THRESHOLD}), skipping`);
    return NextResponse.json(ok({ processed: 0, jobsAdded: 0, skipped: true, dailyCount }));
  }

  try {
    let totalProcessed = 0;
    let totalJobsAdded = 0;
    let cursor: string | undefined;

    // Process threads in batches to avoid loading all into memory
    while (true) {
      const threads = await prisma.thread.findMany({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
          deletedAt: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        include: {
          messages: {
            take: env.AI_ANALYSIS_MESSAGE_LIMIT,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              content: true,
              createdAt: true,
              sender: { select: { name: true } },
            },
          },
          subscriptions: {
            select: { userId: true },
          },
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });

      if (threads.length === 0) break;

      for (const thread of threads) {
        if (thread.messages.length === 0) {
          continue;
        }

        const messages = [...thread.messages].reverse();
        const subscriberIds = thread.subscriptions
          .filter((sub): sub is { userId: string } & Omit<typeof sub, 'userId'> => sub.userId !== null)
          .map((sub) => sub.userId);
        const isOutdated = thread.updatedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const oldScore = thread.resolutionScore;

        const jobs: Promise<void>[] = [
          enqueueJob(AIJobType.GENERATE_THREAD_DNA, { threadId: thread.id, messages, cronJob: true }),
          enqueueJob(AIJobType.CALCULATE_RESOLUTION_SCORE, { threadId: thread.id, messages, subscriberIds, threadName: thread.name, oldScore, isOutdated, cronJob: true }),
          enqueueJob(AIJobType.DETECT_CONFLICTS, { threadId: thread.id, messages, subscriberIds, threadName: thread.name, oldScore, cronJob: true }),
        ];

        if (subscriberIds.length > 0) {
          jobs.push(
            enqueueJob(AIJobType.GENERATE_DAILY_DIGEST, { messages, subscriberIds, cronJob: true }),
          );
        }

        if (subscriberIds.length > 0 && isOutdated) {
          jobs.push(
            enqueueJob(AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS, { subscriberIds, threadId: thread.id, threadName: thread.name, oldScore: oldScore ?? undefined, isOutdated, cronJob: true }),
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

    // Best-effort usage tripwire — logs warnings if approaching free-tier limits
    await checkAndLogUsage();

    // Phase 1 / Soft-delete retention purge — bounded batches; only fires when there's
    // expired soft-deleted rows. Same wall-clock budget concern as the rest of the cron.
    const purgeResult = await purgeSoftDeleted();

    // Phase 2 / Counter reconciliation — report-only by default. Full-table scans of
    // Thread + active Message rows; bounded by current prod volume.
    const reconciliationResult = await reconcileCounters();

    return NextResponse.json(
      ok({
        processed: totalProcessed,
        jobsAdded: totalJobsAdded,
        relationsUpdated: relationsResult.updated,
        prewarmedQueries: prewarmResult.prewarmed,
        purgedThreads: purgeResult.threads,
        purgedCommunities: purgeResult.communities,
        purgedUsers: purgeResult.users,
        reconciliation: {
          scanned: reconciliationResult.scanned,
          driftsFound: reconciliationResult.drifts.length,
        },
      })
    );
  } catch (error) {
    logger.error('Update threads cron error:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Update threads failed'), { status: 500 });
  }
}
