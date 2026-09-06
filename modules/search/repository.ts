import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { visibilityFilter } from '@/lib/thread-access';
import { Prisma, Role } from '@prisma/client';

const insensitive = 'insensitive' as const;

const IS_NOT_DELETED_THREAD: Prisma.ThreadWhereInput = { deletedAt: null };

async function buildThreadSearchWhere(
  query: string,
  threadIds: string[] | undefined,
  viewerUserId: string | undefined,
  viewerRole: Role | null | undefined
): Promise<Prisma.ThreadWhereInput> {
  const where: Prisma.ThreadWhereInput = {
    ...IS_NOT_DELETED_THREAD,
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
  };
  if (threadIds && threadIds.length > 0) where.id = { in: threadIds };
  return where;
}

export async function searchThreads(
  query: string,
  limit: number = 20,
  offset: number = 0,
  threadIds?: string[],
  viewerUserId?: string,
  viewerRole?: Role | null
) {
  try {
    const where = await buildThreadSearchWhere(query, threadIds, viewerUserId, viewerRole);

    const threadsPromise = prisma.thread.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, image: true } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ messageCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    });
    const totalPromise = prisma.thread.count({ where });
    const [threads, total] = await Promise.all([threadsPromise, totalPromise]);

    return { threads, total, hasMore: offset + limit < total };
  } catch (error) {
    logger.error('[searchThreads]', error);
    return { threads: [], total: 0, hasMore: false };
  }
}

const IS_NOT_DELETED_MESSAGE: Prisma.MessageWhereInput = { deletedAt: null };

async function buildMessageSearchWhere(
  query: string,
  threadId: string | undefined,
  viewerUserId: string | undefined,
  viewerRole: Role | null | undefined
): Promise<Prisma.MessageWhereInput> {
  const where: Prisma.MessageWhereInput = {
    ...IS_NOT_DELETED_MESSAGE,
    content: { contains: query, mode: insensitive },
    thread: { deletedAt: null, AND: [await visibilityFilter(viewerUserId, viewerRole)] },
  };
  if (threadId) where.threadId = threadId;
  return where;
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
    const where = await buildMessageSearchWhere(query, threadId, viewerUserId, viewerRole);

    const messagesPromise = prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, image: true } },
        thread: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    const totalPromise = prisma.message.count({ where });
    const [messages, total] = await Promise.all([messagesPromise, totalPromise]);

    return { messages, total, hasMore: offset + limit < total };
  } catch (error) {
    logger.error('[searchMessages]', error);
    return { messages: [], total: 0, hasMore: false };
  }
}

const IS_ACTIVE_NOT_DELETED_USER: Prisma.UserWhereInput = { status: 'ACTIVE', deletedAt: null };

export async function searchUsers(query: string, limit: number = 20, offset: number = 0) {
  try {
    const where: Prisma.UserWhereInput = {
      ...IS_ACTIVE_NOT_DELETED_USER,
      name: { contains: query, mode: insensitive },
    };

    const usersPromise = prisma.user.findMany({
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
    });
    const totalPromise = prisma.user.count({ where });
    const [users, total] = await Promise.all([usersPromise, totalPromise]);

    return { users, total, hasMore: offset + limit < total };
  } catch (error) {
    logger.error('[searchUsers]', error);
    return { users: [], total: 0, hasMore: false };
  }
}
