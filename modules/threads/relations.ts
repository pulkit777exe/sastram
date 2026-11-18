import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import type { Role } from '@prisma/client';
import { parseThreadDna, type ThreadDNA } from '@/lib/schemas/thread-dna';
import { visibilityFilter } from '@/lib/thread-access';
import { updateThreadRelationsFromEmbeddings, upsertThreadRelationsFromEmbeddings } from '@/lib/services/embeddings';

const MAX_RELATED_THREADS = 5;

export type RelatedThread = {
  id: string;
  name: string;
  slug: string;
  similarity: number;
  threadDna: ThreadDNA | null;
};

export async function getRelatedThreads(
  threadId: string,
  viewerId?: string,
  viewerRole?: Role | null
): Promise<RelatedThread[]> {
  const relations = await prisma.threadRelation.findMany({
    where: { sourceThreadId: threadId },
    include: {
      target: { select: { id: true, name: true, slug: true, threadDna: true } },
    },
    orderBy: { similarity: 'desc' },
    take: MAX_RELATED_THREADS,
  });
  if (relations.length === 0) return [];

  // Relations are computed globally; the target may be private even though the
  // source is readable. Re-check every target against the viewer's visibility.
  const filter = await visibilityFilter(viewerId, viewerRole);
  const visibleTargets = await prisma.thread.findMany({
    where: {
      id: { in: relations.map((relation) => relation.target.id) },
      deletedAt: null,
      ...filter,
    },
    select: { id: true },
  });
  const visibleIds = new Set(visibleTargets.map((target) => target.id));

  return relations
    .filter((relation) => visibleIds.has(relation.target.id))
    .map((relation) => ({
      id: relation.target.id,
      name: relation.target.name,
      slug: relation.target.slug,
      similarity: relation.similarity,
      threadDna: parseThreadDna(relation.target.threadDna),
    }));
}

/**
 * Derive ThreadRelation rows from real embeddings (kNN cosine similarity).
 * If embeddings are not yet available, this becomes a no-op until backfill runs.
 */
export async function updateAllThreadRelations(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  try {
    return await updateThreadRelationsFromEmbeddings(500);
  } catch (error) {
    logger.error('Failed to update embedding-based thread relations:', error);
    return { processed: 0, updated: 0, errors: 1 };
  }
}

export async function updateThreadRelationsForThread(threadId: string): Promise<number> {
  try {
    return await upsertThreadRelationsFromEmbeddings(threadId, 5);
  } catch (error) {
    logger.error('Failed to update thread relations from embeddings:', { threadId, error });
    return 0;
  }
}
