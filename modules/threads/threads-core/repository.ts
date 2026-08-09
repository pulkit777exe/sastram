import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import { buildThreadDTO, buildThreadDetailDTO } from '@/modules/threads/service';
import type { ThreadDetail, ThreadRecord, ThreadSummary } from '@/modules/threads/types';

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

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// "Active users" is distinct senders in the last week — not derivable from any
// denormalized column, hence the raw aggregate.
async function countActiveUsersByThread(threadIds: string[]): Promise<Map<string, number>> {
  if (threadIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<Array<{ threadId: string; uniqueUsers: bigint }>>`
    SELECT "threadId", COUNT(DISTINCT "senderId")::bigint as "uniqueUsers"
    FROM "messages"
    WHERE "threadId" IN (${Prisma.join(threadIds)})
      AND "deletedAt" IS NULL
      AND "createdAt" >= ${new Date(Date.now() - ACTIVE_WINDOW_MS)}
    GROUP BY "threadId"
  `;

  return new Map(rows.map((row) => [row.threadId, Number(row.uniqueUsers)]));
}

/**
 * Mirrors `canAccessThread`: non-public threads are only visible to their
 * creator or to someone with an accepted invitation (matched by sender id or
 * by the email the invitation was addressed to).
 */
async function visibilityFilter(memberUserId: string): Promise<Prisma.ThreadWhereInput> {
  const user = await prisma.user.findUnique({
    where: { id: memberUserId },
    select: { email: true },
  });

  const invitationMatch: Prisma.ThreadInvitationWhereInput[] = [{ senderId: memberUserId }];
  if (user?.email) {
    invitationMatch.push({ email: user.email });
  }

  return {
    OR: [
      { visibility: 'PUBLIC' },
      { createdBy: memberUserId },
      { invitations: { some: { status: 'ACCEPTED', OR: invitationMatch } } },
    ],
  };
}

export const listThreads = cache(
  async (params: ListThreadsParams = {}): Promise<PaginatedThreads> => {
    const { page = 1, pageSize = 10, sortBy = 'recent', memberUserId, threadIds } = params;

    const where: Prisma.ThreadWhereInput = { deletedAt: null };
    if (threadIds && threadIds.length > 0) {
      where.id = { in: threadIds };
    }
    // Omitting memberUserId is an admin/system-level listing (callers are
    // already role-gated); any user-facing call must pass it.
    if (memberUserId) {
      Object.assign(where, await visibilityFilter(memberUserId));
    }

    try {
      const [totalItems, threadRows] = await Promise.all([
        prisma.thread.count({ where }),
        prisma.thread.findMany({
          where,
          include: {
            _count: { select: { messages: { where: { deletedAt: null } } } },
          },
          orderBy:
            sortBy === 'oldest'
              ? { createdAt: 'asc' }
              : sortBy === 'popular'
                ? { messageCount: 'desc' }
                : { updatedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      const activeUsers = await countActiveUsersByThread(threadRows.map((t) => t.id));

      const mappedThreads = threadRows.map((thread) =>
        buildThreadDTO(thread as ThreadRecord, thread._count.messages, activeUsers.get(thread.id) ?? 0)
      );

      // Trending has no SQL equivalent, so it re-orders the current page only.
      if (sortBy === 'trending') {
        mappedThreads.sort(
          (a, b) => b.activeUsers * 2 + b.messageCount - (a.activeUsers * 2 + a.messageCount)
        );
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
