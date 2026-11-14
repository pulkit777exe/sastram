import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import {
  THREAD_EMBEDDING_CAP,
  KNOWLEDGE_EMBEDDING_CAP,
  embedText,
  isEmbeddingConfigured,
  threadEmbeddingSource,
  knowledgePageEmbeddingSource,
  toVectorLiteral,
} from '@/lib/ai/embeddings';

export type EmbeddingTarget = 'threads' | 'knowledge_pages' | 'all';

async function countEmbeddedThreads(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*)::int AS count FROM "threads" WHERE "embedding" IS NOT NULL AND "deletedAt" IS NULL
  `;
  return Number(rows[0]?.count ?? 0);
}

async function countEmbeddedKnowledgePages(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*)::int AS count FROM "knowledge_pages" WHERE "embedding" IS NOT NULL
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function getEmbeddingCounts() {
  const [threads, knowledgePages] = await Promise.all([countEmbeddedThreads(), countEmbeddedKnowledgePages()]);
  return { threads, knowledgePages, total: threads + knowledgePages };
}

export async function embedThreadById(threadId: string): Promise<boolean> {
  if (!isEmbeddingConfigured()) return false;
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { id: true, name: true, description: true, aiSummary: true, deletedAt: true },
  });
  if (!thread || thread.deletedAt) return false;
  const source = threadEmbeddingSource(thread.name, thread.aiSummary, thread.description);
  if (!source) return false;
  const result = await embedText(source);
  if (!result) return false;
  const vec = toVectorLiteral(result.embedding);
  await prisma.$executeRaw`
    UPDATE "threads"
    SET "embedding" = ${vec}::vector,
        "embeddingModel" = ${result.model},
        "updatedAt" = "updatedAt"
    WHERE "id" = ${thread.id}
  `;
  return true;
}

export async function embedKnowledgePageById(pageId: string): Promise<boolean> {
  if (!isEmbeddingConfigured()) return false;
  const page = await prisma.knowledgePage.findUnique({
    where: { id: pageId },
    select: { id: true, synthesizedContent: true, thread: { select: { name: true } } },
  });
  if (!page) return false;
  const source = knowledgePageEmbeddingSource(page.thread.name, page.synthesizedContent);
  if (!source) return false;
  const result = await embedText(source);
  if (!result) return false;
  const vec = toVectorLiteral(result.embedding);
  await prisma.$executeRaw`
    UPDATE "knowledge_pages"
    SET "embedding" = ${vec}::vector,
        "embeddingModel" = ${result.model},
        "updatedAt" = "updatedAt"
    WHERE "id" = ${page.id}
  `;
  return true;
}

export async function backfillThreadEmbeddings(limit: number): Promise<{ processed: number; embedded: number; skippedCap: boolean }> {
  if (!isEmbeddingConfigured() || limit <= 0) return { processed: 0, embedded: 0, skippedCap: false };
  const current = await countEmbeddedThreads();
  const remainingCap = Math.max(0, THREAD_EMBEDDING_CAP - current);
  if (remainingCap <= 0) return { processed: 0, embedded: 0, skippedCap: true };
  const take = Math.min(limit, remainingCap);

  const candidates = await prisma.$queryRaw<Array<{ id: string; name: string; description: string | null; aiSummary: string | null }>>`
    SELECT "id", "name", "description", "aiSummary"
    FROM "threads"
    WHERE "deletedAt" IS NULL
      AND "embedding" IS NULL
      AND ("aiSummary" IS NOT NULL OR "description" IS NOT NULL OR length(trim("name")) > 0)
    ORDER BY "updatedAt" DESC
    LIMIT ${take}
  `;

  let embedded = 0;
  for (const t of candidates) {
    const source = threadEmbeddingSource(t.name, t.aiSummary, t.description);
    if (!source) continue;
    const result = await embedText(source);
    if (!result) continue;
    const vec = toVectorLiteral(result.embedding);
    await prisma.$executeRaw`
      UPDATE "threads"
      SET "embedding" = ${vec}::vector, "embeddingModel" = ${result.model}
      WHERE "id" = ${t.id} AND "embedding" IS NULL
    `;
    embedded++;
  }
  return { processed: candidates.length, embedded, skippedCap: false };
}

export async function backfillKnowledgePageEmbeddings(limit: number): Promise<{ processed: number; embedded: number; skippedCap: boolean }> {
  if (!isEmbeddingConfigured() || limit <= 0) return { processed: 0, embedded: 0, skippedCap: false };
  const current = await countEmbeddedKnowledgePages();
  const remainingCap = Math.max(0, KNOWLEDGE_EMBEDDING_CAP - current);
  if (remainingCap <= 0) return { processed: 0, embedded: 0, skippedCap: true };
  const take = Math.min(limit, remainingCap);

  const candidates = await prisma.$queryRaw<Array<{ id: string; synthesizedContent: string; name: string }>>`
    SELECT kp."id", kp."synthesizedContent", t."name"
    FROM "knowledge_pages" kp
    JOIN "threads" t ON t."id" = kp."threadId"
    WHERE kp."embedding" IS NULL
      AND t."deletedAt" IS NULL
    ORDER BY kp."updatedAt" DESC
    LIMIT ${take}
  `;

  let embedded = 0;
  for (const p of candidates) {
    const source = knowledgePageEmbeddingSource(p.name, p.synthesizedContent);
    if (!source) continue;
    const result = await embedText(source);
    if (!result) continue;
    const vec = toVectorLiteral(result.embedding);
    await prisma.$executeRaw`
      UPDATE "knowledge_pages"
      SET "embedding" = ${vec}::vector, "embeddingModel" = ${result.model}
      WHERE "id" = ${p.id} AND "embedding" IS NULL
    `;
    embedded++;
  }
  return { processed: candidates.length, embedded, skippedCap: false };
}

export async function runEmbeddingBackfill(target: EmbeddingTarget, limit: number) {
  const summary = { threads: { processed: 0, embedded: 0, skippedCap: false }, knowledgePages: { processed: 0, embedded: 0, skippedCap: false } };
  if (target === 'threads' || target === 'all') {
    summary.threads = await backfillThreadEmbeddings(limit);
  }
  if (target === 'knowledge_pages' || target === 'all') {
    summary.knowledgePages = await backfillKnowledgePageEmbeddings(limit);
  }
  logger.info('[embeddings] backfill summary', summary as unknown as Record<string, unknown>);
  return summary;
}

export async function upsertThreadRelationsFromEmbeddings(threadId: string, k = 5): Promise<number> {
  // kNN using cosine distance operator <=> (lower is closer). Similarity = 1 - distance.
  // Only consider threads with embeddings and not deleted.
  const rows = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
    WITH src AS (
      SELECT "embedding" FROM "threads" WHERE "id" = ${threadId} AND "embedding" IS NOT NULL
    )
    SELECT t."id", (1 - (t."embedding" <=> src."embedding"))::float AS similarity
    FROM "threads" t, src
    WHERE t."id" <> ${threadId}
      AND t."deletedAt" IS NULL
      AND t."embedding" IS NOT NULL
      AND (1 - (t."embedding" <=> src."embedding")) >= 0.7
    ORDER BY t."embedding" <=> src."embedding" ASC
    LIMIT ${k}
  `;

  // Replace relations for this source with embedding-derived ones (keeps graph consistent with embeddings).
  await prisma.$transaction([
    prisma.threadRelation.deleteMany({ where: { sourceThreadId: threadId } }),
    ...(rows.length
      ? [prisma.threadRelation.createMany({ data: rows.map((r) => ({ sourceThreadId: threadId, targetThreadId: r.id, similarity: r.similarity })) })]
      : []),
  ]);
  return rows.length;
}

export async function updateThreadRelationsFromEmbeddings(limitThreads = 200): Promise<{ processed: number; updated: number; errors: number }> {
  const stats = { processed: 0, updated: 0, errors: 0 };
  try {
    const threads = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "threads"
      WHERE "embedding" IS NOT NULL AND "deletedAt" IS NULL
      ORDER BY "updatedAt" DESC
      LIMIT ${limitThreads}
    `;
    stats.processed = threads.length;
    for (const t of threads) {
      try {
        stats.updated += await upsertThreadRelationsFromEmbeddings(t.id, 5);
      } catch (e) {
        logger.warn('[embeddings] relation upsert failed', { threadId: t.id, error: e });
        stats.errors++;
      }
    }
  } catch (error) {
    logger.error('[embeddings] updateThreadRelationsFromEmbeddings failed', error);
    stats.errors++;
  }
  return stats;
}
