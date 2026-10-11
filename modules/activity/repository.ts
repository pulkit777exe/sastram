import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import type { Prisma } from '@prisma/client';
import { computeHasMore } from '@/lib/db/pagination';

export async function recordActivity(data: {
  userId: string;
  type: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
}) {
  return prisma.userActivity.create({
    data: {
      ...data,
      metadata: data.metadata as Prisma.InputJsonValue,
    },
  });
}

const DEFAULT_ACTIVITY_LIMIT = 20;
const DEFAULT_QUERY_LIMIT = 100;

export interface ActivityQueryFilters {
  type?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

function createdAtRange(filters?: {
  startDate?: Date;
  endDate?: Date;
}): Prisma.DateTimeFilter | undefined {
  if (!filters?.startDate && !filters?.endDate) return undefined;
  return { gte: filters.startDate, lte: filters.endDate };
}

const ACTIVITY_USER_SELECT = {
  user: { select: { id: true, name: true, email: true, image: true } },
} as const;

/** Canonical filtered read over the shared userActivity table. */
export async function queryActivities(
  filters?: ActivityQueryFilters & { includeUser: true }
): Promise<Array<Prisma.UserActivityGetPayload<{ include: typeof ACTIVITY_USER_SELECT }>>>;
export async function queryActivities(
  filters?: ActivityQueryFilters
): Promise<Array<Prisma.UserActivityGetPayload<{}>>>;
export async function queryActivities(filters?: ActivityQueryFilters & { includeUser?: boolean }) {
  try {
    const limit = filters?.limit ?? DEFAULT_QUERY_LIMIT;
    const offset = filters?.offset ?? 0;

    return await prisma.userActivity.findMany({
      where: {
        type: filters?.type,
        entityType: filters?.entityType,
        entityId: filters?.entityId,
        userId: filters?.userId,
        createdAt: createdAtRange(filters),
      },
      include: filters?.includeUser ? ACTIVITY_USER_SELECT : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  } catch (error) {
    logger.error('[queryActivities]', error);
    return [];
  }
}

export const getUserActivity = cache(async (userId: string, limit: number = DEFAULT_ACTIVITY_LIMIT, offset: number = 0) => {
  try {
    const where = { userId };
    const [activities, total] = await Promise.all([
      queryActivities({ userId, limit, offset }),
      prisma.userActivity.count({ where }),
    ]);

    return { activities, total, hasMore: computeHasMore(offset, limit, total) };
  } catch (error) {
    logger.error('[getUserActivity]', error);
    return { activities: [], total: 0, hasMore: false };
  }
});


