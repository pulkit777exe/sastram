'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { createServerAction } from '@/lib/utils/server-action';
import { requireSession } from '@/modules/auth';
import { getMemberRole } from '@/modules/members';
import { logAction } from '@/modules/audit/repository';
import { deleteMessageSchema } from '@/modules/messages/schemas';
import { actionSuccess, actionFailure } from '@/lib/actions/result';

export const deleteMessage = createServerAction(
  { schema: deleteMessageSchema, actionName: 'deleteMessage' },
  async ({ messageId }) => {
    const session = await requireSession();

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          senderId: true,
          threadId: true,
          parentId: true,
          thread: { select: { slug: true } },
        },
      });

      if (!message) {
        return actionFailure('NOT_FOUND', 'Message not found');
      }

      const isAuthor = message.senderId === session.user.id;
      const memberRole = isAuthor ? null : await getMemberRole(message.threadId, session.user.id);

      if (!isAuthor && !['OWNER', 'MODERATOR'].includes(memberRole?.role ?? '')) {
        return actionFailure('FORBIDDEN', 'Insufficient permissions to delete this message');
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
        revalidatePath(`/dashboard/threads/${message.thread.slug}`);
      }

      return actionSuccess(null);
    } catch (error) {
      logger.error('[deleteMessage]', error);
      return actionFailure('INTERNAL_ERROR', 'Something went wrong');
    }
  }
);
