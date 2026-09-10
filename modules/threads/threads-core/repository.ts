import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { buildThreadDTO, buildThreadDetailDTO } from '@/modules/threads/service';
import type { ThreadDetail, ThreadRecord, ThreadSummary } from '@/modules/threads/types';
import { visibilityFilter } from '@/lib/thread-access';

export interface ListThreadsParams {
  page?: number;
  pageSize?: number;
  sortBy?: 'recent' | 'popular' | 'trending' | 'oldest';
  memberUserId?: string;
  memberRole?: Role | null;
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

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TRENDING_ACTIVE_USER_WEIGHT = 2;

function trendingScore(thread: { activeUsers: number; messageCount: number }): number {
  return thread.activeUsers * TRENDING_ACTIVE_USER_WEIGHT + thread.messageCount;
}

function getThreadOrderBy(sortBy: 'recent' | 'popular' | 'trending' | 'oldest'): Prisma.ThreadOrderByWithRelationInput {
  if (sortBy === 'oldest') {
    return { createdAt: 'asc' };
  }
  if (sortBy === 'popular') {
    return { messageCount: 'desc' };
  }
  return { updatedAt: 'desc' };
}

// "Active users" is distinct senders in the last week — not derivable from any
// denormalized column, hence the raw aggregate.
async function countActiveUsersByThread(threadIds: string[]): Promise<Map<string, number>> {
  if (threadIds.length === 0) {
    return new Map();
  }

  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const rows = await prisma.$queryRaw<Array<{ threadId: string; uniqueUsers: bigint }>>`
    SELECT "threadId", COUNT(DISTINCT "senderId")::bigint as "uniqueUsers"
    FROM "messages"
    WHERE "threadId" IN (${Prisma.join(threadIds)})
      AND "deletedAt" IS NULL
      AND "createdAt" >= ${since}
    GROUP BY "threadId"
  `;

  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(row.threadId, Number(row.uniqueUsers));
  }
  return result;
}

const IS_THREAD_NOT_DELETED: Prisma.ThreadWhereInput = { deletedAt: null };

async function buildThreadWhereClause(params: {
  memberUserId?: string;
  memberRole?: Role | null;
  threadIds?: string[];
}): Promise<Prisma.ThreadWhereInput> {
  const where: Prisma.ThreadWhereInput = { ...IS_THREAD_NOT_DELETED };
  if (params.threadIds && params.threadIds.length > 0) {
    where.id = { in: params.threadIds };
  }
  if (!params.memberUserId) {
    return where;
  }
  const accessFilter = await visibilityFilter(params.memberUserId, params.memberRole);
  if (Object.keys(accessFilter).length === 0) {
    return where;
  }
  where.AND = [accessFilter];
  return where;
}

function mapThreadsToSummaries(
  threadRows: Array<ThreadRecord & { _count: { messages: number } }>,
  activeUsers: Map<string, number>
): ThreadSummary[] {
  return threadRows.map((thread) => {
    const count = thread._count.messages;
    const active = activeUsers.get(thread.id) ?? 0;
    return buildThreadDTO(thread as ThreadRecord, count, active);
  });
}

export const listThreads = cache(
  async (params: ListThreadsParams = {}): Promise<PaginatedThreads> => {
    const { page = 1, pageSize = 10, sortBy = 'recent', memberUserId, memberRole, threadIds } = params;

    const where = await buildThreadWhereClause({ memberUserId, memberRole, threadIds });
    const orderBy = getThreadOrderBy(sortBy);

    const messageCountSelect = {
      _count: { select: { messages: { where: { deletedAt: null } } } },
    };

    const clampedPage = Math.max(1, Math.min(page, 100));
    const clampedPageSize = Math.max(1, Math.min(pageSize, 50));

    if (sortBy === 'trending') {
      const trendingTake = Math.max(clampedPageSize * 5, 50);
      const totalItemsPromise = prisma.thread.count({ where });
      const threadRowsPromise = prisma.thread.findMany({
        where,
        include: messageCountSelect,
        orderBy,
        take: trendingTake + (clampedPage - 1) * clampedPageSize,
      });
      const [totalItems, threadRows] = await Promise.all([totalItemsPromise, threadRowsPromise]);
      const threadIdsForActive = threadRows.map((t) => t.id);
      const activeUsers = await countActiveUsersByThread(threadIdsForActive);
      const mappedThreads = mapThreadsToSummaries(
        threadRows as Array<ThreadRecord & { _count: { messages: number } }>,
        activeUsers
      );
      mappedThreads.sort((a, b) => trendingScore(b) - trendingScore(a));
      const paginated = mappedThreads.slice((clampedPage - 1) * clampedPageSize, clampedPage * clampedPageSize);
      const totalPages = Math.ceil(totalItems / clampedPageSize);
      return {
        threads: paginated,
        pagination: {
          page: clampedPage,
          pageSize: clampedPageSize,
          totalItems,
          totalPages,
          hasNextPage: clampedPage < totalPages,
          hasPreviousPage: clampedPage > 1,
        },
      };
    }

    const totalItemsPromise = prisma.thread.count({ where });
    const threadRowsPromise = prisma.thread.findMany({
      where,
      include: messageCountSelect,
      orderBy,
      skip: (clampedPage - 1) * clampedPageSize,
      take: clampedPageSize,
    });
    const [totalItems, threadRows] = await Promise.all([totalItemsPromise, threadRowsPromise]);

    const threadIdsForActive = threadRows.map((t) => t.id);
    const activeUsers = await countActiveUsersByThread(threadIdsForActive);

    const mappedThreads = mapThreadsToSummaries(
      threadRows as Array<ThreadRecord & { _count: { messages: number } }>,
      activeUsers
    );

    const totalPages = Math.ceil(totalItems / clampedPageSize);

    return {
      threads: mappedThreads,
      pagination: {
        page: clampedPage,
        pageSize: clampedPageSize,
        totalItems,
        totalPages,
        hasNextPage: clampedPage < totalPages,
        hasPreviousPage: clampedPage > 1,
      },
    };
  }
);

export const getThreadBySlug = cache(async (slug: string): Promise<ThreadDetail | null> => {
  const row = await prisma.thread.findFirst({
    where: { slug, deletedAt: null },
    include: {
      _count: {
        select: {
          messages: { where: { deletedAt: null } },
          subscriptions: true,
        },
      },
    },
  });

  if (!row) return null;

  const activeUsers = await countActiveUsersByThread([row.id]);

  return buildThreadDetailDTO(
    row as ThreadRecord,
    row._count.messages,
    activeUsers.get(row.id) ?? 0,
    row.aiSummary,
    row._count.subscriptions
  );
});
