'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { addReaction, removeReaction, getMessageReactions } from '@/modules/reactions/repository';
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
  { schema: toggleReactionSchema, actionName: 'toggleReaction', requireAuth: true },
  async ({ messageId, emoji }) => {
    const session = await requireSession();

    // Check if user already reacted with this emoji
    const existing = await prisma.reaction.findFirst({
      where: {
        messageId,
        userId: session.user.id,
        emoji,
      },
    });

    if (existing) {
      await removeReaction(messageId, session.user.id, emoji);
    } else {
      await addReaction(messageId, session.user.id, emoji);
    }

    const [message, reactionCounts] = await Promise.all([
      prisma.message.findUnique({
        where: { id: messageId },
        select: { sectionId: true },
      }),
      prisma.reaction.groupBy({
        by: ['emoji'],
        where: { messageId },
        _count: { _all: true },
      }),
    ]);

    if (message?.sectionId) {
      const match = reactionCounts.find((r) => r.emoji === emoji);
      emitReactionUpdate(message.sectionId, {
        messageId,
        reactionType: emoji,
        count: match?._count._all ?? 0,
      });
    }

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const getReactionSummary = createServerAction(
  { schema: getReactionSummarySchema, actionName: 'getReactionSummary' },
  async ({ messageId }) => {
    const reactions = await getMessageReactions(messageId);
    return { data: reactions, error: null };
  }
);
