import { prisma } from '@/lib/infrastructure/prisma';
import { AppError } from '@/lib/utils/errors';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import type { Role } from '@prisma/client';

export interface AddRefs {
  threadId?: string;
  sessionId?: string;
  messageId?: string;
}

/**
 * Single policy seam for collections authorization (D2).
 *
 * - `assertCollectionOwner`: the collection exists and belongs to the user.
 * - `assertCanAddRef`: thread / search-session / message reference checks,
 *   mirroring the historical owned-add logic exactly.
 * - `assertItemInCollection`: one read mapping the items-DELETE IDOR cases to
 *   404 (missing) / 403 (other owner's collection) / 400 (wrong collection).
 */
export interface CollectionPolicy {
  assertCollectionOwner(collectionId: string, userId: string): Promise<{ id: string }>;
  assertCanAddRef(refs: AddRefs, userId: string, userRole: Role | string): Promise<void>;
  assertItemInCollection(
    itemId: string,
    collectionId: string,
    userId: string,
  ): Promise<{ id: string; collectionId: string }>;
}

export const prismaCollectionPolicy: CollectionPolicy = {
  async assertCollectionOwner(collectionId, userId) {
    const collection = await prisma.collection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!collection) {
      throw new AppError('Collection not found', 'NOT_FOUND', 404);
    }
    return collection;
  },

  async assertCanAddRef(refs, userId, userRole) {
    const { threadId, sessionId, messageId } = refs;

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
      const msg = await prisma.message.findFirst({
        where: { id: messageId, deletedAt: null },
        select: { id: true, threadId: true },
      });
      if (!msg) throw new AppError('Message not found', 'NOT_FOUND', 404);
      await requireThreadAccessOrThrow(msg.threadId, userId, userRole as Role);
    }
  },

  async assertItemInCollection(itemId, collectionId, userId) {
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
    if (item.collectionId !== collectionId) {
      throw new AppError('Item does not belong to this collection', 'VALIDATION_ERROR', 400);
    }
    return { id: item.id, collectionId: item.collectionId };
  },
};
