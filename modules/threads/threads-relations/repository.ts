import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma } from '@prisma/client';
import { aiService } from '@/lib/services/ai';

// Threshold for considering threads semantically similar (0-1)
const SIMILARITY_THRESHOLD = 0.7;

// Maximum number of related threads to return
const MAX_RELATED_THREADS = 5;

/**
 * Calculates semantic similarity between two thread DNA objects
 */
function calculateThreadSimilarity(dna1: any, dna2: any): number {
  if (!dna1 || !dna2) return 0;

  // Calculate topic similarity (Jaccard index)
  const topics1 = new Set(dna1.topics || []);
  const topics2 = new Set(dna2.topics || []);
  const intersection = new Set([...topics1].filter((x) => topics2.has(x)));
  const union = new Set([...topics1, ...topics2]);
  const topicSimilarity = union.size === 0 ? 0 : intersection.size / union.size;

  // Calculate question type similarity (exact match)
  const questionTypeSimilarity = dna1.questionType === dna2.questionType ? 1 : 0.3;

  // Calculate expertise level similarity
  const expertiseLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
  const level1 = expertiseLevels.indexOf(dna1.expertiseLevel);
  const level2 = expertiseLevels.indexOf(dna2.expertiseLevel);
  const expertiseSimilarity =
    level1 !== -1 && level2 !== -1
      ? 1 - Math.abs(level1 - level2) / (expertiseLevels.length - 1)
      : 0.5;

  // Weighted average of similarities
  const total = topicSimilarity * 0.5 + questionTypeSimilarity * 0.3 + expertiseSimilarity * 0.2;
  return total;
}

/**
 * Finds semantically related threads for a given thread
 */
export async function findRelatedThreads(threadId: string): Promise<
  Array<{
    id: string;
    name: string;
    slug: string;
    similarity: number;
    threadDna: any;
  }>
> {
  try {
    const thread = await prisma.section.findUnique({
      where: { id: threadId },
      select: {
        threadDna: true,
      },
    });

    if (!thread?.threadDna) {
      return [];
    }

    // Get all other threads with thread DNA
    const otherThreads = await prisma.section.findMany({
      where: {
        id: { not: threadId },
        threadDna: { not: Prisma.DbNull },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        threadDna: true,
      },
    });

    // Calculate similarity for each thread
    const relatedThreads = otherThreads
      .map((other) => {
        const similarity = calculateThreadSimilarity(thread.threadDna, other.threadDna);
        return {
          ...other,
          similarity,
        };
      })
      .filter((t) => t.similarity >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_RELATED_THREADS);

    // Batch check which relations already exist
    const relatedIds = relatedThreads.map((r) => r.id);
    const existingRelations = await prisma.threadRelation.findMany({
      where: {
        sourceThreadId: threadId,
        targetThreadId: { in: relatedIds },
      },
      select: { id: true, targetThreadId: true, similarity: true },
    });

    const existingMap = new Map(existingRelations.map((r) => [r.targetThreadId, r]));

    const toCreate: Array<{ sourceThreadId: string; targetThreadId: string; similarity: number }> = [];
    const toUpdate: Array<{ id: string; similarity: number }> = [];

    for (const related of relatedThreads) {
      const existing = existingMap.get(related.id);
      if (!existing) {
        toCreate.push({
          sourceThreadId: threadId,
          targetThreadId: related.id,
          similarity: related.similarity,
        });
      } else if (existing.similarity !== related.similarity) {
        toUpdate.push({ id: existing.id, similarity: related.similarity });
      }
    }

    if (toCreate.length > 0) {
      await prisma.threadRelation.createMany({ data: toCreate });
    }

    await Promise.all(
      toUpdate.map((u) =>
        prisma.threadRelation.update({
          where: { id: u.id },
          data: { similarity: u.similarity },
        })
      )
    );

    return relatedThreads;
  } catch (error) {
    logger.error(`Failed to find related threads for ${threadId}:`, error);
    return [];
  }
}

/**
 * Gets related threads for a given thread from the database
 */
export type RelatedThread = {
  id: string;
  name: string;
  slug: string;
  similarity: number;
  threadDna: any;
  community: { slug: string; name: string } | null;
};

export async function getRelatedThreads(threadId: string): Promise<RelatedThread[]> {
  const relations = await prisma.threadRelation.findMany({
    where: { sourceThreadId: threadId },
    include: {
      target: {
        select: {
          id: true,
          name: true,
          slug: true,
          threadDna: true,
          community: { select: { slug: true, name: true } },
        },
      },
    },
    orderBy: { similarity: 'desc' },
    take: MAX_RELATED_THREADS,
  });

  return relations.map((relation) => ({
    id: relation.target.id,
    name: relation.target.name,
    slug: relation.target.slug,
    similarity: relation.similarity,
    threadDna: relation.target.threadDna,
    community: relation.target.community,
  }));
}

/**
 * Updates all thread relations by recalculating semantic similarity
 */
export async function updateAllThreadRelations(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  const stats = { processed: 0, updated: 0, errors: 0 };

  try {
    const threads = await prisma.section.findMany({
      where: {
        threadDna: { not: Prisma.DbNull },
        updatedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        threadDna: true,
      },
    });

    stats.processed = threads.length;

    const CONCURRENCY = 5;
    const chunks: typeof threads[] = [];
    for (let i = 0; i < threads.length; i += CONCURRENCY) {
      chunks.push(threads.slice(i, i + CONCURRENCY));
    }

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map((thread) => findRelatedThreads(thread.id))
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          stats.updated += result.value.length;
        } else {
          logger.error('[updateAllThreadRelations] chunk error', { error: result.reason });
          stats.errors++;
        }
      }
    }
  } catch (error) {
    logger.error('Failed to update all thread relations:', error);
    stats.errors++;
  }

  return stats;
}

/**
 * Deletes old thread relations that are no longer relevant
 */
async function cleanupOldThreadRelations(): Promise<{ deleted: number }> {
  try {
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days old
    const result = await prisma.threadRelation.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        similarity: { lt: SIMILARITY_THRESHOLD },
      },
    });

    return { deleted: result.count };
  } catch (error) {
    logger.error('Failed to cleanup old thread relations:', error);
    return { deleted: 0 };
  }
}
