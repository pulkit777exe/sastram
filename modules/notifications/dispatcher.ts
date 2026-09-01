import { Prisma, type NotificationType, type Role } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

export type NotificationData = Record<string, unknown> | null;

export type NotificationRecipients =
  | { userIds: string[] }
  | { roles: Role[] }
  | { emails: string[] };

export type DispatchNotification = {
  recipients: NotificationRecipients;
  category: NotificationType;
  title: string;
  message?: string;
  data?: NotificationData;
};

/**
 * Deep module — one port, lots of implementation behind the seam.
 * Hides: recipient resolution (userIds / role fanout / email lookup),
 *        best-effort error handling, payload shape.
 * Callers write one line; tests cross the same seam.
 */
export async function dispatch(input: DispatchNotification): Promise<void> {
  try {
    const userIds = await resolveRecipients(input.recipients);
    if (userIds.length === 0) return;
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.category,
        title: input.title,
        message: input.message,
        data: (input.data ?? null) as Prisma.InputJsonValue,
      })),
    });
  } catch (error) {
    logger.error('[notifications.dispatcher] dispatch failed', { error, recipients: input.recipients });
  }
}

async function resolveRecipients(recipients: NotificationRecipients): Promise<string[]> {
  if ('userIds' in recipients) {
    return recipients.userIds;
  }
  if ('roles' in recipients) {
    if (recipients.roles.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { role: { in: recipients.roles }, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  if (recipients.emails.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { email: { in: recipients.emails } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
