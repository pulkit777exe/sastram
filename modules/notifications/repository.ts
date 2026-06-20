import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma, type NotificationType } from '@prisma/client';
import { cache } from 'react';
import { dedupe } from '@/lib/dedupe';
import { logger } from '@/lib/infrastructure/logger';

export type NotificationData = Record<string, unknown> | null;

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  data?: NotificationData;
}

interface NotificationFilters {
  userId: string;
  unreadOnly?: boolean;
  type?: NotificationType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

import { publishUserEvent } from '@/lib/infrastructure/websocket';

async function getBulkUnreadCounts(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ userId: string; count: bigint }>>`
    SELECT "userId", COUNT(*)::bigint as "count"
    FROM "notifications"
    WHERE "userId" IN (${Prisma.join(userIds)})
      AND "isRead" = false
    GROUP BY "userId"
  `;
  return new Map(rows.map((r) => [r.userId, Number(r.count)]));
}

export async function createNotification({
  userId,
  type,
  title,
  message,
  data,
}: CreateNotificationParams) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      data: data as Prisma.InputJsonValue,
    },
  });

  const unreadCount = await getUnreadCount(userId);

  publishUserEvent(userId, {
    type: 'NOTIFICATION_COUNT_UPDATE',
    payload: { unreadCount },
  });

  return notification;
}

export async function createBulkNotifications(notifications: CreateNotificationParams[]) {
  const result = await prisma.notification.createMany({
    data: notifications.map((notif) => ({
      userId: notif.userId,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      data: notif.data as Prisma.InputJsonValue,
    })),
  });

  const uniqueUserIds = [...new Set(notifications.map((n) => n.userId))];
  try {
    const counts = await getBulkUnreadCounts(uniqueUserIds);
    for (const userId of uniqueUserIds) {
      publishUserEvent(userId, {
        type: 'NOTIFICATION_COUNT_UPDATE',
        payload: { unreadCount: counts.get(userId) ?? 0 },
      });
    }
  } catch (err) {
    logger.error('[createBulkNotifications] Failed to publish count updates', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
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

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  try {
    return (
      (await dedupe(`notifications:list:${JSON.stringify(filters)}`, () =>
        prisma.notification.findMany({
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
          take: filters.limit || 50,
          skip: filters.offset || 0,
        })
      )) ?? []
    );
  } catch (error) {
    logger.error('[getUserNotifications]', error);
    return [];
  }
});

export const getNotificationById = cache(async (notificationId: string) => {
  return dedupe(`notifications:byId:${notificationId}`, () =>
    prisma.notification.findUnique({
      where: { id: notificationId },
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
    })
  );
});

export async function markAsRead(notificationId: string, userId?: string) {
  const where: Prisma.NotificationWhereUniqueInput = { id: notificationId };

  // Optional: verify the notification belongs to the user
  if (userId) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error('Notification not found or unauthorized');
    }
  }

  return prisma.notification.update({
    where,
    data: {
      isRead: true,
    },
  });
}

export async function markAllAsRead(userId: string, type?: NotificationType) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    isRead: false,
  };

  if (type) {
    where.type = type;
  }

  return prisma.notification.updateMany({
    where,
    data: {
      isRead: true,
    },
  });
}

export const getUnreadCount = cache(async (userId: string, type?: NotificationType) => {
  const where: Prisma.NotificationWhereInput = {
    userId,
    isRead: false,
  };

  if (type) {
    where.type = type;
  }

  return dedupe(`notifications:unread:${userId}:${type ?? 'all'}`, () =>
    prisma.notification.count({ where })
  );
});

export async function deleteNotification(notificationId: string, userId?: string) {
  if (userId) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error('Notification not found or unauthorized');
    }
  }

  return prisma.notification.delete({
    where: { id: notificationId },
  });
}

export async function deleteAllNotifications(userId: string, type?: NotificationType) {
  const where: Prisma.NotificationWhereInput = { userId };

  if (type) {
    where.type = type;
  }

  return prisma.notification.deleteMany({ where });
}

export async function deleteReadNotifications(userId: string, olderThanDays?: number) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    isRead: true,
  };

  if (olderThanDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    where.createdAt = { lt: cutoffDate };
  }

  return prisma.notification.deleteMany({ where });
}

export const getRecentNotifications = cache(async (userId: string, limit: number = 10) => {
  try {
    return (
      (await dedupe(`notifications:recent:${userId}:${limit}`, () =>
        prisma.notification.findMany({
          where: { userId },
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
        })
      )) ?? []
    );
  } catch (error) {
    logger.error('[getRecentNotifications]', error);
    return [];
  }
});

export async function notifyMultipleUsers(
  userIds: string[],
  type: NotificationType,
  title: string,
  message?: string,
  data?: NotificationData
) {
  const result = await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type,
      title,
      message,
      data: data as Prisma.InputJsonValue,
    })),
  });

  try {
    const counts = await getBulkUnreadCounts(userIds);
    for (const userId of userIds) {
      publishUserEvent(userId, {
        type: 'NOTIFICATION_COUNT_UPDATE',
        payload: { unreadCount: counts.get(userId) ?? 0 },
      });
    }
  } catch (err) {
    logger.error('[notifyMultipleUsers] Failed to publish count updates', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}
