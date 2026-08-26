import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma, type NotificationType, type Role } from '@prisma/client';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';

export type NotificationData = Record<string, unknown> | null;

// Best-effort: queries users by role, creates bulk notifications. Logs errors
// but never throws — a notification failure must not block the caller.
export async function notifyUsersByRole(
  roles: Role[],
  title: string,
  message: string,
  data?: NotificationData,
): Promise<void> {
  try {
    const recipients = await prisma.user.findMany({
      where: { role: { in: roles }, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (recipients.length === 0) return;
    await createBulkNotifications(
      recipients.map((user) => ({ userId: user.id, type: 'SYSTEM' as const, title, message, data })),
    );
  } catch (error) {
    logger.error('[notifyUsersByRole] failed', error);
  }
}

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

export async function createNotification({
  userId,
  type,
  title,
  message,
  data,
}: CreateNotificationParams) {
  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      data: data as Prisma.InputJsonValue,
    },
  });
}

export async function createBulkNotifications(notifications: CreateNotificationParams[]) {
  return prisma.notification.createMany({
    data: notifications.map((notif) => ({
      userId: notif.userId,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      data: notif.data as Prisma.InputJsonValue,
    })),
  });
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

  return (
    (await prisma.notification.findMany({
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
    })) ?? []
  );
});

export async function markAsRead(notificationId: string, userId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true },
  });

  if (!notification || notification.userId !== userId) {
    throw new Error('Notification not found or unauthorized');
  }

  return prisma.notification.update({
    where: { id: notificationId },
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

  return prisma.notification.count({ where });
});

export async function notifyMultipleUsers(
  userIds: string[],
  type: NotificationType,
  title: string,
  message?: string,
  data?: NotificationData,
) {
  return prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type,
      title,
      message,
      data: data as Prisma.InputJsonValue,
    })),
  });
}
