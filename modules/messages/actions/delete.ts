'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { createServerAction } from '@/lib/utils/server-action';
import { requireSession } from '@/modules/auth';
import { getMemberRole } from '@/modules/members';
import { logAction } from '@/modules/audit/repository';
import { deleteMessageSchema } from '@/modules/messages/schemas';
import { infraMessageSideEffects } from '@/modules/messages/adapters/infra-side-effects';

export const deleteMessage = createServerAction(
  { schema: deleteMessageSchema, actionName: 'deleteMessage' },
  async ({ messageId }) => {
    const session = await requireSession();

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          senderId: true,
          threadId: true,
          parentId: true,
          thread: { select: { slug: true } },
        },
      });

      if (!message) {
        return { data: null, error: 'Message not found', errorCode: 'NOT_FOUND', ok: false };
      }

      let canDelete = message.senderId === session.user.id;
      if (!canDelete && message.threadId) {
        const memberRole = await getMemberRole(message.threadId, session.user.id);
        if (memberRole && ['OWNER', 'MODERATOR'].includes(memberRole.role)) {
          canDelete = true;
        }
      }

      if (!canDelete) {
        return {
          data: null,
          error: 'Insufficient permissions to delete this message',
          errorCode: 'FORBIDDEN',
          ok: false,
        };
      }

      await prisma.$transaction(async (tx) => {
        await tx.message.update({
          where: { id: messageId },
          data: { deletedAt: new Date() },
        });

        await tx.thread.update({
          where: { id: message.threadId },
          data: { messageCount: { decrement: 1 } },
        });

        if (message.parentId) {
          await tx.message.update({
            where: { id: message.parentId },
            data: { replyCount: { decrement: 1 } },
          });
        }
      });

      await logAction({
        action: 'MESSAGE_DELETED',
        entityType: 'Message',
        entityId: messageId,
        userId: session.user.id,
      });

      if (message.thread?.slug) {
        revalidatePath(`/thread/${message.thread.slug}`);
      }

      if (message.threadId) {
        infraMessageSideEffects.emitMessageDeleted(message.threadId, messageId, session.user.id);
      }

      return { data: null, error: null, errorCode: null, ok: true };
    } catch (error) {
      logger.error('[deleteMessage]', error);
      return { data: null, error: 'Something went wrong', errorCode: 'INTERNAL_ERROR', ok: false };
    }
  }
);
