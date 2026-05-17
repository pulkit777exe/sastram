'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSectionMembership, requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { getMessageReactions } from '@/modules/reactions/repository';
import { emitReactionUpdate } from '@/modules/ws/publisher';
import { createServerAction } from '@/lib/utils/server-action';
import { messageIdSchema, threadIdSchema } from '@/lib/utils/validation-common';

const toggleReactionSchema = z.object({
  messageId: z.string().cuid(),
  emoji: z.string().min(1),
});

const getReactionSummarySchema = z.object({
  messageId: z.string().cuid(),
});

export const toggleReaction = createServerAction(
  { schema: toggleReactionSchema, actionName: 'toggleReaction' },
  async ({ messageId, emoji }) => {
    const session = await requireSession();

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { sectionId: true },
    });

    if (!message) {
      return { data: null, error: 'Message not found', errorCode: 'NOT_FOUND', ok: false };
    }

    try {
      await requireSectionMembership(message.sectionId, session.user.id);
    } catch {
      return { data: null, error: 'Forbidden', errorCode: 'FORBIDDEN', ok: false };
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.reaction.findFirst({
        where: { messageId, userId: session.user.id, emoji },
      });

      if (existing) {
        await tx.reaction.deleteMany({
          where: { messageId, userId: session.user.id, emoji },
        });
      } else {
        await tx.reaction.create({
          data: { messageId, userId: session.user.id, emoji },
        });
      }
    });

    const reactionCounts = await prisma.reaction.groupBy({
      by: ['emoji'],
      where: { messageId },
      _count: { _all: true },
    });

    const match = reactionCounts.find((r) => r.emoji === emoji);
    emitReactionUpdate(message.sectionId, {
      messageId,
      reactionType: emoji,
      count: match?._count._all ?? 0,
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const getReactionSummary = createServerAction(
  { schema: getReactionSummarySchema, actionName: 'getReactionSummary' },
  async ({ messageId }) => {
    const session = await requireSession();

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { sectionId: true },
    });

    if (!message) {
      return { data: null, error: 'Message not found', errorCode: 'NOT_FOUND', ok: false };
    }

    try {
      await requireSectionMembership(message.sectionId, session.user.id);
    } catch {
      return { data: null, error: 'Forbidden', errorCode: 'FORBIDDEN', ok: false };
    }

    const reactions = await getMessageReactions(messageId);
    return { data: reactions, error: null };
  }
);
