import { prisma } from "@/lib/infrastructure/prisma";
import { AuditAction, Prisma } from "@prisma/client";

export type AuditLogDetails = Record<string, unknown> | null;

interface LogActionParams {
  action: AuditAction;
  entityType: string;
  entityId: string;
  userId?: string;
  performedBy?: string;
  details?: AuditLogDetails;
  ipAddress?: string;
  userAgent?: string;
}

interface AuditLogFilters {
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  userId?: string;
  performedBy?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export async function logAction({
  action,
  entityType,
  entityId,
  userId,
  performedBy,
  details,
  ipAddress,
  userAgent,
}: LogActionParams) {
  return prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      userId,
      performedBy,
      details: details as Prisma.InputJsonValue,
      ipAddress,
      userAgent,
    },
  });
}

export async function getAuditLogs(filters?: AuditLogFilters) {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters) {
    if (filters.action) where.action = filters.action;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.performedBy) where.performedBy = filters.performedBy;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }
  }

  return prisma.auditLog.findMany({
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
      performer: {
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
  });
}

export async function getEntityHistory(entityType: string, entityId: string) {
  return prisma.auditLog.findMany({
    where: {
      entityType,
      entityId,
    },
    include: {
      performer: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
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
  });
}

export async function getUserActivity(
  userId: string,
  limit: number = 50,
  offset: number = 0
) {
  return prisma.auditLog.findMany({
    where: {
      OR: [{ userId }, { performedBy: userId }],
    },
    include: {
      performer: {
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
  });
}

export async function getAuditLogStats(filters?: {
  startDate?: Date;
  endDate?: Date;
  entityType?: string;
}) {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  if (filters?.entityType) {
    where.entityType = filters.entityType;
  }

  const [totalCount, actionBreakdown, entityTypeBreakdown] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({
      by: ["action"],
      where,
      _count: {
        action: true,
      },
    }),
    prisma.auditLog.groupBy({
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
      action: item.action,
      count: item._count.action,
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
  const where: Prisma.AuditLogWhereInput = {};

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const userActivity = await prisma.auditLog.groupBy({
    by: ["performedBy"],
    where: {
      ...where,
      performedBy: { not: null },
    },
    _count: {
      performedBy: true,
    },
    orderBy: {
      _count: {
        performedBy: "desc",
      },
    },
    take: limit,
  });

  // Fetch user details
  const userIds = userActivity
    .map((item) => item.performedBy)
    .filter((id): id is string => id !== null);

  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
    },
  });

  const userMap = new Map(users.map((user) => [user.id, user]));

  return userActivity
    .filter((item) => item.performedBy !== null)
    .map((item) => ({
      user: userMap.get(item.performedBy!),
      actionCount: item._count.performedBy,
    }));
}

export async function searchAuditLogs(
  searchTerm: string,
  filters?: Omit<AuditLogFilters, "limit" | "offset">,
  limit: number = 50
) {
  const where: Prisma.AuditLogWhereInput = {
    OR: [
      { entityId: { contains: searchTerm, mode: "insensitive" } },
      { entityType: { contains: searchTerm, mode: "insensitive" } },
      { ipAddress: { contains: searchTerm, mode: "insensitive" } },
    ],
  };

  // Add additional filters
  if (filters?.action) where.action = filters.action;
  if (filters?.entityType) where.entityType = filters.entityType;
  if (filters?.userId) where.userId = filters.userId;
  if (filters?.performedBy) where.performedBy = filters.performedBy;

  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  return prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      performer: {
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
  });
}

export async function cleanupOldAuditLogs(daysToKeep: number = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const deleted = await prisma.auditLog.deleteMany({
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