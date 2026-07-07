import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore } from '@/lib/db/pagination';

export async function bookmarkThread(userId: string, threadId: string) {
  return prisma.userBookmark.upsert({
    where: {
      userId_threadId: { userId, threadId },
    },
    update: {},
    create: { userId, threadId },
  });
}

export async function unbookmarkThread(userId: string, threadId: string) {
  try {
    await prisma.userBookmark.delete({
      where: {
        userId_threadId: { userId, threadId },
      },
    });
    return { id: '' };
  } catch (err) {
    logger.error('[bookmarks] unbookmarkThread failed', { userId, threadId, error: err });
    return null;
  }
}

export const getUserBookmarks = cache(async (userId: string, limit: number = 20, offset: number = 0) => {
  try {
    const [bookmarks, total] = await Promise.all([
      prisma.userBookmark.findMany({
        where: { userId },
        include: {
          thread: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              messageCount: true,
              memberCount: true,
              createdAt: true,
              updatedAt: true,
              creator: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userBookmark.count({
        where: { userId },
      }),
    ]);

    return {
      bookmarks: (bookmarks ?? []).map((bookmark) => bookmark.thread),
      total,
      hasMore: computeHasMore(offset, limit, total),
    };
  } catch (error) {
    logger.error('[getUserBookmarks]', error);
    return {
      bookmarks: [],
      total: 0,
      hasMore: false,
    };
  }
});

export const isBookmarked = cache(async (userId: string, threadId: string): Promise<boolean> => {
  const bookmark = await prisma.userBookmark.findUnique({
    where: {
      userId_threadId: {
        userId,
        threadId,
      },
    },
  });

  return !!bookmark;
});
