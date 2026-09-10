import { prisma } from '@/lib/infrastructure/prisma';
import { AppError } from '@/lib/utils/errors';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import type { Role } from '@prisma/client';

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

export async function getCollection(collectionId: string, userId: string) {
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
      },
    },
  });
}

export async function addToCollection(collectionId: string, threadId?: string, sessionId?: string, messageId?: string, metadata?: unknown) {
  if (!threadId && !sessionId && !messageId && !metadata) {
    throw new AppError('threadId or sessionId or messageId or metadata required', 'VALIDATION_ERROR', 400);
  }
  try {
    return await prisma.collectionItem.create({
      data: { collectionId, threadId: threadId ?? null, sessionId: sessionId ?? null, messageId: messageId ?? null, metadata: metadata as never },
    });
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === 'P2002') {
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

/**
 * Owned variant — verifies collection belongs to user and checks thread access.
 * KISS: simple sequential checks, no complex abstractions.
 */
export async function addToCollectionOwned(
  collectionId: string,
  userId: string,
  userRole: Role | string,
  threadId?: string,
  sessionId?: string,
  messageId?: string,
  metadata?: unknown
) {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true },
  });
  if (!collection) {
    throw new AppError('Collection not found', 'NOT_FOUND', 404);
  }

  if (threadId) {
    await requireThreadAccessOrThrow(threadId, userId, userRole as Role);
  }

  if (sessionId) {
    const session = await prisma.aiSearchSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!session) {
      throw new AppError('Search session not found', 'NOT_FOUND', 404);
    }
  }

  if (messageId) {
    const msg = await prisma.message.findFirst({ where: { id: messageId, deletedAt: null }, select: { id: true, threadId: true } });
    if (!msg) throw new AppError('Message not found', 'NOT_FOUND', 404);
    await requireThreadAccessOrThrow(msg.threadId, userId, userRole as Role);
  }

  return addToCollection(collectionId, threadId, sessionId, messageId, metadata);
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

export async function removeFromCollectionOwned(itemId: string, userId: string) {
  const item = await prisma.collectionItem.findUnique({
    where: { id: itemId },
    select: { id: true, collectionId: true, collection: { select: { userId: true } } },
  });
  if (!item) {
    throw new AppError('Item not found', 'NOT_FOUND', 404);
  }
  if (item.collection.userId !== userId) {
    throw new AppError('Forbidden', 'FORBIDDEN', 403);
  }
  return removeFromCollection({ id: item.id, collectionId: item.collectionId });
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
