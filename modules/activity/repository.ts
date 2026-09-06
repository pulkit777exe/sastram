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

export const getUserActivity = cache(async (userId: string, limit: number = DEFAULT_ACTIVITY_LIMIT, offset: number = 0) => {
  try {
    const where = { userId };
    const [activities, total] = await Promise.all([
      prisma.userActivity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userActivity.count({ where }),
    ]);

    return { activities, total, hasMore: computeHasMore(offset, limit, total) };
  } catch (error) {
    logger.error('[getUserActivity]', error);
    return { activities: [], total: 0, hasMore: false };
  }
});


