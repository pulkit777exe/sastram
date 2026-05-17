import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore, emptyPagination } from '@/lib/db/pagination';

export async function searchThreads(query: string, limit: number = 20, offset: number = 0, sectionIds?: string[]) {
  try {
    const sanitized = query.replace(/[^\w\s]/g, '').trim();
    if (!sanitized) {
      return { threads: [], total: 0, hasMore: false };
    }

    const sectionFilter = sectionIds && sectionIds.length > 0
      ? prisma.$queryRaw`AND id = ANY(${sectionIds}::text[])`
      : prisma.$queryRaw``;

    const [threads, total] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, name, slug, description, "aiSummary" as "aiSummary",
               "createdAt", "updatedAt", "createdBy",
               "messageCount", "memberCount",
                ts_rank("fts_vector", plainto_tsquery('english', ${sanitized})) AS rank
        FROM "sections"
        WHERE "fts_vector" @@ plainto_tsquery('english', ${sanitized})
          ${sectionFilter}
        ORDER BY rank DESC, "messageCount" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw`
        SELECT count(*)::int AS total
        FROM "sections"
        WHERE "fts_vector" @@ plainto_tsquery('english', ${sanitized})
          ${sectionFilter}
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
}

export async function searchMessages(
  query: string,
  threadId?: string,
  limit: number = 20,
  offset: number = 0,
  sectionIds?: string[]
) {
  try {
    const sanitized = query.replace(/[^\w\s]/g, '').trim();
    if (!sanitized) {
      return { messages: [], total: 0, hasMore: false };
    }

    const threadFilter = threadId
      ? prisma.$queryRaw`AND m."sectionId" = ${threadId}::text`
      : prisma.$queryRaw``;

    const sectionFilter = sectionIds && sectionIds.length > 0
      ? prisma.$queryRaw`AND m."sectionId" = ANY(${sectionIds}::text[])`
      : prisma.$queryRaw``;

    const [messages, total] = await Promise.all([
      prisma.$queryRaw`
        SELECT m.id, m.content, m."sectionId", m."senderId", m."createdAt", m."parentId", m.depth,
               m."isAiResponse", m."likeCount", m."replyCount",
               s.name as "sectionName", s.slug as "sectionSlug",
               u.name as "senderName", u.email as "senderEmail", u.image as "senderImage", u."avatarUrl" as "senderAvatarUrl",
               ts_rank(m."fts_vector", plainto_tsquery('english', ${sanitized})) AS rank
        FROM "messages" m
        JOIN "sections" s ON s.id = m."sectionId"
        JOIN "users" u ON u.id = m."senderId"
        WHERE m."deletedAt" IS NULL
          AND m."fts_vector" @@ plainto_tsquery('english', ${sanitized})
          ${threadFilter}
          ${sectionFilter}
        ORDER BY rank DESC, m."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw`
        SELECT count(*)::int AS total
        FROM "messages" m
        WHERE m."deletedAt" IS NULL
          AND m."fts_vector" @@ plainto_tsquery('english', ${sanitized})
          ${threadFilter}
          ${sectionFilter}
      `,
    ]);

    const rows = messages as Array<Record<string, unknown>>;
    const [{ total: count }] = total as [{ total: number }];

    return {
      messages: rows.map((m: any) => ({
        id: m.id,
        content: m.content,
        sectionId: m.sectionId,
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
          avatarUrl: m.senderAvatarUrl,
        },
        section: {
          id: m.sectionId,
          name: m.sectionName,
          slug: m.sectionSlug,
        },
      })),
      total: count,
      hasMore: computeHasMore(offset, limit, count),
    };
  } catch (error) {
    logger.error('[searchMessages]', error);
    return { messages: [], total: 0, hasMore: false };
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

    return {
      users: users ?? [],
      total,
      hasMore: computeHasMore(offset, limit, total),
    };
  } catch (error) {
    logger.error('[searchUsers]', error);
    return { users: [], total: 0, hasMore: false };
  }
}
