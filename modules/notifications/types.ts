import type { NotificationType } from '@prisma/client';

/**
 * Notification domain types
 */

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string | null;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: Date;
}
