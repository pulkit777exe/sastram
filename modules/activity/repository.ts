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

export const getUserActivity = cache(async (userId: string, limit: number = 20, offset: number = 0) => {
  try {
    const [activities, total] = await Promise.all([
      prisma.userActivity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userActivity.count({ where: { userId } }),
    ]);

    return { activities, total, hasMore: computeHasMore(offset, limit, total) };
  } catch (error) {
    logger.error('[getUserActivity]', error);
    return { activities: [], total: 0, hasMore: false };
  }
});


