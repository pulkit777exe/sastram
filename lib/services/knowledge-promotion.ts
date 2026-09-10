import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

/**
 * KnowledgePage auto-promotion.
 *
 * KISS: query threads where resolutionScore > 85 and verifiedAt is not null,
 * then upsert a KnowledgePage with synthesizedContent from thread.aiSummary
 * (fallback to description / name). No complex versioning — version stays at 1.
 */

export const KNOWLEDGE_PROMOTION_THRESHOLD = 85;

export type KnowledgePromotionResult = {
  candidates: number;
  created: number;
  updated: number;
  skipped: number;
};

export async function promoteThreadsToKnowledgePages(): Promise<KnowledgePromotionResult> {
  // Best-effort: outer catch ensures never throws unhandled (KISS).
  try {
    let threads: Array<{ id: string; name: string; aiSummary: string | null; description: string | null }>;
    try {
      const batchSize = 100;
      threads = [];
      let cursor: string | undefined;
      while (true) {
        const batch = await prisma.thread.findMany({
          where: {
            resolutionScore: { gt: KNOWLEDGE_PROMOTION_THRESHOLD },
            verifiedAt: { not: null },
            deletedAt: null,
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          select: {
            id: true,
            name: true,
            aiSummary: true,
            description: true,
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
      return { candidates: 0, created: 0, updated: 0, skipped: 0 };
    }

    // Handle missing threads (no candidates)
    if (!threads || threads.length === 0) {
      logger.info('[knowledge-promotion] no candidates', {
        candidates: 0,
        created: 0,
        updated: 0,
        skipped: 0,
      });
      return { candidates: 0, created: 0, updated: 0, skipped: 0 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const thread of threads) {
      try {
        // Handle missing thread object / missing id
        if (!thread || !thread.id) {
          logger.warn('[knowledge-promotion] skipped thread with missing id', { thread });
          skipped++;
          continue;
        }

        // Handle missing aiSummary — log fallback usage (KISS)
        const hasAiSummary = typeof thread.aiSummary === 'string' && thread.aiSummary.trim().length > 0;
        if (!hasAiSummary) {
          logger.info('[knowledge-promotion] thread missing aiSummary, using fallback', {
            threadId: thread.id,
          });
        }

        const synthesizedContent =
          thread.aiSummary?.trim() || thread.description?.trim() || thread.name?.trim() || '';

        if (!synthesizedContent) {
          logger.warn('[knowledge-promotion] skipped thread with empty content', {
            threadId: thread.id,
          });
          skipped++;
          continue;
        }

        // Idempotent check — DB errors per thread must not block others
        let existing: { id: string } | null = null;
        try {
          existing = await prisma.knowledgePage.findUnique({
            where: { threadId: thread.id },
            select: { id: true },
          });
        } catch (error) {
          logger.error('[knowledge-promotion] failed to check existing page', error, {
            threadId: thread.id,
          });
          // Best-effort: continue to upsert attempt; if upsert also fails we skip
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

    logger.info('[knowledge-promotion]', {
      candidates: threads.length,
      created,
      updated,
      skipped,
    });

    return { candidates: threads.length, created, updated, skipped };
  } catch (error) {
    // Absolute safety net — never throws unhandled
    logger.error('[knowledge-promotion] unexpected fatal error', error);
    return { candidates: 0, created: 0, updated: 0, skipped: 0 };
  }
}

// Alias for cron readability
export const autoPromoteKnowledgePages = promoteThreadsToKnowledgePages;
