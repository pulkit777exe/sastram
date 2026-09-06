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
  const threads = await prisma.thread.findMany({
    where: {
      resolutionScore: { gt: KNOWLEDGE_PROMOTION_THRESHOLD },
      verifiedAt: { not: null },
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      aiSummary: true,
      description: true,
    },
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const thread of threads) {
    const synthesizedContent =
      thread.aiSummary?.trim() || thread.description?.trim() || thread.name?.trim() || '';

    if (!synthesizedContent) {
      skipped++;
      continue;
    }

    const existing = await prisma.knowledgePage.findUnique({
      where: { threadId: thread.id },
      select: { id: true },
    });

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

    if (existing) {
      updated++;
    } else {
      created++;
    }
  }

  logger.info('[knowledge-promotion]', {
    candidates: threads.length,
    created,
    updated,
    skipped,
  });

  return { candidates: threads.length, created, updated, skipped };
}

// Alias for cron readability
export const autoPromoteKnowledgePages = promoteThreadsToKnowledgePages;
