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

function createdAtRange(filters?: {
  startDate?: Date;
  endDate?: Date;
}): Prisma.DateTimeFilter | undefined {
  if (!filters?.startDate && !filters?.endDate) return undefined;
  return { gte: filters.startDate, lte: filters.endDate };
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

// Audit reads back admin dashboards, so a failed query degrades to an empty
// list rather than taking the whole page down.
export async function getUserActivities(filters?: UserActivityFilters) {
  try {
    return await prisma.userActivity.findMany({
      where: {
        type: filters?.action,
        entityType: filters?.entityType,
        entityId: filters?.entityId,
        userId: filters?.userId,
        createdAt: createdAtRange(filters),
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit ?? 100,
      skip: filters?.offset ?? 0,
    });
  } catch (error) {
    logger.error('[getUserActivities]', error);
    return [];
  }
}


