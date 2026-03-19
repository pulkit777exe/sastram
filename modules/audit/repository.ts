import { prisma } from "@/lib/infrastructure/prisma";
import { logger } from "@/lib/infrastructure/logger";

export type UserActivityDetails = Record<string, unknown> | null;

interface LogActionParams {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  details?: UserActivityDetails;
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

export async function logAction({
  action,
  entityType,
  entityId,
  userId,
  details,
}: LogActionParams) {
  return prisma.userActivity.create({
    data: {
      userId: userId!,
      type: action,
      entityType,
      entityId,
      metadata: details as any,
    },
  });
}

export async function getUserActivities(filters?: UserActivityFilters) {
  const where: any = {};

  if (filters) {
    if (filters.action) where.type = filters.action;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.userId) where.userId = filters.userId;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }
  }

  return safeList("[getUserActivities]", () =>
    prisma.userActivity.findMany({
      where,
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
        createdAt: "desc",
      },
      take: filters?.limit || 100,
      skip: filters?.offset || 0,
    }),
  );
}

export async function getEntityHistory(entityType: string, entityId: string) {
  return safeList("[getEntityHistory]", () =>
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
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  );
}

export async function getUserActivity(
  userId: string,
  limit: number = 50,
  offset: number = 0
) {
  return safeList("[getUserActivity]", () =>
    prisma.userActivity.findMany({
      where: {
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: offset,
    }),
  );
}

export async function getUserActivityStats(filters?: {
  startDate?: Date;
  endDate?: Date;
  entityType?: string;
}) {
  const where: any = {};

  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  if (filters?.entityType) {
    where.entityType = filters.entityType;
  }

  const [totalCount, actionBreakdown, entityTypeBreakdown] = await Promise.all([
    prisma.userActivity.count({ where }),
    prisma.userActivity.groupBy({
      by: ["type"],
      where,
      _count: {
        type: true,
      },
    }),
    prisma.userActivity.groupBy({
      by: ["entityType"],
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

export async function getMostActiveUsers(
  limit: number = 10,
  startDate?: Date,
  endDate?: Date
) {
  const where: any = {};

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const userActivity = await prisma.userActivity.groupBy({
    by: ["userId"],
    where: {
      ...where,
      userId: { not: null },
    },
    _count: {
      userId: true,
    },
    orderBy: {
      _count: {
        userId: "desc",
      },
    },
    take: limit,
  });

  // Fetch user details
  const userIds = userActivity
    .map((item) => item.userId)
    .filter((id): id is string => id !== null);

  const users = await safeList("[getMostActiveUsers:users]", () =>
    prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
    }),
  );

  const userMap = new Map(users.map((user) => [user.id, user]));

  return userActivity
    .filter((item) => item.userId !== null)
    .map((item) => ({
      user: userMap.get(item.userId!),
      actionCount: item._count.userId,
    }));
}

export async function searchUserActivities(
  searchTerm: string,
  filters?: Omit<UserActivityFilters, "limit" | "offset">,
  limit: number = 50
) {
  const where: any = {
    OR: [
      { entityId: { contains: searchTerm, mode: "insensitive" } },
      { entityType: { contains: searchTerm, mode: "insensitive" } },
    ],
  };

  // Add additional filters
  if (filters?.action) where.type = filters.action;
  if (filters?.entityType) where.entityType = filters.entityType;
  if (filters?.userId) where.userId = filters.userId;

  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  return safeList("[searchUserActivities]", () =>
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
        createdAt: "desc",
      },
      take: limit,
    }),
  );
}

export async function cleanupOldUserActivities(daysToKeep: number = 90) {
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
