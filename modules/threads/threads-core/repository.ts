import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import { buildThreadDTO, buildThreadDetailDTO } from '@/modules/threads/service';
import type { ThreadDetail, ThreadRecord, ThreadSummary } from '@/modules/threads/types';

type ThreadStorageWithCommunityAndCount = Prisma.ThreadGetPayload<{
  include: {
    community: true;
    _count: { select: { messages: true; members: true } };
  };
}>;

export interface ListThreadsParams {
  page?: number;
  pageSize?: number;
  sortBy?: 'recent' | 'popular' | 'trending' | 'oldest';
  memberUserId?: string;
  threadIds?: string[];
}

export interface PaginatedThreads {
  threads: ThreadSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export const listThreads = cache(async (params: ListThreadsParams = {}): Promise<PaginatedThreads> => {
  const { page = 1, pageSize = 10, sortBy = 'recent', memberUserId, threadIds } = params;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (memberUserId) {
    where.members = { some: { userId: memberUserId } };
  }
  if (threadIds && threadIds.length > 0) {
    where.id = { in: threadIds };
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalItems, threadRows] = await Promise.all([
      prisma.thread.count({ where }),
      prisma.thread.findMany({
        where,
        include: {
          community: true,
          _count: {
            select: {
              messages: {
                where: {
                  deletedAt: null,
                },
              },
              members: {
                where: {
                  status: 'ACTIVE',
                },
              },
            },
          },
        },
        orderBy:
          sortBy === 'oldest'
            ? { createdAt: 'asc' }
            : sortBy === 'popular'
              ? { messageCount: 'desc' }
              : { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    // Aggregate unique active user counts per thread in the last 7 days
    const threadIds = (threadRows ?? []).map((t) => t.id);
    const activeUserMap = new Map<string, number>();
    if (threadIds.length > 0) {
      const activeUserCounts = await prisma.$queryRaw<
        Array<{ threadId: string; uniqueUsers: bigint }>
      >`
        SELECT "threadId", COUNT(DISTINCT "senderId")::bigint as "uniqueUsers"
        FROM "messages"
        WHERE "threadId" IN (${Prisma.join(threadIds)})
          AND "deletedAt" IS NULL
          AND "createdAt" >= ${sevenDaysAgo}
        GROUP BY "threadId"
      `;
      for (const row of activeUserCounts) {
        activeUserMap.set(row.threadId, Number(row.uniqueUsers));
      }
    }

    let mappedThreads = (threadRows ?? []).map((thread: ThreadStorageWithCommunityAndCount) => {
      const uniqueActiveUsers = activeUserMap.get(thread.id) ?? 0;
      return buildThreadDTO(
        thread as unknown as ThreadRecord,
        thread._count.messages,
        uniqueActiveUsers,
        thread._count.members
      );
    });

    if (sortBy === 'trending') {
      mappedThreads = mappedThreads.sort((a, b) => {
        const scoreA = a.activeUsers * 2 + a.messageCount;
        const scoreB = b.activeUsers * 2 + b.messageCount;
        return scoreB - scoreA;
      });
    }

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      threads: mappedThreads,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    logger.error('[listThreads]', error);
    return {
      threads: [],
      pagination: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: page > 1,
      },
    };
  }
});

export const getThreadBySlug = cache(async (slug: string): Promise<ThreadDetail | null> => {
  const row = await prisma.thread.findFirst({
    where: {
      slug,
    },
    include: {
      community: true,
      _count: {
        select: {
          messages: {
            where: {
              deletedAt: null,
            },
          },
          members: {
            where: {
              status: 'ACTIVE',
            },
          },
          subscriptions: true,
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const activeUserRows = await prisma.$queryRaw<Array<{ uniqueUsers: bigint }>>`
    SELECT COUNT(DISTINCT "senderId")::bigint as "uniqueUsers"
    FROM "messages"
    WHERE "threadId" = ${row.id}
      AND "deletedAt" IS NULL
      AND "createdAt" >= ${sevenDaysAgo}
  `;
  const activeUsers = Number(activeUserRows[0]?.uniqueUsers ?? 0);

  return buildThreadDetailDTO(
    row as unknown as ThreadRecord,
    row._count.messages,
    activeUsers,
    row._count.members,
    row.aiSummary,
    row._count.subscriptions
  );
});
