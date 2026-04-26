import { z } from 'zod';

/**
 * Notification validation schemas
 */

export const getNotificationsSchema = z.object({
  unreadOnly: z.boolean().optional().default(false),
  limit: z.number().int().positive().max(100).optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.string().cuid('Invalid notification ID'),
});
