import { revalidatePath } from 'next/cache';
import { emitMessageDeleted } from '@/modules/ws/publisher';
import { logAction } from '@/modules/audit/repository';
import { Prisma } from '@prisma/client';
import { ROUTES } from '@/lib/config/routes';

export async function executeMessageDeletionEffects(args: {
  messageId: string;
  threadId: string;
  threadSlug: string;
  moderatorId: string;
  reason?: string;
  originalAuthor: string;
}) {
  await logAction({
    action: 'MESSAGE_DELETED',
    entityType: 'Message',
    entityId: args.messageId,
    userId: args.moderatorId,
    details: {
      reason: args.reason,
      threadSlug: args.threadSlug,
      originalAuthor: args.originalAuthor,
    },
  });

  emitMessageDeleted(args.threadId, args.messageId);

  revalidatePath(ROUTES.THREAD(args.threadSlug));
  revalidatePath('/dashboard/admin/moderation');
}

/**
 * Shared audit logging + path revalidation.
 * Used by both moderation and reports modules.
 */
export async function executeAuditAndRevalidate(args: {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  details?: Prisma.InputJsonValue | null;
  paths?: string[];
}) {
  await logAction({
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    userId: args.userId,
    details: args.details,
  });

  const defaultPaths = ['/dashboard/admin/moderation', '/dashboard/admin/reports'];
  for (const path of args.paths ?? defaultPaths) {
    revalidatePath(path);
  }
}

/**
 * @deprecated Use executeAuditAndRevalidate instead
 */
export const executeModerationAuditAndRevalidate = executeAuditAndRevalidate;
