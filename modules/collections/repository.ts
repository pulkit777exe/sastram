import { prisma } from '@/lib/infrastructure/prisma';
import { AppError } from '@/lib/utils/errors';
import { Prisma } from '@prisma/client';
import { assertStrictMetadata, stableStringify } from './metadata';
import { metadataHash } from './metadata-hash';
import type { SavePayload } from './schemas';

export const MAX_COLLECTION_METADATA_BYTES = 100_000;

export async function createCollection(userId: string, title: string) {
  try {
    return await prisma.collection.create({ data: { userId, title } });
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === 'P2003') {
      throw new AppError('User not found', 'NOT_FOUND', 404);
    }
    throw error;
  }
}

export async function getUserCollections(userId: string) {
  return prisma.collection.findMany({
    where: { userId },
    include: { _count: { select: { items: true } } },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getUserCollectionsLight(userId: string) {
  return prisma.collection.findMany({
    where: { userId },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getCollection(collectionId: string, userId: string, opts?: { take?: number; skip?: number }) {
  return prisma.collection.findFirst({
    where: { id: collectionId, userId },
    include: {
      items: {
        include: {
          thread: { select: { id: true, name: true, slug: true, aiSummary: true } },
          session: {
            select: {
              id: true,
              query: true,
              title: true,
              results: {
                select: { synthesis: true, citations: true, sources: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          message: {
            select: { id: true, content: true, threadId: true, isAiResponse: true, createdAt: true, thread: { select: { id: true, name: true, slug: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        ...(opts?.take ? { take: opts.take } : {}),
        ...(opts?.skip ? { skip: opts.skip } : {}),
      },
    },
  });
}

export async function addToCollection(collectionId: string, threadId?: string, sessionId?: string, messageId?: string, metadata?: unknown) {
  if (!threadId && !sessionId && !messageId && !metadata) {
    throw new AppError('threadId or sessionId or messageId or metadata required', 'VALIDATION_ERROR', 400);
  }
  if (metadata !== undefined) {
    let size = 0;
    try {
      size = JSON.stringify(metadata).length;
    } catch {
      throw new AppError('Invalid metadata', 'VALIDATION_ERROR', 400);
    }
    if (size > MAX_COLLECTION_METADATA_BYTES) {
      throw new AppError('Metadata too large', 'VALIDATION_ERROR', 400);
    }
    // ADR-0001 strict: a metadata object carrying a string `type` must be one
    // of graph | canvas | summary | ai_synthesis.
    assertStrictMetadata(metadata);
  }
  // Dual-written content hash: indexed dedupe key for metadata-only saves.
  const hash = metadata !== undefined ? metadataHash(metadata) : null;
  // Metadata-only saves have no FK to dedupe on — enforce exact-metadata uniqueness
  // so the 409 conflict path (and saved-checkmark prefetch) stay honest for
  // graph/canvas/summary/ai_synthesis snapshots. Hash-first (indexed unique),
  // Json-equals fallback for pre-backfill rows with a NULL hash.
  if (metadata !== undefined && !threadId && !sessionId && !messageId) {
    const existing = await prisma.collectionItem.findFirst({
      where: {
        collectionId,
        OR: [{ metadataHash: hash as string }, { metadata: { equals: metadata as Prisma.InputJsonValue } }],
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError('Already saved to this collection', 'CONFLICT', 409);
    }
  }
  try {
    return await prisma.collectionItem.create({
      data: {
        collectionId,
        threadId: threadId ?? null,
        sessionId: sessionId ?? null,
        messageId: messageId ?? null,
        metadata: metadata as never,
        metadataHash: hash,
      },
    });
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === 'P2002') {
      // Covers the thread/session/message uniques and the new
      // (collectionId, metadataHash) unique.
      throw new AppError('Already saved to this collection', 'CONFLICT', 409);
    }
    if (err?.code === 'P2003') {
      throw new AppError('Collection, thread, or search session not found', 'NOT_FOUND', 404);
    }
    if (err?.code === 'P2025') {
      throw new AppError('Related record not found', 'NOT_FOUND', 404);
    }
    throw error;
  }
}

export interface BulkAddResult {
  saved: number;
  skipped: SavePayload[];
  failed: never[];
}

function isMetadataOnly(item: SavePayload): boolean {
  return !item.threadId && !item.sessionId && !item.messageId;
}

/**
 * Bulk insert with an all-or-nothing contract (ADR-0001): duplicates skip
 * (returned in `skipped`), any other failure throws and rolls back the whole
 * batch (`failed` is always empty on success — failure surfaces as a thrown
 * error, never a partial response).
 *
 * Collections-first order: input order wins, first occurrence claims each
 * ref/hash. Writes go through a single `$transaction` (`createMany` with
 * `skipDuplicates` absorbs raced duplicates; every other error aborts).
 */
export async function addManyToCollection(collectionId: string, items: SavePayload[]): Promise<BulkAddResult> {
  for (const item of items) {
    if (item.metadata !== undefined) assertStrictMetadata(item.metadata);
  }

  const threadIds = [...new Set(items.map((i) => i.threadId).filter((v): v is string => typeof v === 'string'))];
  const sessionIds = [...new Set(items.map((i) => i.sessionId).filter((v): v is string => typeof v === 'string'))];
  const messageIds = [...new Set(items.map((i) => i.messageId).filter((v): v is string => typeof v === 'string'))];
  const needsMetaPrefetch = items.some((i) => isMetadataOnly(i) && i.metadata !== undefined);

  const or: Prisma.CollectionItemWhereInput[] = [];
  if (threadIds.length > 0) or.push({ threadId: { in: threadIds } });
  if (sessionIds.length > 0) or.push({ sessionId: { in: sessionIds } });
  if (messageIds.length > 0) or.push({ messageId: { in: messageIds } });

  type RefRow = { threadId: string | null; sessionId: string | null; messageId: string | null };
  type MetaRow = { metadataHash: string | null; metadata: Prisma.JsonValue | null };
  const [refRows, metaRows]: [RefRow[], MetaRow[]] = await Promise.all([
    or.length > 0
      ? prisma.collectionItem.findMany({
          where: { collectionId, OR: or },
          select: { threadId: true, sessionId: true, messageId: true },
        })
      : Promise.resolve([] as RefRow[]),
    needsMetaPrefetch
      ? prisma.collectionItem.findMany({
          where: { collectionId, threadId: null, sessionId: null, messageId: null },
          select: { metadataHash: true, metadata: true },
        })
      : Promise.resolve([] as MetaRow[]),
  ]);

  const takenThreads = new Set(refRows.map((r) => r.threadId).filter((v): v is string => typeof v === 'string'));
  const takenSessions = new Set(refRows.map((r) => r.sessionId).filter((v): v is string => typeof v === 'string'));
  const takenMessages = new Set(refRows.map((r) => r.messageId).filter((v): v is string => typeof v === 'string'));
  const takenHashes = new Set(metaRows.map((r) => r.metadataHash).filter((v): v is string => typeof v === 'string'));
  const legacyMetas = metaRows.map((r) => r.metadata);

  const skipped: SavePayload[] = [];
  const fresh: { item: SavePayload; hash: string | null }[] = [];

  for (const item of items) {
    const hash = item.metadata !== undefined ? metadataHash(item.metadata) : null;
    let duplicate = false;
    if (item.threadId && takenThreads.has(item.threadId)) duplicate = true;
    if (!duplicate && item.sessionId && takenSessions.has(item.sessionId)) duplicate = true;
    if (!duplicate && item.messageId && takenMessages.has(item.messageId)) duplicate = true;
    if (!duplicate && isMetadataOnly(item) && hash) {
      if (takenHashes.has(hash)) {
        duplicate = true;
      } else {
        // Json-equals fallback for pre-backfill rows with a NULL hash.
        const encoded = stableStringify(item.metadata);
        if (legacyMetas.some((m) => m !== null && m !== undefined && stableStringify(m) === encoded)) duplicate = true;
      }
    }
    if (duplicate) {
      skipped.push(item);
      continue;
    }
    if (item.threadId) takenThreads.add(item.threadId);
    if (item.sessionId) takenSessions.add(item.sessionId);
    if (item.messageId) takenMessages.add(item.messageId);
    if (hash) {
      takenHashes.add(hash);
      // Claim the canonical encoding too: the (collectionId, metadataHash)
      // unique covers every row carrying metadata, including ref+metadata
      // combos, so a later identical-metadata payload must also skip.
      if (item.metadata !== undefined) legacyMetas.push(item.metadata as Prisma.JsonValue);
    }
    fresh.push({ item, hash });
  }

  let saved = 0;
  if (fresh.length > 0) {
    const [result] = await prisma.$transaction([
      prisma.collectionItem.createMany({
        data: fresh.map(({ item, hash }) => ({
          collectionId,
          threadId: item.threadId ?? null,
          sessionId: item.sessionId ?? null,
          messageId: item.messageId ?? null,
          metadata: item.metadata === undefined ? Prisma.DbNull : (item.metadata as Prisma.InputJsonValue),
          metadataHash: hash,
        })),
        skipDuplicates: true,
      }),
    ]);
    saved = result.count;
  }

  return { saved, skipped, failed: [] };
}

export async function removeFromCollection(where: { id: string; collectionId: string }) {
  try {
    return await prisma.collectionItem.delete({ where });
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === 'P2025') {
      throw new AppError('Item not found', 'NOT_FOUND', 404);
    }
    if (err?.code === 'P2003') {
      throw new AppError('Related record not found', 'NOT_FOUND', 404);
    }
    throw error;
  }
}

export async function deleteCollection(collectionId: string, userId: string) {
  const existing = await prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError('Collection not found', 'NOT_FOUND', 404);
  }
  try {
    return await prisma.collection.delete({ where: { id: collectionId } });
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === 'P2025') {
      throw new AppError('Collection not found', 'NOT_FOUND', 404);
    }
    throw error;
  }
}
