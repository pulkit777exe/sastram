import { revalidatePath } from 'next/cache';
import { emitMessageDeleted } from '@/modules/ws/publisher';
import { logAction } from '@/modules/audit/repository';
import { Prisma } from '@prisma/client';

export async function executeMessageDeletionEffects(args: {
  messageId: string;
  sectionId: string;
  sectionSlug: string;
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
      sectionSlug: args.sectionSlug,
      originalAuthor: args.originalAuthor,
    },
  });

  emitMessageDeleted(args.sectionId, args.messageId);

  revalidatePath(`/dashboard/threads/${args.sectionSlug}`);
  revalidatePath('/dashboard/admin/moderation');
}

export async function executeModerationAuditAndRevalidate(args: {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  details?: Prisma.InputJsonValue | null;
  paths: string[];
}) {
  await logAction({
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    userId: args.userId,
    details: args.details,
  });

  for (const path of args.paths) {
    revalidatePath(path);
  }
}
