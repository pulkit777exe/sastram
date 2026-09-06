import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma } from '@prisma/client';
import { parseThreadDna, type ThreadDNA } from '@/lib/schemas/thread-dna';

const SIMILARITY_THRESHOLD = 0.7;
const MAX_RELATED_THREADS = 5;

const EXPERTISE_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];

export type RelatedThread = {
  id: string;
  name: string;
  slug: string;
  similarity: number;
  threadDna: ThreadDNA | null;
};

type RelationUpsert = {
  toCreate: Array<{ sourceThreadId: string; targetThreadId: string; similarity: number }>;
  toUpdate: Array<{ id: string; similarity: number }>;
};

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  if (union === 0) return 0;
  return intersection / union;
}

function expertiseSimilarity(level1: number, level2: number): number {
  if (level1 !== -1 && level2 !== -1) {
    return 1 - Math.abs(level1 - level2) / (EXPERTISE_LEVELS.length - 1);
  }
  return 0.5;
}

function calculateThreadSimilarity(dna1: ThreadDNA, dna2: ThreadDNA): number {
  if (!dna1 || !dna2) return 0;

  const topics1 = new Set(dna1.topics || []);
  const topics2 = new Set(dna2.topics || []);
  const topicSimilarity = jaccard(topics1, topics2);

  // Early termination: even with perfect questionType and expertise alignment,
  // the weighted result can't reach the 0.7 threshold when topic Jaccard is
  // below 0.3 (max possible = 0.3*0.5 + 1*0.3 + 1*0.2 = 0.65).
  if (topicSimilarity < 0.3) return 0;

  // A question-type mismatch is penalised but not fatal — the same topic asked
  // two different ways is still worth surfacing.
  const questionTypeSimilarity = dna1.questionType === dna2.questionType ? 1 : 0.3;

  const level1 = EXPERTISE_LEVELS.indexOf(dna1.expertiseLevel);
  const level2 = EXPERTISE_LEVELS.indexOf(dna2.expertiseLevel);
  const expertise = expertiseSimilarity(level1, level2);

  return topicSimilarity * 0.5 + questionTypeSimilarity * 0.3 + expertise * 0.2;
}

async function persistRelations({ toCreate, toUpdate }: RelationUpsert): Promise<void> {
  if (toCreate.length > 0) {
    await prisma.threadRelation.createMany({ data: toCreate });
  }

  // Chunked so a large recalculation doesn't fire hundreds of concurrent updates.
  const BATCH = 50;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    await Promise.all(
      toUpdate.slice(i, i + BATCH).map((u) =>
        prisma.threadRelation.update({
          where: { id: u.id },
          data: { similarity: u.similarity },
        })
      )
    );
  }
}

const IS_THREAD_NOT_DELETED = { deletedAt: null } as const;

function scoreRelatedThread(
  other: { id: string; name: string; slug: string; threadDna: unknown },
  baseDna: ThreadDNA
): RelatedThread | null {
  const otherDna = parseThreadDna(other.threadDna);
  if (!otherDna) return null;
  const similarity = calculateThreadSimilarity(baseDna, otherDna);
  if (similarity < SIMILARITY_THRESHOLD) return null;
  return { id: other.id, name: other.name, slug: other.slug, similarity, threadDna: otherDna };
}

function rankRelatedThreads(candidates: Array<{ id: string; name: string; slug: string; threadDna: unknown }>, baseDna: ThreadDNA): RelatedThread[] {
  const scored: RelatedThread[] = [];
  for (const c of candidates) {
    const s = scoreRelatedThread(c, baseDna);
    if (s) scored.push(s);
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, MAX_RELATED_THREADS);
}

function buildRelationUpsert(
  relatedThreads: RelatedThread[],
  existingByTarget: Map<string, { id: string; similarity: number }>,
  threadId: string
): RelationUpsert {
  const pending: RelationUpsert = { toCreate: [], toUpdate: [] };
  for (const related of relatedThreads) {
    const existing = existingByTarget.get(related.id);
    if (!existing) {
      pending.toCreate.push({ sourceThreadId: threadId, targetThreadId: related.id, similarity: related.similarity });
    } else if (existing.similarity !== related.similarity) {
      pending.toUpdate.push({ id: existing.id, similarity: related.similarity });
    }
  }
  return pending;
}

function collectRelationUpserts(
  parsed: Array<{ id: string; dna: ThreadDNA }>,
  relationsBySource: Map<string, Map<string, { id: string; similarity: number }>>
): RelationUpsert {
  const pending: RelationUpsert = { toCreate: [], toUpdate: [] };
  for (const thread of parsed) {
    for (const other of parsed) {
      if (thread.id === other.id) continue;
      const similarity = calculateThreadSimilarity(thread.dna, other.dna);
      if (similarity < SIMILARITY_THRESHOLD) continue;
      const existingRel = relationsBySource.get(thread.id)?.get(other.id);
      if (!existingRel) {
        pending.toCreate.push({ sourceThreadId: thread.id, targetThreadId: other.id, similarity });
      } else if (existingRel.similarity !== similarity) {
        pending.toUpdate.push({ id: existingRel.id, similarity });
      }
    }
  }
  return pending;
}

export async function findRelatedThreads(threadId: string): Promise<RelatedThread[]> {
  try {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, ...IS_THREAD_NOT_DELETED },
      select: { threadDna: true },
    });
    const parsedDna = parseThreadDna(thread?.threadDna);
    if (!parsedDna) return [];

    const otherThreads = await prisma.thread.findMany({
      where: { id: { not: threadId }, threadDna: { not: Prisma.DbNull }, ...IS_THREAD_NOT_DELETED },
      select: { id: true, name: true, slug: true, threadDna: true },
      take: 1000,
    });

    const relatedThreads = rankRelatedThreads(otherThreads, parsedDna);

    const relatedIds = relatedThreads.map((r) => r.id);
    const existingRelations = await prisma.threadRelation.findMany({
      where: { sourceThreadId: threadId, targetThreadId: { in: relatedIds } },
      select: { id: true, targetThreadId: true, similarity: true },
    });
    const existingByTarget = new Map(existingRelations.map((r) => [r.targetThreadId, r]));
    const pending = buildRelationUpsert(relatedThreads, existingByTarget, threadId);

    await persistRelations(pending);
    return relatedThreads;
  } catch (error) {
    logger.error(`Failed to find related threads for ${threadId}:`, error);
    return [];
  }
}

export async function getRelatedThreads(threadId: string): Promise<RelatedThread[]> {
  const relations = await prisma.threadRelation.findMany({
    where: { sourceThreadId: threadId },
    include: {
      target: { select: { id: true, name: true, slug: true, threadDna: true } },
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
  }));
}

export async function updateAllThreadRelations(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  const stats = { processed: 0, updated: 0, errors: 0 };

  try {
    // Only threads touched in the last 30 days — older ones aren't worth recomputing.
    const threads = await prisma.thread.findMany({
      where: {
        threadDna: { not: Prisma.DbNull },
        updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        deletedAt: null,
      },
      select: { id: true, threadDna: true },
      take: 500,
    });

    stats.processed = threads.length;

    const existingRelations = await prisma.threadRelation.findMany({
      where: { sourceThreadId: { in: threads.map((t) => t.id) } },
      select: { id: true, sourceThreadId: true, targetThreadId: true, similarity: true },
    });

    const relationsBySource = new Map<string, Map<string, { id: string; similarity: number }>>();
    for (const rel of existingRelations) {
      const map = relationsBySource.get(rel.sourceThreadId) ?? new Map();
      map.set(rel.targetThreadId, { id: rel.id, similarity: rel.similarity });
      relationsBySource.set(rel.sourceThreadId, map);
    }

    // Parse each DNA once; the comparison below is O(n^2) over the batch.
    const parsed = threads
      .map((t) => ({ id: t.id, dna: parseThreadDna(t.threadDna) }))
      .filter((t): t is { id: string; dna: ThreadDNA } => t.dna !== null);

    const pending = collectRelationUpserts(parsed, relationsBySource);

    await persistRelations(pending);
    stats.updated = pending.toCreate.length + pending.toUpdate.length;
  } catch (error) {
    logger.error('Failed to update all thread relations:', error);
    stats.errors++;
  }

  return stats;
}
