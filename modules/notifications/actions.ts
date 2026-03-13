"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from "@/modules/notifications/repository";
import { getNotificationsSchema, markNotificationReadSchema } from "./schemas";

export async function getNotifications(unreadOnly: boolean = false) {
  const parsed = getNotificationsSchema.safeParse({ unreadOnly });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    const notifications = await getUserNotifications({
      userId: session.user.id,
      unreadOnly: parsed.data.unreadOnly,
    });
    return { data: notifications, error: null };
  } catch (error) {
    console.error("[getNotifications]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function markNotificationRead(notificationId: string) {
  const parsed = markNotificationReadSchema.safeParse({ notificationId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    await requireSession();
    await markAsRead(parsed.data.notificationId);
    revalidatePath("/dashboard");
    return { data: null, error: null };
  } catch (error) {
    console.error("[markNotificationRead]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function markAllNotificationsRead() {
  try {
    const session = await requireSession();
    await markAllAsRead(session.user.id);
    revalidatePath("/dashboard");
    return { data: null, error: null };
  } catch (error) {
    console.error("[markAllNotificationsRead]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getUnreadNotificationCount() {
  try {
    const session = await requireSession();
    const count = await getUnreadCount(session.user.id);
    return { data: { count }, error: null };
  } catch (error) {
    console.error("[getUnreadNotificationCount]", error);
    return { data: null, error: "Something went wrong" };
  }
}
