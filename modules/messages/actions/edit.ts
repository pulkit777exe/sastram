'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { sanitizeContent } from '@/lib/services/content-safety';
import { createServerAction } from '@/lib/utils/server-action';
import { getMemberRole } from '@/modules/members';
import { logAction } from '@/modules/audit/repository';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { actionSuccess, actionFailure } from '@/lib/actions/result';
import {
  editMessageSchema,
  pinMessageSchema,
  getMessageEditHistorySchema,
} from '@/modules/messages/schemas';

export const editMessage = createServerAction(
  { schema: editMessageSchema, actionName: 'editMessage' },
  async ({ messageId, content }) => {
    const session = await requireSession();

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { senderId: true, content: true },
      });

      if (!message) {
        return actionFailure('NOT_FOUND', 'Message not found');
      }

      if (message.senderId !== session.user.id) {
        return actionFailure('FORBIDDEN', 'You can only edit your own messages');
      }

      await prisma.messageEdit.create({
        data: {
          messageId,
          content: message.content,
        },
      });

      const safeContent = sanitizeContent(content);
      await prisma.message.update({
        where: { id: messageId },
        data: {
          content: safeContent,
          isEdited: true,
        },
      });

      revalidatePath('/dashboard/threads');
      return actionSuccess(null);
    } catch (error) {
      logger.error('[editMessage]', error);
      return actionFailure('INTERNAL_ERROR', 'Something went wrong');
    }
  }
);

export const pinMessage = createServerAction(
  { schema: pinMessageSchema, actionName: 'pinMessage' },
  async ({ messageId }) => {
    const session = await requireSession();

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          isPinned: true,
          threadId: true,
          thread: {
            select: { slug: true },
          },
        },
      });

      if (!message) {
        return actionFailure('NOT_FOUND', 'Message not found');
      }

      const memberRole = await getMemberRole(message.threadId, session.user.id);
      if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
        return actionFailure('FORBIDDEN', 'Insufficient permissions. Only moderators and owners can pin messages.');
      }

      const shouldPin = !message.isPinned;

      await prisma.$transaction(async (tx) => {
        // Only one pinned message per thread — unpin the incumbent first.
        if (shouldPin) {
          await tx.message.updateMany({
            where: { threadId: message.threadId, isPinned: true },
            data: { isPinned: false },
          });
        }

        await tx.message.update({
          where: { id: messageId },
          data: { isPinned: shouldPin },
        });
      });

      await logAction({
        action: 'MESSAGE_UPDATED',
        entityType: 'Message',
        entityId: messageId,
        userId: session.user.id,
      });

      revalidatePath(`/dashboard/threads/${message.thread?.slug}`);
      return actionSuccess(null);
    } catch (error) {
      logger.error('[pinMessage]', error);
      return actionFailure('INTERNAL_ERROR', 'Something went wrong');
    }
  }
);

export const getMessageEditHistory = createServerAction(
  { schema: getMessageEditHistorySchema, actionName: 'getMessageEditHistory' },
  async ({ messageId }) => {
    const session = await requireSession();

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { threadId: true },
      });

      if (!message) {
        return actionFailure('NOT_FOUND', 'Message not found');
      }

      await requireThreadAccessOrThrow(message.threadId, session.user.id, session.user.role);

      const edits = await prisma.messageEdit.findMany({
        where: { messageId },
        orderBy: { editedAt: 'desc' },
      });

      return actionSuccess(edits);
    } catch (error) {
      logger.error('[getMessageEditHistory]', error);
      return actionFailure('INTERNAL_ERROR', 'Something went wrong');
    }
  }
);
