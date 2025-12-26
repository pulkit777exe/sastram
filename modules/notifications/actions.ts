"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from "@/modules/notifications/repository";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import { getNotificationsSchema, markNotificationReadSchema } from "./schemas";

export async function getNotifications(unreadOnly: boolean = false) {
  const session = await requireSession();

  const validation = validate(getNotificationsSchema, { unreadOnly });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const notifications = await getUserNotifications({
      userId: session.user.id,
      unreadOnly: validation.data.unreadOnly,
    });
    return { success: true, data: notifications };
  } catch (error) {
    return handleError(error);
  }
}

export async function markNotificationRead(notificationId: string) {
  const session = await requireSession();

  const validation = validate(markNotificationReadSchema, { notificationId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await markAsRead(notificationId);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function markAllNotificationsRead() {
  const session = await requireSession();

  try {
    await markAllAsRead(session.user.id);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getUnreadNotificationCount() {
  const session = await requireSession();

  try {
    const count = await getUnreadCount(session.user.id);
    return { success: true, data: { count } };
  } catch (error) {
    return handleError(error);
  }
}

