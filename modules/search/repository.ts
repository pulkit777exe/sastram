import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore, emptyPagination } from '@/lib/db/pagination';

export const searchThreads = cache(async (query: string, limit: number = 20, offset: number = 0, threadIds?: string[]) => {
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
      threads: rows.map((t: any) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        createdBy: t.createdBy,
        aiSummary: t.aiSummary,
        messageCount: t.messageCount,
        memberCount: t.memberCount,
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
) => {
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
      messages: rows.map((m: any) => ({
        id: m.id,
        content: m.content,
        threadId: m.threadId,
        senderId: m.senderId,
        createdAt: m.createdAt,
        parentId: m.parentId,
        depth: m.depth,
        isAiResponse: m.isAiResponse,
        likeCount: m.likeCount,
        replyCount: m.replyCount,
        sender: {
          id: m.senderId,
          name: m.senderName,
          email: m.senderEmail,
          image: m.senderImage,
        },
        thread: {
          id: m.threadId,
          name: m.threadName,
          slug: m.threadSlug,
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

export const searchUsers = cache(async (query: string, limit: number = 20, offset: number = 0) => {
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
