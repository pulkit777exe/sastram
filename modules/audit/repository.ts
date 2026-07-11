import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
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

export async function getUserActivities(filters?: UserActivityFilters) {
  return safeList('[getUserActivities]', () =>
    prisma.userActivity.findMany({
      where: buildUserActivityWhere(filters),
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
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
}

export async function getEntityHistory(entityType: string, entityId: string, limit = 50, offset = 0) {
  return safeList('[getEntityHistory]', () =>
    prisma.userActivity.findMany({
      where: {
        entityType,
        entityId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    })
  );
}

export async function getUserActivity(userId: string, limit = 50, offset = 0) {
  return safeList('[getUserActivity]', () =>
    prisma.userActivity.findMany({
      where: {
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    })
  );
}

export async function getUserActivityStats(filters?: {
  startDate?: Date;
  endDate?: Date;
  entityType?: string;
}) {
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
}

export async function getMostActiveUsers(limit = 10, startDate?: Date, endDate?: Date) {
  const userActivity = await prisma.userActivity.groupBy({
    by: ['userId'],
    where: {
      createdAt: buildCreatedAtRange({ startDate, endDate }),
    },
    _count: {
      userId: true,
    },
    orderBy: {
      _count: {
        userId: 'desc',
      },
    },
    take: limit,
  });

  const userIds = userActivity.map((item) => item.userId);

  const users = await safeList('[getMostActiveUsers:users]', () =>
    prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    })
  );

  const userMap = new Map(users.map((user) => [user.id, user]));

  return userActivity.map((item) => ({
    user: userMap.get(item.userId),
    actionCount: item._count.userId,
  }));
}

export async function searchUserActivities(
  searchTerm: string,
  filters?: Omit<UserActivityFilters, 'limit' | 'offset'>,
  limit = 50
) {
  const where: Prisma.UserActivityWhereInput = {
    ...buildUserActivityWhere(filters),
    OR: [
      { entityId: { contains: searchTerm, mode: 'insensitive' } },
      { entityType: { contains: searchTerm, mode: 'insensitive' } },
    ],
  };

  return safeList('[searchUserActivities]', () =>
    prisma.userActivity.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    })
  );
}

export async function cleanupOldUserActivities(daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const deleted = await prisma.userActivity.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return {
    deletedCount: deleted.count,
    cutoffDate,
  };
}
