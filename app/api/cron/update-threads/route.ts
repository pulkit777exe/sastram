import { logger } from '@/lib/infrastructure/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { env } from '@/lib/config/env';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob, getDailyQstashCount, type EnqueueJobResult } from '@/lib/services/queue';
import { checkAndLogUsage } from '@/lib/services/usage-check';
import { updateAllThreadRelations } from '@/modules/threads';
import { prewarmFollowUpQueries } from '@/modules/ai-search';
import { verifyCronAuth } from '@/lib/middleware/cron-auth';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { purgeSoftDeleted } from '@/lib/services/soft-delete-purge';
import { reconcileCounters } from '@/lib/services/counter-reconciliation';
import { promoteThreadsToKnowledgePages } from '@/lib/services/knowledge-promotion';
import { checkCronSpendCaps } from '@/lib/ai/guard';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { hasTrustedProvenance } from '@/modules/threads/confidence-decay';
import { refreshUserExpertise } from '@/lib/services/user-memory';

const BATCH_SIZE = 25;
const QSTASH_GUARD_THRESHOLD = 400;
const SCORE_FRESHNESS_HOURS = 24;
const HIGH_SCORE_THRESHOLD = 70;
// Bound fan-out per run so one cron tick cannot blow the QStash daily budget.
const MAX_ENQUEUES_PER_RUN = 150;

export async function GET(req: NextRequest) {
  // Cron auth — best-effort with logging (KISS)
  try {
    const authError = verifyCronAuth(req);
    if (authError) {
      logger.warn('[cron/update-threads] unauthorized', { path: req.nextUrl.pathname });
      return authError;
    }
  } catch (error) {
    logger.error('[cron/update-threads] auth check failed', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Auth check failed'), {
      status: HTTP_STATUS.INTERNAL,
    });
  }

  // QStash guard — fail-open on error (KISS: log and continue)
  let dailyCount = 0;
  try {
    dailyCount = await getDailyQstashCount();
    if (dailyCount > QSTASH_GUARD_THRESHOLD) {
      logger.warn(
        `[cron/update-threads] Daily QStash count (${dailyCount}) exceeds guard threshold (${QSTASH_GUARD_THRESHOLD}), skipping`
      );
      return NextResponse.json(ok({ processed: 0, jobsAdded: 0, skipped: true, dailyCount }));
    }
  } catch (error) {
    logger.warn('[cron/update-threads] failed to get QStash count, continuing (fail-open)', error);
    dailyCount = 0;
  }

  // Spend cap pre-flight — read-only, one check per path (consumes nothing).
  // Each enqueued worker consumes its own per-path estimate via
  // runGuardedWorker (ADR-0001: routes consume, workers skip only when the
  // route that ran the work synchronously already billed it).
  const spendCaps = await checkCronSpendCaps([
    AiCallPath.THREAD_DNA,
    AiCallPath.RESOLUTION_SCORE,
    AiCallPath.CONFLICT_DETECTION,
    AiCallPath.DAILY_DIGEST,
  ]);
  const dnaAllowed = spendCaps[AiCallPath.THREAD_DNA] ?? { allowed: true, remaining: -1 };
  const scoreAllowed = spendCaps[AiCallPath.RESOLUTION_SCORE] ?? { allowed: true, remaining: -1 };
  const conflictAllowed = spendCaps[AiCallPath.CONFLICT_DETECTION] ?? { allowed: true, remaining: -1 };
  const digestAllowed = spendCaps[AiCallPath.DAILY_DIGEST] ?? { allowed: true, remaining: -1 };

  try {
    let totalProcessed = 0;
    let totalJobsAdded = 0;
    let totalJobsDropped = 0;
    let enqueuesThisRun = 0;
    let enqueuesSkippedByCap = 0;
    let cursor: string | undefined;

    // Bound fan-out: once the per-run budget is spent, further jobs are
    // counted as skipped instead of enqueued (logged once at the end).
    const pushBoundedJob = (jobs: Array<Promise<EnqueueJobResult>>, jobType: string, payload: object) => {
      if (enqueuesThisRun >= MAX_ENQUEUES_PER_RUN) {
        enqueuesSkippedByCap++;
        return;
      }
      enqueuesThisRun++;
      jobs.push(enqueueJob(jobType, payload));
    };

    // Process threads in batches to avoid loading all into memory (KISS: per-batch try/catch)
    while (true) {
      let threads: Array<{
        id: string;
        name: string;
        updatedAt: Date;
        resolutionScore: number | null;
        isOutdated: boolean;
        verifiedAt: Date | null;
        lastVerifiedAt: Date | null;
        messages: Array<{ id: string; content: string; createdAt: Date; sender: { name: string | null } | null }>;
        subscriptions: Array<{ userId: string | null }>;
      }>;
      try {
        threads = await prisma.thread.findMany({
          where: {
            updatedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
            deletedAt: null,
            // Skip threads with a high score verified recently — no need to re-enqueue
            NOT: {
              AND: [
                { resolutionScore: { gte: HIGH_SCORE_THRESHOLD } },
                { lastVerifiedAt: { gte: new Date(Date.now() - SCORE_FRESHNESS_HOURS * 60 * 60 * 1000) } },
              ],
            },
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          select: {
            id: true,
            name: true,
            updatedAt: true,
            resolutionScore: true,
            isOutdated: true,
            verifiedAt: true,
            lastVerifiedAt: true,
            messages: {
              take: env.AI_ANALYSIS_MESSAGE_LIMIT,
              orderBy: { createdAt: 'desc' as const },
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
      } catch (error) {
        logger.error('[cron/update-threads] failed to fetch threads batch', error, { cursor });
        break;
      }

      if (threads.length === 0) break;

      for (const thread of threads) {
        try {
          if (thread.messages.length === 0) {
            continue;
          }

          // Skip threads whose resolution provenance is still trusted —
          // human verification (verifiedAt) or the last AI score
          // (lastVerifiedAt) inside the decay window (~120 days). Staleness
          // marking no longer refreshes either timestamp, so threads it
          // marked are re-enriched on the next run instead of being silenced
          // for another full window.
          if (hasTrustedProvenance(thread.verifiedAt, thread.lastVerifiedAt)) {
            continue;
          }

          const messages = [...thread.messages].reverse();
          const subscriberIds = thread.subscriptions
            .filter((sub): sub is { userId: string } & Omit<typeof sub, 'userId'> => sub.userId !== null)
            .map((sub) => sub.userId);
          const oldScore = thread.resolutionScore;
          // Use the thread's maintained isOutdated flag (set by staleness check job)
          // instead of computing it at enqueue time, which would be stale by execution.
          const { isOutdated } = thread;

          const jobs: Array<Promise<EnqueueJobResult>> = [];

          // No billing token: each worker consumes its own per-path estimate.
          if (dnaAllowed.allowed) {
            pushBoundedJob(jobs, AIJobType.GENERATE_THREAD_DNA, { threadId: thread.id, messages, cronJob: true });
          }

          if (scoreAllowed.allowed) {
            pushBoundedJob(jobs, AIJobType.CALCULATE_RESOLUTION_SCORE, {
              threadId: thread.id,
              messages,
              subscriberIds,
              threadName: thread.name,
              oldScore,
              isOutdated,
              cronJob: true,
            });
          }

          if (conflictAllowed.allowed) {
            pushBoundedJob(jobs, AIJobType.DETECT_CONFLICTS, {
              threadId: thread.id,
              messages,
              subscriberIds,
              threadName: thread.name,
              oldScore,
              cronJob: true,
            });
          }

          if (subscriberIds.length > 0 && digestAllowed.allowed) {
            pushBoundedJob(jobs, AIJobType.GENERATE_DAILY_DIGEST, {
              messages,
              subscriberIds,
              threadId: thread.id,
              cronJob: true,
            });
          }

          if (subscriberIds.length > 0 && isOutdated) {
            pushBoundedJob(jobs, AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS, {
              subscriberIds,
              threadId: thread.id,
              threadName: thread.name,
              oldScore: oldScore ?? undefined,
              isOutdated,
              cronJob: true,
            });
          }

          const settled = await Promise.allSettled(jobs);
          let published = 0;
          let dropped = 0;
          let failed = 0;
          for (const outcome of settled) {
            if (outcome.status === 'fulfilled' && outcome.value.ok) {
              published++;
            } else if (outcome.status === 'fulfilled') {
              dropped++;
            } else {
              failed++;
            }
          }
          if (dropped > 0 || failed > 0) {
            logger.warn('[cron/update-threads] enqueue outcomes', {
              threadId: thread.id,
              published,
              dropped,
              failed,
            });
          }
          totalJobsAdded += published;
          totalJobsDropped += dropped;
          totalProcessed++;
        } catch (error) {
          // Per-thread catch so one failed thread never blocks others (KISS)
          logger.error('[cron/update-threads] failed to process thread', error, {
            threadId: (thread as unknown as { id?: string })?.id ?? 'unknown',
          });
          continue;
        }
      }

      // Move cursor to last processed thread
      cursor = threads[threads.length - 1].id;

      // If we got fewer than BATCH_SIZE, we've processed all threads
      if (threads.length < BATCH_SIZE) break;
    }

    // Thread-staleness sweep — batch job, no AI calls, so it carries no
    // billing token (nothing for a worker to consume).
    const stalenessJobs: Array<Promise<EnqueueJobResult>> = [];
    pushBoundedJob(stalenessJobs, AIJobType.STALENESS_CHECK, { cronJob: true });
    const stalenessOutcomes = await Promise.allSettled(stalenessJobs);
    for (const outcome of stalenessOutcomes) {
      if (outcome.status === 'fulfilled' && outcome.value.ok) {
        totalJobsAdded++;
      } else {
        totalJobsDropped++;
        logger.warn('[cron/update-threads] staleness batch check was not enqueued');
      }
    }

    if (enqueuesSkippedByCap > 0) {
      logger.warn(
        `[cron/update-threads] fan-out capped at ${MAX_ENQUEUES_PER_RUN} enqueues this run — ${enqueuesSkippedByCap} skipped`
      );
    }

    // Each auxiliary task is best-effort — individual try/catch so partial failures are graceful (KISS)
    let relationsResult: { updated: number } = { updated: 0 };
    try {
      relationsResult = await updateAllThreadRelations();
    } catch (error) {
      logger.error('[cron/update-threads] relations update failed', error);
    }

    let prewarmResult: { prewarmed: number } = { prewarmed: 0 };
    try {
      prewarmResult = await prewarmFollowUpQueries();
    } catch (error) {
      logger.error('[cron/update-threads] prewarm failed', error);
    }

    try {
      await checkAndLogUsage();
    } catch (error) {
      logger.warn('[cron/update-threads] checkAndLogUsage failed', error);
    }

    let purgeResult: { threads: number; users: number } = { threads: 0, users: 0 };
    try {
      purgeResult = await purgeSoftDeleted();
    } catch (error) {
      logger.error('[cron/update-threads] purge failed', error);
    }

    let reconciliationResult: { scanned: number; drifts: unknown[] } = { scanned: 0, drifts: [] };
    try {
      reconciliationResult = await reconcileCounters();
    } catch (error) {
      logger.error('[cron/update-threads] reconciliation failed', error);
    }

    // KnowledgePage auto-promotion — best-effort, never throws (per-thread isolation inside service)
    let knowledgeResult: Awaited<ReturnType<typeof promoteThreadsToKnowledgePages>> | null = null;
    try {
      knowledgeResult = await promoteThreadsToKnowledgePages();
    } catch (error) {
      logger.error('[cron/update-threads] knowledge promotion failed', error);
    }

    let expertiseRefreshed = 0;
    try {
      const activeUserIds = await prisma.user.findMany({
        where: { threads: { some: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } } },
        select: { id: true },
        take: 50,
      });
      // Chunked parallel refresh (10 at a time): 50 serial user-read+write
      // cycles dominated cron wall-time. allSettled so one user's failure
      // never aborts the rest.
      const CHUNK = 10;
      for (let i = 0; i < activeUserIds.length; i += CHUNK) {
        const outcomes = await Promise.allSettled(
          activeUserIds.slice(i, i + CHUNK).map((u) => refreshUserExpertise(u.id))
        );
        outcomes.forEach((outcome, j) => {
          if (outcome.status === 'fulfilled') {
            expertiseRefreshed++;
          } else {
            logger.debug('[cron/update-threads] refreshUserExpertise failed', {
              userId: activeUserIds[i + j]?.id,
              error: outcome.reason,
            });
          }
        });
      }
      if (expertiseRefreshed > 0) {
        logger.info('[cron/update-threads] expertise refreshed', { expertiseRefreshed });
      }
    } catch (error) {
      logger.warn('[cron/update-threads] expertise refresh failed', error);
    }

    return NextResponse.json(
      ok({
        processed: totalProcessed,
        jobsAdded: totalJobsAdded,
        jobsDropped: totalJobsDropped,
        relationsUpdated: relationsResult.updated,
        prewarmedQueries: prewarmResult.prewarmed,
        purgedThreads: purgeResult.threads,
        purgedUsers: purgeResult.users,
        reconciliation: {
          scanned: reconciliationResult.scanned,
          driftsFound: reconciliationResult.drifts.length,
        },
        knowledgePages: knowledgeResult,
        expertiseRefreshed,
      })
    );
  } catch (error) {
    logger.error('Update threads cron error:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Update threads failed'), { status: HTTP_STATUS.INTERNAL });
  }
}
