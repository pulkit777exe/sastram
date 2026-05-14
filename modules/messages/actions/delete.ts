'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { createServerAction } from '@/lib/utils/server-action';
import { requireSession } from '@/modules/auth/session';
import { getMemberRole } from '@/modules/members/repository';
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
        include: { section: true },
      });

      if (!message) {
        return { data: null, error: 'Message not found', errorCode: 'NOT_FOUND', ok: false };
      }

      let canDelete = message.senderId === session.user.id;
      if (!canDelete && message.sectionId) {
        const memberRole = await getMemberRole(message.sectionId, session.user.id);
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

      await prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });

      await logAction({
        action: 'MESSAGE_DELETED',
        entityType: 'Message',
        entityId: messageId,
        userId: session.user.id,
      });

      if (message.section?.slug) {
        revalidatePath(`/dashboard/threads/thread/${message.section.slug}`);
      }

      if (message.sectionId) {
        infraMessageSideEffects.emitMessageDeleted(message.sectionId, messageId, session.user.id);
      }

      return { data: null, error: null, errorCode: null, ok: true };
    } catch (error) {
      logger.error('[deleteMessage]', error);
      return { data: null, error: 'Something went wrong', errorCode: 'INTERNAL_ERROR', ok: false };
    }
  }
);
