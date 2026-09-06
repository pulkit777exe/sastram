import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma, type NotificationType, type Role } from '@prisma/client';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';

export type NotificationData = Record<string, unknown> | null;

const DEFAULT_NOTIFICATION_LIMIT = 50;

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

function toNotificationCreateData(params: CreateNotificationParams) {
  return {
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    data: params.data as Prisma.InputJsonValue,
  };
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
    data: notifications.map(toNotificationCreateData),
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

export async function notifyMultipleUsers(
  userIds: string[],
  type: NotificationType,
  title: string,
  message?: string,
  data?: NotificationData,
) {
  const createData: Prisma.NotificationCreateManyInput[] = userIds.map((userId) => ({
    userId,
    type,
    title,
    message,
    data: data as Prisma.InputJsonValue,
  }));
  return prisma.notification.createMany({ data: createData });
}
