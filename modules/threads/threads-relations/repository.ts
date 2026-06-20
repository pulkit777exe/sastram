import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma } from '@prisma/client';
import { aiService } from '@/lib/services/ai';
import { parseThreadDna, type ThreadDNA } from '@/lib/schemas/thread-dna';

// Threshold for considering threads semantically similar (0-1)
const SIMILARITY_THRESHOLD = 0.7;

// Maximum number of related threads to return
const MAX_RELATED_THREADS = 5;

/**
 * Calculates semantic similarity between two thread DNA objects
 */
function calculateThreadSimilarity(dna1: ThreadDNA, dna2: ThreadDNA): number {
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
    threadDna: ThreadDNA | null;
  }>
> {
  try {
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        threadDna: true,
      },
    });

    const parsedDna = parseThreadDna(thread?.threadDna);
    if (!parsedDna) {
      return [];
    }

    // Get other threads with thread DNA (bounded to prevent unbounded scans)
    const otherThreads = await prisma.thread.findMany({
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
      take: 1000,
    });

    // Calculate similarity for each thread
    const relatedThreads = otherThreads
      .map((other) => {
        const otherDna = parseThreadDna(other.threadDna);
        if (!otherDna) return null;
        const similarity = calculateThreadSimilarity(parsedDna, otherDna);
        return {
          id: other.id,
          name: other.name,
          slug: other.slug,
          similarity,
          threadDna: otherDna,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
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
  threadDna: ThreadDNA | null;
  community: { slug: string; title: string } | null;
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
          community: { select: { slug: true, title: true } },
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
    threadDna: parseThreadDna(relation.target.threadDna),
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
    const threads = await prisma.thread.findMany({
      where: {
        threadDna: { not: Prisma.DbNull },
        updatedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        threadDna: true,
      },
      take: 500,
    });

    stats.processed = threads.length;

    // Pre-fetch all existing relations for batch updates
    const threadIds = threads.map(t => t.id);
    const existingRelations = await prisma.threadRelation.findMany({
      where: { sourceThreadId: { in: threadIds } },
      select: { id: true, sourceThreadId: true, targetThreadId: true, similarity: true },
    });

    // Group relations by sourceThreadId
    const relationsBySource = new Map<string, Map<string, { id: string; similarity: number }>>();
    for (const rel of existingRelations) {
      const map = relationsBySource.get(rel.sourceThreadId) ?? new Map();
      map.set(rel.targetThreadId, { id: rel.id, similarity: rel.similarity });
      relationsBySource.set(rel.sourceThreadId, map);
    }

    // Calculate similarities for all thread pairs in memory
    const toCreate: Array<{ sourceThreadId: string; targetThreadId: string; similarity: number }> = [];
    const toUpdate: Array<{ id: string; similarity: number }> = [];

    for (const thread of threads) {
      const threadDna = parseThreadDna(thread.threadDna);
      if (!threadDna) continue;

      for (const other of threads) {
        if (thread.id === other.id) continue;
        const otherDna = parseThreadDna(other.threadDna);
        if (!otherDna) continue;

        const similarity = calculateThreadSimilarity(threadDna, otherDna);
        if (similarity < SIMILARITY_THRESHOLD) continue;

        const existingRel = relationsBySource.get(thread.id)?.get(other.id);
        if (!existingRel) {
          toCreate.push({
            sourceThreadId: thread.id,
            targetThreadId: other.id,
            similarity,
          });
        } else if (existingRel.similarity !== similarity) {
          toUpdate.push({ id: existingRel.id, similarity });
        }
      }
    }

    // Batch create new relations
    if (toCreate.length > 0) {
      await prisma.threadRelation.createMany({ data: toCreate });
      stats.updated += toCreate.length;
    }

    // Batch update changed relations (process in chunks to avoid overwhelming DB)
    if (toUpdate.length > 0) {
      const BATCH = 50;
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const chunk = toUpdate.slice(i, i + BATCH);
        await Promise.all(
          chunk.map(u =>
            prisma.threadRelation.update({
              where: { id: u.id },
              data: { similarity: u.similarity },
            })
          )
        );
      }
      stats.updated += toUpdate.length;
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
