import { prisma } from '@/lib/infrastructure/prisma';

export async function createCollection(userId: string, title: string) {
  return prisma.collection.create({ data: { userId, title } });
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
          session: { select: { id: true, query: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function addToCollection(collectionId: string, threadId?: string, sessionId?: string) {
  if (!threadId && !sessionId) throw new Error('threadId or sessionId required');
  return prisma.collectionItem.create({
    data: { collectionId, threadId: threadId ?? null, sessionId: sessionId ?? null },
  });
}

export async function removeFromCollection(itemId: string) {
  return prisma.collectionItem.delete({ where: { id: itemId } });
}

export async function deleteCollection(collectionId: string, userId: string) {
  return prisma.collection.delete({ where: { id: collectionId, userId } } as never);
}
