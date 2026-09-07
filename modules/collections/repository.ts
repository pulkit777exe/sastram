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
          thread: { select: { id: true, name: true, slug: true } },
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
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function addToCollection(collectionId: string, threadId?: string, sessionId?: string) {
  if (!threadId && !sessionId) {
    throw new AppError('threadId or sessionId required', 'VALIDATION_ERROR', 400);
  }
  try {
    return await prisma.collectionItem.create({
      data: { collectionId, threadId: threadId ?? null, sessionId: sessionId ?? null },
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
  sessionId?: string
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

  return addToCollection(collectionId, threadId, sessionId);
}

export async function removeFromCollection(itemId: string) {
  try {
    return await prisma.collectionItem.delete({ where: { id: itemId } });
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
    include: { collection: { select: { userId: true } } },
  });
  if (!item) {
    throw new AppError('Item not found', 'NOT_FOUND', 404);
  }
  if (item.collection.userId !== userId) {
    throw new AppError('Forbidden', 'FORBIDDEN', 403);
  }
  return removeFromCollection(itemId);
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
