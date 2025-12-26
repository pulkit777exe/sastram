import { z } from "zod";

/**
 * Notification validation schemas
 */

export const getNotificationsSchema = z.object({
  unreadOnly: z.boolean().optional().default(false),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.string().cuid("Invalid notification ID"),
});

