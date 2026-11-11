import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

/**
 * KnowledgePage auto-promotion.
 *
 * A thread is promotable only while it is public, live, verified, not stale,
 * and above the resolution threshold. Pages that stop meeting those criteria
 * are removed (unpublished) on the next run. Content is the AI summary only:
 * the thread name/description is not a knowledge page.
 */

export const KNOWLEDGE_PROMOTION_THRESHOLD = 85;

export type KnowledgePromotionResult = {
  candidates: number;
  created: number;
  updated: number;
  unchanged: number;
  demoted: number;
  skipped: number;
};

const EMPTY_RESULT: KnowledgePromotionResult = {
  candidates: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  demoted: 0,
  skipped: 0,
};

const INELIGIBLE_PAGE_THREAD = {
  OR: [
    { deletedAt: { not: null } },
    { visibility: { not: 'PUBLIC' as const } },
    { isOutdated: true },
    { verifiedAt: null },
    { resolutionScore: null },
    { resolutionScore: { lte: KNOWLEDGE_PROMOTION_THRESHOLD } },
  ],
};

/**
 * Remove pages whose thread is no longer a public, verified, current answer.
 * The relation filter is one query and also covers rows whose thread was
 * deleted (the FK cascade normally removes those first).
 */
async function demoteIneligiblePages(): Promise<number> {
  const result = await prisma.knowledgePage.deleteMany({
    where: { thread: INELIGIBLE_PAGE_THREAD },
  });
  return result.count;
}

export async function promoteThreadsToKnowledgePages(): Promise<KnowledgePromotionResult> {
  // Best-effort: outer catch ensures never throws unhandled (KISS).
  try {
    let demoted = 0;
    try {
      demoted = await demoteIneligiblePages();
      if (demoted > 0) {
        logger.info('[knowledge-promotion] demoted ineligible pages', { demoted });
      }
    } catch (error) {
      // Demotion is best-effort too; promotion can still run.
      logger.error('[knowledge-promotion] failed to demote ineligible pages', error);
    }

    let threads: Array<{ id: string; aiSummary: string | null }>;
    try {
      const batchSize = 100;
      threads = [];
      let cursor: string | undefined;
      while (true) {
        const batch = await prisma.thread.findMany({
          where: {
            resolutionScore: { gt: KNOWLEDGE_PROMOTION_THRESHOLD },
            verifiedAt: { not: null },
            isOutdated: false,
            visibility: 'PUBLIC',
            deletedAt: null,
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          select: {
            id: true,
            aiSummary: true,
          },
          orderBy: { id: 'asc' },
          take: batchSize,
        });
        threads.push(...batch);
        if (batch.length < batchSize) break;
        cursor = batch[batch.length - 1].id;
      }
    } catch (error) {
      logger.error('[knowledge-promotion] failed to fetch candidates', error);
      return { ...EMPTY_RESULT, demoted };
    }

    if (threads.length === 0) {
      logger.info('[knowledge-promotion] no candidates', { ...EMPTY_RESULT, demoted });
      return { ...EMPTY_RESULT, demoted };
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;

    for (const thread of threads) {
      try {
        if (!thread || !thread.id) {
          logger.warn('[knowledge-promotion] skipped thread with missing id', { thread });
          skipped++;
          continue;
        }

        // A real AI summary is required. Falling back to the thread name or
        // description produced thin, low-value pages; skip instead.
        const synthesizedContent = thread.aiSummary?.trim() ?? '';
        if (!synthesizedContent) {
          logger.info('[knowledge-promotion] skipped thread without aiSummary', {
            threadId: thread.id,
          });
          skipped++;
          continue;
        }

        // Read the current page so version only advances on a real content change.
        let existing: { id: string; synthesizedContent: string; version: number } | null = null;
        try {
          existing = await prisma.knowledgePage.findUnique({
            where: { threadId: thread.id },
            select: { id: true, synthesizedContent: true, version: true },
          });
        } catch (error) {
          logger.error('[knowledge-promotion] failed to check existing page', error, {
            threadId: thread.id,
          });
          skipped++;
          continue;
        }

        if (existing && existing.synthesizedContent === synthesizedContent) {
          unchanged++;
          continue;
        }

        try {
          await prisma.knowledgePage.upsert({
            where: { threadId: thread.id },
            create: {
              threadId: thread.id,
              synthesizedContent,
              version: 1,
            },
            update: {
              synthesizedContent,
              version: { increment: 1 },
            },
          });
        } catch (error) {
          logger.error('[knowledge-promotion] upsert failed for thread', error, {
            threadId: thread.id,
          });
          skipped++;
          continue;
        }

        if (existing) {
          updated++;
        } else {
          created++;
        }
      } catch (error) {
        // Catch-all per thread so one failed thread never blocks others
        logger.error('[knowledge-promotion] unexpected error for thread', error, {
          threadId: (thread as unknown as { id?: string })?.id ?? 'unknown',
        });
        skipped++;
        continue;
      }
    }

    const result = {
      candidates: threads.length,
      created,
      updated,
      unchanged,
      demoted,
      skipped,
    };
    logger.info('[knowledge-promotion]', result);
    return result;
  } catch (error) {
    // Absolute safety net — never throws unhandled
    logger.error('[knowledge-promotion] unexpected fatal error', error);
    return { ...EMPTY_RESULT };
  }
}

// Alias for cron readability
export const autoPromoteKnowledgePages = promoteThreadsToKnowledgePages;
