'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from '@/modules/notifications/repository';
import { ROUTES } from '@/lib/config/routes';
import { createServerAction, withValidation } from '@/lib/utils/server-action';

const getNotificationsSchema = z.object({
  unreadOnly: z.boolean().optional().default(false),
  limit: z.number().int().positive().max(100).optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
});

const markNotificationReadSchema = z.object({
  notificationId: z.string().cuid(),
});

export const getNotifications = withValidation(
  getNotificationsSchema,
  'getNotifications',
  async ({ unreadOnly, limit, offset }) => {
    const session = await requireSession();
    const notifications = await getUserNotifications({
      userId: session.user.id,
      unreadOnly,
      limit,
      offset,
    });
    return { data: notifications, error: null, ok: true, errorCode: null };
  }
);

export const markNotificationRead = withValidation(
  markNotificationReadSchema,
  'markNotificationRead',
  async ({ notificationId }) => {
    const session = await requireSession();
    await markAsRead(notificationId, session.user.id);
    revalidatePath(ROUTES.DASHBOARD);
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const markAllNotificationsRead = createServerAction(
  { schema: z.object({}), actionName: 'markAllNotificationsRead' },
  async () => {
    const session = await requireSession();
    await markAllAsRead(session.user.id);
    revalidatePath(ROUTES.DASHBOARD);
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const getUnreadNotificationCount = createServerAction(
  { schema: z.object({}), actionName: 'getUnreadNotificationCount' },
  async () => {
    const session = await requireSession();
    const count = await getUnreadCount(session.user.id);
    return { data: { count }, error: null, ok: true, errorCode: null };
  }
);
