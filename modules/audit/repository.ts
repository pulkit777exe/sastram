import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';

export type AuditEventDetails = Prisma.InputJsonValue | null;

interface LogActionParams {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  details?: AuditEventDetails;
}

interface UserActivityFilters {
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

async function safeList<T>(label: string, query: () => Promise<T[]>): Promise<T[]> {
  try {
    return (await query()) ?? [];
  } catch (error) {
    logger.error(label, error);
    return [];
  }
}

function buildCreatedAtRange(filters?: {
  startDate?: Date;
  endDate?: Date;
}): Prisma.DateTimeFilter | undefined {
  if (!filters?.startDate && !filters?.endDate) {
    return undefined;
  }

  return {
    gte: filters.startDate,
    lte: filters.endDate,
  };
}

function buildUserActivityWhere(filters?: UserActivityFilters): Prisma.UserActivityWhereInput {
  return {
    type: filters?.action,
    entityType: filters?.entityType,
    entityId: filters?.entityId,
    userId: filters?.userId,
    createdAt: buildCreatedAtRange(filters),
  };
}

export async function logAction({
  action,
  entityType,
  entityId,
  userId,
  details,
}: LogActionParams) {
  return prisma.userActivity.create({
    data: {
      userId,
      type: action,
      entityType,
      entityId,
      metadata: details ?? Prisma.JsonNull,
    },
  });
}

export const getUserActivities = cache(async (filters?: UserActivityFilters) => {
  return safeList('[getUserActivities]', () =>
    prisma.userActivity.findMany({
      where: buildUserActivityWhere(filters),
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: filters?.limit ?? 100,
      skip: filters?.offset ?? 0,
    })
  );
});

export const getUserActivityStats = cache(async (
  filters?: {
    startDate?: Date;
    endDate?: Date;
    entityType?: string;
  }
): Promise<{
  totalActions: number;
  byAction: { action: string; count: number }[];
  byEntityType: { entityType: string | null; count: number }[];
}> => {
  const where: Prisma.UserActivityWhereInput = {
    createdAt: buildCreatedAtRange(filters),
    entityType: filters?.entityType,
  };

  const [totalCount, actionBreakdown, entityTypeBreakdown] = await Promise.all([
    prisma.userActivity.count({ where }),
    prisma.userActivity.groupBy({
      by: ['type'],
      where,
      _count: {
        type: true,
      },
    }),
    prisma.userActivity.groupBy({
      by: ['entityType'],
      where,
      _count: {
        entityType: true,
      },
    }),
  ]);

  return {
    totalActions: totalCount,
    byAction: actionBreakdown.map((item) => ({
      action: item.type,
      count: item._count.type,
    })),
    byEntityType: entityTypeBreakdown.map((item) => ({
      entityType: item.entityType,
      count: item._count.entityType,
    })),
  };
});
