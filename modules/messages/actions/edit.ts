'use server';

import { auth } from '@/lib/services/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { filterBadLanguage } from '@/lib/services/content-safety';
import { createServerAction } from '@/lib/utils/server-action';
import { getMemberRole } from '@/modules/members';
import { logAction } from '@/modules/audit/repository';
import { infraMessageSideEffects } from '@/modules/messages/adapters/infra-side-effects';
import {
  editMessageSchema,
  pinMessageSchema,
  getMessageEditHistorySchema,
} from '@/modules/messages/schemas';

export const editMessage = createServerAction(
  { schema: editMessageSchema, actionName: 'editMessage' },
  async ({ messageId, content }) => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: 'Authentication required', errorCode: 'AUTH_REQUIRED', ok: false };
    }

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { senderId: true, content: true, sectionId: true },
      });

      if (!message) {
        return { data: null, error: 'Message not found', errorCode: 'NOT_FOUND', ok: false };
      }

      if (message.senderId !== session.user.id) {
        return {
          data: null,
          error: 'You can only edit your own messages',
          errorCode: 'FORBIDDEN',
          ok: false,
        };
      }

      await prisma.messageEdit.create({
        data: {
          messageId,
          content: message.content,
        },
      });

      const safeContent = filterBadLanguage(content);
      await prisma.message.update({
        where: { id: messageId },
        data: {
          content: safeContent,
          isEdited: true,
        },
      });

      revalidatePath('/dashboard/threads');
      return { data: null, error: null, errorCode: null, ok: true };
    } catch (error) {
      logger.error('[editMessage]', error);
      return { data: null, error: 'Something went wrong', errorCode: 'INTERNAL_ERROR', ok: false };
    }
  }
);

export const pinMessage = createServerAction(
  { schema: pinMessageSchema, actionName: 'pinMessage' },
  async ({ messageId }) => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: 'Authentication required', errorCode: 'AUTH_REQUIRED', ok: false };
    }

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          isPinned: true,
          sectionId: true,
          section: {
            select: { slug: true },
          },
        },
      });

      if (!message) {
        return { data: null, error: 'Message not found', errorCode: 'NOT_FOUND', ok: false };
      }

      const memberRole = await getMemberRole(message.sectionId, session.user.id);
      if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
        return {
          data: null,
          error: 'Insufficient permissions. Only moderators and owners can pin messages.',
          errorCode: 'FORBIDDEN',
          ok: false,
        };
      }

      const shouldPin = !message.isPinned;

      const previouslyPinned = shouldPin
        ? await prisma.message.findFirst({
            where: {
              sectionId: message.sectionId,
              isPinned: true,
              id: { not: messageId },
            },
            select: { id: true },
          })
        : null;

      await prisma.$transaction(async (tx) => {
        if (shouldPin) {
          await tx.message.updateMany({
            where: { sectionId: message.sectionId, isPinned: true },
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

      infraMessageSideEffects.emitPinUpdate(message.sectionId, { messageId, isPinned: shouldPin });

      if (previouslyPinned?.id) {
        infraMessageSideEffects.emitPinUpdate(message.sectionId, {
          messageId: previouslyPinned.id,
          isPinned: false,
        });
      }

      revalidatePath(`/dashboard/threads/thread/${message.section?.slug}`);
      return { data: null, error: null, errorCode: null, ok: true };
    } catch (error) {
      logger.error('[pinMessage]', error);
      return { data: null, error: 'Something went wrong', errorCode: 'INTERNAL_ERROR', ok: false };
    }
  }
);

export const getMessageEditHistory = createServerAction(
  { schema: getMessageEditHistorySchema, actionName: 'getMessageEditHistory' },
  async ({ messageId }) => {
    try {
      const edits = await prisma.messageEdit.findMany({
        where: { messageId },
        orderBy: { editedAt: 'desc' },
      });

      return { data: edits ?? [], error: null, errorCode: null, ok: true };
    } catch (error) {
      logger.error('[getMessageEditHistory]', error);
      return {
        data: null,
        error: 'Something went wrong',
        errorCode: 'INTERNAL_ERROR',
        ok: false,
      };
    }
  }
);
