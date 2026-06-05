import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore, emptyPagination } from '@/lib/db/pagination';

export interface SearchThreadResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  aiSummary: string | null;
  messageCount: number;
  memberCount: number;
}

export interface SearchMessageResult {
  id: string;
  content: string;
  threadId: string;
  senderId: string;
  createdAt: Date;
  parentId: string | null;
  depth: number;
  isAiResponse: boolean;
  likeCount: number;
  replyCount: number;
  sender: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  thread: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface SearchUserResult {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  reputationPoints: number;
}

export const searchThreads = cache(async (query: string, limit: number = 20, offset: number = 0, threadIds?: string[]): Promise<{ threads: SearchThreadResult[]; total: number; hasMore: boolean }> => {
  try {
    const sanitized = query.replace(/[^\w\s]/g, '').trim();
    if (!sanitized) {
      return { threads: [], total: 0, hasMore: false };
    }

    const threadFilter = threadIds && threadIds.length > 0
      ? prisma.$queryRaw`AND id = ANY(${threadIds}::text[])`
      : prisma.$queryRaw``;

    const [threads, total] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, name, slug, description, "aiSummary" as "aiSummary",
               "createdAt", "updatedAt", "createdBy",
               "messageCount", "memberCount",
                 ts_rank("fts_vector", plainto_tsquery('english', ${sanitized})) AS rank
        FROM "threads"
        WHERE "fts_vector" @@ plainto_tsquery('english', ${sanitized})
          ${threadFilter}
        ORDER BY rank DESC, "messageCount" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw`
        SELECT count(*)::int AS total
        FROM "threads"
        WHERE "fts_vector" @@ plainto_tsquery('english', ${sanitized})
          ${threadFilter}
      `,
    ]);

    const rows = threads as Array<Record<string, unknown>>;
    const [{ total: count }] = total as [{ total: number }];

    return {
      threads: rows.map((t) => ({
        id: t.id as string,
        name: t.name as string,
        slug: t.slug as string,
        description: t.description as string | null,
        createdAt: t.createdAt as Date,
        updatedAt: t.updatedAt as Date,
        createdBy: t.createdBy as string,
        aiSummary: t.aiSummary as string | null,
        messageCount: t.messageCount as number,
        memberCount: t.memberCount as number,
      })),
      total: count,
      hasMore: computeHasMore(offset, limit, count),
    };
  } catch (error) {
    logger.error('[searchThreads]', error);
    return { threads: [], total: 0, hasMore: false };
  }
});

export const searchMessages = cache(async (
  query: string,
  threadId?: string,
  limit: number = 20,
  offset: number = 0,
  threadIds?: string[]
): Promise<{ messages: SearchMessageResult[]; total: number; hasMore: boolean }> => {
  try {
    const sanitized = query.replace(/[^\w\s]/g, '').trim();
    if (!sanitized) {
      return { messages: [], total: 0, hasMore: false };
    }

    const threadFilter = threadId
      ? prisma.$queryRaw`AND m."threadId" = ${threadId}::text`
      : prisma.$queryRaw``;

    const threadsFilter = threadIds && threadIds.length > 0
      ? prisma.$queryRaw`AND m."threadId" = ANY(${threadIds}::text[])`
      : prisma.$queryRaw``;

    const [messages, total] = await Promise.all([
      prisma.$queryRaw`
        SELECT m.id, m.content, m."threadId", m."senderId", m."createdAt", m."parentId", m.depth,
               m."isAiResponse", m."likeCount", m."replyCount",
               t.name as "threadName", t.slug as "threadSlug",
               u.name as "senderName", u.email as "senderEmail", u.image as "senderImage",
               ts_rank(m."fts_vector", plainto_tsquery('english', ${sanitized})) AS rank
        FROM "messages" m
        JOIN "threads" t ON t.id = m."threadId"
        JOIN "users" u ON u.id = m."senderId"
        WHERE m."deletedAt" IS NULL
          AND m."fts_vector" @@ plainto_tsquery('english', ${sanitized})
          ${threadFilter}
          ${threadsFilter}
        ORDER BY rank DESC, m."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw`
        SELECT count(*)::int AS total
        FROM "messages" m
        WHERE m."deletedAt" IS NULL
          AND m."fts_vector" @@ plainto_tsquery('english', ${sanitized})
          ${threadFilter}
          ${threadsFilter}
        `,
    ]);

    const rows = messages as Array<Record<string, unknown>>;
    const [{ total: count }] = total as [{ total: number }];

    return {
      messages: rows.map((m) => ({
        id: m.id as string,
        content: m.content as string,
        threadId: m.threadId as string,
        senderId: m.senderId as string,
        createdAt: m.createdAt as Date,
        parentId: m.parentId as string | null,
        depth: m.depth as number,
        isAiResponse: m.isAiResponse as boolean,
        likeCount: m.likeCount as number,
        replyCount: m.replyCount as number,
        sender: {
          id: m.senderId as string,
          name: m.senderName as string | null,
          email: m.senderEmail as string,
          image: m.senderImage as string | null,
        },
        thread: {
          id: m.threadId as string,
          name: m.threadName as string,
          slug: m.threadSlug as string,
        },
      })),
      total: count,
      hasMore: computeHasMore(offset, limit, count),
    };
  } catch (error) {
    logger.error('[searchMessages]', error);
    return { messages: [], total: 0, hasMore: false };
  }
});

export const searchUsers = cache(async (query: string, limit: number = 20, offset: number = 0): Promise<{ users: SearchUserResult[]; total: number; hasMore: boolean }> => {
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

    return {
      users: users ?? [],
      total,
      hasMore: computeHasMore(offset, limit, total),
    };
  } catch (error) {
    logger.error('[searchUsers]', error);
    return { users: [], total: 0, hasMore: false };
  }
});
