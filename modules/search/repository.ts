import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

export async function searchThreads(query: string, limit: number = 20, offset: number = 0) {
  try {
    const [threads, total] = await Promise.all([
      prisma.section.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { aiSummary: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              messages: true,
              members: true,
            },
          },
        },
        orderBy: [{ messageCount: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.section.count({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { aiSummary: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    const safeThreads = threads ?? [];

    return {
      threads: safeThreads,
      total,
      hasMore: offset + limit < total,
    };
  } catch (error) {
    logger.error('[searchThreads]', error);
    return {
      threads: [],
      total: 0,
      hasMore: false,
    };
  }
}

export async function searchMessages(
  query: string,
  threadId?: string,
  limit: number = 20,
  offset: number = 0
) {
  try {
    const where: any = {
      deletedAt: null,
      content: { contains: query, mode: 'insensitive' },
    };

    if (threadId) {
      where.sectionId = threadId;
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              avatarUrl: true,
            },
          },
          section: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.message.count({ where }),
    ]);

    const safeMessages = messages ?? [];

    return {
      messages: safeMessages,
      total,
      hasMore: offset + limit < total,
    };
  } catch (error) {
    logger.error('[searchMessages]', error);
    return {
      messages: [],
      total: 0,
      hasMore: false,
    };
  }
}

export async function searchUsers(query: string, limit: number = 20, offset: number = 0) {
  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          avatarUrl: true,
          bio: true,
          followerCount: true,
          followingCount: true,
          reputationPoints: true,
        },
        orderBy: [{ reputationPoints: 'desc' }, { followerCount: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.user.count({
        where: {
          status: 'ACTIVE',
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    const safeUsers = users ?? [];

    return {
      users: safeUsers,
      total,
      hasMore: offset + limit < total,
    };
  } catch (error) {
    logger.error('[searchUsers]', error);
    return {
      users: [],
      total: 0,
      hasMore: false,
    };
  }
}
