'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { sanitizeContent } from '@/lib/services/content-safety';
import { createServerAction } from '@/lib/utils/server-action';
import { recordActivity } from '@/modules/activity/repository';
import { requireManageOrThrow, requireReadOrThrow } from '@/lib/thread-access';
import { actionSuccess, actionFailure } from '@/lib/utils/server-action';
import { AppError } from '@/lib/utils/errors';
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
        where: { id: messageId, deletedAt: null },
        select: { senderId: true, content: true, threadId: true },
      });

      if (!message) {
        return actionFailure('NOT_FOUND', 'Message not found');
      }

      if (message.senderId !== session.user.id) {
        return actionFailure('FORBIDDEN', 'You can only edit your own messages');
      }

      try {
        await requireReadOrThrow(message.threadId, session.user.id, session.user.role);
      } catch (error) {
        if (AppError.isAppError(error)) {
          if (error.code === 'NOT_FOUND') return actionFailure('NOT_FOUND', 'Thread not found');
          return actionFailure('FORBIDDEN', 'No access to this thread');
        }
        throw error;
      }

      const safeContent = sanitizeContent(content);
      await prisma.$transaction([
        prisma.messageEdit.create({
          data: {
            messageId,
            content: message.content,
          },
        }),
        prisma.message.update({
          where: { id: messageId },
          data: {
            content: safeContent,
            isEdited: true,
          },
        }),
      ]);

      // No path revalidation: the editing client applies the change in place
      // via onMessageUpdate, and other viewers get fresh data on navigation.
      return actionSuccess(null);
    } catch (error) {
      if (AppError.isAppError(error)) {
        if (error.code === 'NOT_FOUND') return actionFailure('NOT_FOUND', 'Thread not found');
        if (error.code === 'FORBIDDEN') return actionFailure('FORBIDDEN', error.message);
      }
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
        },
      });

      if (!message) {
        return actionFailure('NOT_FOUND', 'Message not found');
      }

      // Management gate resolves the thread ONCE (creator or global
      // MODERATOR/ADMIN — the same set the old OWNER/MODERATOR role check
      // admitted, since OWNER was the creator and MODERATOR was global).
      await requireManageOrThrow(message.threadId, session.user.id, session.user.role);

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

      await recordActivity({
        userId: session.user.id,
        type: 'MESSAGE_UPDATED',
        entityType: 'Message',
        entityId: messageId,
      });

      // No path revalidation: the pinning client updates the pinned state in
      // place optimistically (with rollback on failure).
      return actionSuccess(null);
    } catch (error) {
      if (AppError.isAppError(error)) {
        if (error.code === 'NOT_FOUND') return actionFailure('NOT_FOUND', 'Thread not found');
        if (error.code === 'FORBIDDEN')
          return actionFailure('FORBIDDEN', 'Insufficient permissions. Only moderators and owners can pin messages.');
      }
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

      await requireReadOrThrow(message.threadId, session.user.id, session.user.role);

      const edits = await prisma.messageEdit.findMany({
        where: { messageId },
        orderBy: { editedAt: 'desc' },
      });

      return actionSuccess(edits);
    } catch (error) {
      if (AppError.isAppError(error)) {
        if (error.code === 'NOT_FOUND') return actionFailure('NOT_FOUND', 'Thread not found');
        if (error.code === 'FORBIDDEN') return actionFailure('FORBIDDEN', 'No access to this thread');
      }
      logger.error('[getMessageEditHistory]', error);
      return actionFailure('INTERNAL_ERROR', 'Something went wrong');
    }
  }
);
