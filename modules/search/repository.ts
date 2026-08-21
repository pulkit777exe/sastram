import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { visibilityFilter } from '@/lib/thread-access';
import { Prisma, Role } from '@prisma/client';

const insensitive = 'insensitive' as const;

export async function searchThreads(
  query: string,
  limit: number = 20,
  offset: number = 0,
  threadIds?: string[],
  viewerUserId?: string,
  viewerRole?: Role | null
) {
  try {
    const where: Prisma.ThreadWhereInput = {
      AND: [
        {
          OR: [
            { name: { contains: query, mode: insensitive } },
            { description: { contains: query, mode: insensitive } },
            { aiSummary: { contains: query, mode: insensitive } },
          ],
        },
        await visibilityFilter(viewerUserId, viewerRole),
      ],
      deletedAt: null,
      ...(threadIds?.length ? { id: { in: threadIds } } : {}),
    };

    const [threads, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true, image: true } },
          _count: { select: { messages: true } },
        },
        orderBy: [{ messageCount: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.thread.count({ where }),
    ]);

    return { threads, total, hasMore: offset + limit < total };
  } catch (error) {
    logger.error('[searchThreads]', error);
    return { threads: [], total: 0, hasMore: false };
  }
}

export async function searchMessages(
  query: string,
  threadId?: string,
  limit: number = 20,
  offset: number = 0,
  viewerUserId?: string,
  viewerRole?: Role | null
) {
  try {
    const where: Prisma.MessageWhereInput = {
      deletedAt: null,
      content: { contains: query, mode: insensitive },
      // Exclude messages from soft-deleted threads — the thread is invisible everywhere else.
      // The visibility filter keeps private/restricted thread content out of results.
      thread: { deletedAt: null, AND: [await visibilityFilter(viewerUserId, viewerRole)] },
      ...(threadId ? { threadId } : {}),
    };

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, name: true, image: true } },
          thread: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.message.count({ where }),
    ]);

    return { messages, total, hasMore: offset + limit < total };
  } catch (error) {
    logger.error('[searchMessages]', error);
    return { messages: [], total: 0, hasMore: false };
  }
}

export async function searchUsers(query: string, limit: number = 20, offset: number = 0) {
  try {
    const where: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      deletedAt: null,
      name: { contains: query, mode: insensitive },
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          image: true,
          bio: true,
          followerCount: true,
          followingCount: true,
        },
        orderBy: [{ followerCount: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, hasMore: offset + limit < total };
  } catch (error) {
    logger.error('[searchUsers]', error);
    return { users: [], total: 0, hasMore: false };
  }
}
