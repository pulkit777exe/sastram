import { prisma } from "@/lib/infrastructure/prisma";

export async function bookmarkThread(userId: string, threadId: string) {
  // Check if already bookmarked
  const existing = await prisma.userBookmark.findUnique({
    where: {
      userId_threadId: {
        userId,
        threadId,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.userBookmark.create({
    data: {
      userId,
      threadId,
    },
  });
}

export async function unbookmarkThread(userId: string, threadId: string) {
  const bookmark = await prisma.userBookmark.findUnique({
    where: {
      userId_threadId: {
        userId,
        threadId,
      },
    },
  });

  if (!bookmark) {
    return null;
  }

  return prisma.userBookmark.delete({
    where: {
      id: bookmark.id,
    },
  });
}

export async function getUserBookmarks(
  userId: string,
  limit: number = 20,
  offset: number = 0
) {
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
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.userBookmark.count({
      where: { userId },
    }),
  ]);

  return {
    bookmarks: bookmarks.map((b) => b.thread),
    total,
    hasMore: offset + limit < total,
  };
}

export async function isBookmarked(userId: string, threadId: string): Promise<boolean> {
  const bookmark = await prisma.userBookmark.findUnique({
    where: {
      userId_threadId: {
        userId,
        threadId,
      },
    },
  });

  return !!bookmark;
}

