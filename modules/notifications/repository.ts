import { prisma } from "@/lib/infrastructure/prisma";
import { NotificationType, Prisma } from "@prisma/client";

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

export async function createBulkNotifications(
  notifications: CreateNotificationParams[]
) {
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

export async function getUserNotifications(filters: NotificationFilters) {
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

  return prisma.notification.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    take: filters.limit || 50,
    skip: filters.offset || 0,
  });
}

export async function getNotificationById(notificationId: string) {
  return prisma.notification.findUnique({
    where: { id: notificationId },
  });
}

export async function markAsRead(notificationId: string, userId?: string) {
  const where: Prisma.NotificationWhereUniqueInput = { id: notificationId };

  // Optional: verify the notification belongs to the user
  if (userId) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error("Notification not found or unauthorized");
    }
  }

  return prisma.notification.update({
    where,
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

export async function markAsUnread(notificationId: string, userId?: string) {
  const where: Prisma.NotificationWhereUniqueInput = { id: notificationId };

  if (userId) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error("Notification not found or unauthorized");
    }
  }

  return prisma.notification.update({
    where,
    data: {
      isRead: false,
      readAt: null,
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
      readAt: new Date(),
    },
  });
}

export async function markMultipleAsRead(notificationIds: string[], userId: string) {
  return prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
      userId, // Security check
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

export async function getUnreadCount(userId: string, type?: NotificationType) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    isRead: false,
  };

  if (type) {
    where.type = type;
  }

  return prisma.notification.count({ where });
}

export async function getUnreadCountByType(userId: string) {
  const notifications = await prisma.notification.groupBy({
    by: ["type"],
    where: {
      userId,
      isRead: false,
    },
    _count: {
      type: true,
    },
  });

  return notifications.reduce(
    (acc, item) => {
      acc[item.type] = item._count.type;
      return acc;
    },
    {} as Record<NotificationType, number>
  );
}

export async function deleteNotification(notificationId: string, userId?: string) {
  if (userId) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error("Notification not found or unauthorized");
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
    where.readAt = { lt: cutoffDate };
  }

  return prisma.notification.deleteMany({ where });
}

export async function getNotificationStats(userId: string) {
  const [total, unread, byType] = await Promise.all([
    prisma.notification.count({
      where: { userId },
    }),
    prisma.notification.count({
      where: { userId, isRead: false },
    }),
    prisma.notification.groupBy({
      by: ["type"],
      where: { userId },
      _count: {
        type: true,
      },
    }),
  ]);

  return {
    total,
    unread,
    read: total - unread,
    byType: byType.map((item) => ({
      type: item.type,
      count: item._count.type,
    })),
  };
}

export async function getRecentNotifications(
  userId: string,
  limit: number = 10
) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });
}

export async function notifyMultipleUsers(
  userIds: string[],
  type: NotificationType,
  title: string,
  message?: string,
  data?: NotificationData
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

export async function cleanupOldNotifications(daysToKeep: number = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const deleted = await prisma.notification.deleteMany({
    where: {
      isRead: true,
      readAt: {
        lt: cutoffDate,
      },
    },
  });

  return {
    deletedCount: deleted.count,
    cutoffDate,
  };
}