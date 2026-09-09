import { logger } from '@/lib/infrastructure/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { env } from '@/lib/config/env';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob, getDailyQstashCount } from '@/lib/services/queue';
import { checkAndLogUsage } from '@/lib/services/usage-check';
import { updateAllThreadRelations } from '@/modules/threads';
import { prewarmFollowUpQueries } from '@/modules/ai-search';
import { verifyCronAuth } from '@/lib/middleware/cron-auth';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { purgeSoftDeleted } from '@/lib/services/soft-delete-purge';
import { reconcileCounters } from '@/lib/services/counter-reconciliation';
import { promoteThreadsToKnowledgePages } from '@/lib/services/knowledge-promotion';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { computeConfidence } from '@/modules/threads/confidence-decay';
import { refreshUserExpertise } from '@/lib/services/user-memory';

const BATCH_SIZE = 25;
const QSTASH_GUARD_THRESHOLD = 400;
const SCORE_FRESHNESS_HOURS = 24;
const HIGH_SCORE_THRESHOLD = 70;

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

  // Spend cap pre-flight — each path isolated, fail-open on error (KISS: simple try/catch per item)
  let dnaAllowed: { allowed: boolean; remaining: number } = { allowed: true, remaining: -1 };
  let scoreAllowed: { allowed: boolean; remaining: number } = { allowed: true, remaining: -1 };
  let conflictAllowed: { allowed: boolean; remaining: number } = { allowed: true, remaining: -1 };
  let digestAllowed: { allowed: boolean; remaining: number } = { allowed: true, remaining: -1 };
  try {
    dnaAllowed = await enforceAiSpendCap(AiCallPath.THREAD_DNA);
  } catch (error) {
    logger.warn('[cron/update-threads] spend cap check failed for THREAD_DNA, allowing (fail-open)', error);
  }
  try {
    scoreAllowed = await enforceAiSpendCap(AiCallPath.RESOLUTION_SCORE);
  } catch (error) {
    logger.warn('[cron/update-threads] spend cap check failed for RESOLUTION_SCORE, allowing (fail-open)', error);
  }
  try {
    conflictAllowed = await enforceAiSpendCap(AiCallPath.CONFLICT_DETECTION);
  } catch (error) {
    logger.warn('[cron/update-threads] spend cap check failed for CONFLICT_DETECTION, allowing (fail-open)', error);
  }
  try {
    digestAllowed = await enforceAiSpendCap(AiCallPath.DAILY_DIGEST);
  } catch (error) {
    logger.warn('[cron/update-threads] spend cap check failed for DAILY_DIGEST, allowing (fail-open)', error);
  }

  try {
    let totalProcessed = 0;
    let totalJobsAdded = 0;
    let cursor: string | undefined;

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

          // KISS: skip human-verified threads while confidence is still high (mirrors ai-jobs isStale <0.5)
          const provenanceAt =
            (thread as unknown as { verifiedAt?: Date | null; lastVerifiedAt?: Date | null }).verifiedAt ??
            (thread as unknown as { verifiedAt?: Date | null; lastVerifiedAt?: Date | null }).lastVerifiedAt ??
            null;
          if (provenanceAt) {
            const { confidence } = computeConfidence(new Date(provenanceAt));
            if (confidence >= 0.5) continue;
          }

          const messages = [...thread.messages].reverse();
          const subscriberIds = thread.subscriptions
            .filter((sub): sub is { userId: string } & Omit<typeof sub, 'userId'> => sub.userId !== null)
            .map((sub) => sub.userId);
          const oldScore = thread.resolutionScore;
          // Use the thread's maintained isOutdated flag (set by staleness check job)
          // instead of computing it at enqueue time, which would be stale by execution.
          const { isOutdated } = thread;

          const jobs: Promise<void>[] = [];

          // Each enqueue isolated — sync throw is caught per item (KISS)
          try {
            if (dnaAllowed.allowed) {
              jobs.push(
                enqueueJob(AIJobType.GENERATE_THREAD_DNA, { threadId: thread.id, messages, cronJob: true })
              );
            }
          } catch (error) {
            logger.warn('[cron/update-threads] failed to enqueue DNA job', error, { threadId: thread.id });
          }

          try {
            if (scoreAllowed.allowed) {
              jobs.push(
                enqueueJob(AIJobType.CALCULATE_RESOLUTION_SCORE, {
                  threadId: thread.id,
                  messages,
                  subscriberIds,
                  threadName: thread.name,
                  oldScore,
                  isOutdated,
                  cronJob: true,
                })
              );
            }
          } catch (error) {
            logger.warn('[cron/update-threads] failed to enqueue score job', error, { threadId: thread.id });
          }

          try {
            if (conflictAllowed.allowed) {
              jobs.push(
                enqueueJob(AIJobType.DETECT_CONFLICTS, {
                  threadId: thread.id,
                  messages,
                  subscriberIds,
                  threadName: thread.name,
                  oldScore,
                  cronJob: true,
                })
              );
            }
          } catch (error) {
            logger.warn('[cron/update-threads] failed to enqueue conflict job', error, {
              threadId: thread.id,
            });
          }

          try {
            if (subscriberIds.length > 0 && digestAllowed.allowed) {
              jobs.push(
                enqueueJob(AIJobType.GENERATE_DAILY_DIGEST, { messages, subscriberIds, cronJob: true })
              );
            }
          } catch (error) {
            logger.warn('[cron/update-threads] failed to enqueue digest job', error, {
              threadId: thread.id,
            });
          }

          try {
            if (subscriberIds.length > 0 && isOutdated) {
              jobs.push(
                enqueueJob(AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS, {
                  subscriberIds,
                  threadId: thread.id,
                  threadName: thread.name,
                  oldScore: oldScore ?? undefined,
                  isOutdated,
                  cronJob: true,
                })
              );
            }
          } catch (error) {
            logger.warn('[cron/update-threads] failed to enqueue insight job', error, {
              threadId: thread.id,
            });
          }

          const results = await Promise.allSettled(jobs);
          const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
          const failed = results.filter((r) => r.status === 'rejected');
          if (failed.length > 0) {
            logger.warn('[cron/update-threads] some jobs failed to enqueue', {
              threadId: thread.id,
              failedCount: failed.length,
            });
          }
          totalJobsAdded += fulfilled;
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
      for (const u of activeUserIds) {
        try {
          await refreshUserExpertise(u.id);
          expertiseRefreshed++;
        } catch (err) {
          logger.debug('[cron/update-threads] refreshUserExpertise failed', { userId: u.id, error: err });
        }
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
