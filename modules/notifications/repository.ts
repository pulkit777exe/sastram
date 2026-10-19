import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma, type NotificationType } from '@prisma/client';
import { cache } from 'react';

const DEFAULT_NOTIFICATION_LIMIT = 50;

interface NotificationFilters {
  userId: string;
  unreadOnly?: boolean;
  type?: NotificationType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

function buildUnreadWhere(userId: string, type?: NotificationType): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = { userId, isRead: false };
  if (type) {
    where.type = type;
  }
  return where;
}

function buildDateRangeFilter(startDate?: Date, endDate?: Date): Prisma.DateTimeFilter | undefined {
  if (!startDate && !endDate) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (startDate) filter.gte = startDate;
  if (endDate) filter.lte = endDate;
  return filter;
}

export const getUserNotifications = cache(async (filters: NotificationFilters) => {
  const where: Prisma.NotificationWhereInput = {
    userId: filters.userId,
  };

  if (filters.unreadOnly) {
    where.isRead = false;
  }

  if (filters.type) {
    where.type = filters.type;
  }

  const dateFilter = buildDateRangeFilter(filters.startDate, filters.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  const limit = filters.limit ?? DEFAULT_NOTIFICATION_LIMIT;
  const offset = filters.offset ?? 0;

  const rows = await prisma.notification.findMany({
    where,
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      message: true,
      data: true,
      isRead: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    skip: offset,
  });

  return rows ?? [];
});

export async function markAsRead(notificationId: string, userId: string) {
  const res = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
  if (res.count === 0) throw new Error('Notification not found or unauthorized');
  return prisma.notification.findUnique({ where: { id: notificationId } });
}

export async function markAllAsRead(userId: string, type?: NotificationType) {
  const where = buildUnreadWhere(userId, type);
  return prisma.notification.updateMany({
    where,
    data: {
      isRead: true,
    },
  });
}

export const getUnreadCount = cache(async (userId: string, type?: NotificationType) => {
  const where = buildUnreadWhere(userId, type);
  return prisma.notification.count({ where });
});
