'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireThreadMembership, requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { getMessageReactions } from '@/modules/reactions/repository';
import { emitReactionUpdate } from '@/modules/ws';
import { createServerAction } from '@/lib/utils/server-action';
import { ROUTES } from '@/lib/config/routes';
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
      select: { threadId: true },
    });

    if (!message) {
      return { data: null, error: 'Message not found', errorCode: 'NOT_FOUND', ok: false };
    }

    try {
      await requireThreadMembership(message.threadId, session.user.id);
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

      // Recalculate likeCount from all unique users who reacted
      const uniqueUserCount = await tx.reaction.groupBy({
        by: ['userId'],
        where: { messageId },
      });

      await tx.message.update({
        where: { id: messageId },
        data: { likeCount: uniqueUserCount.length },
      });
    });

    const reactionCounts = await prisma.reaction.groupBy({
      by: ['emoji'],
      where: { messageId },
      _count: { _all: true },
    });

    const match = reactionCounts.find((r) => r.emoji === emoji);
    emitReactionUpdate(message.threadId, {
      messageId,
      reactionType: emoji,
      count: match?._count._all ?? 0,
    });

    revalidatePath(ROUTES.DASHBOARD_THREADS);
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const getReactionSummary = createServerAction(
  { schema: getReactionSummarySchema, actionName: 'getReactionSummary' },
  async ({ messageId }) => {
    const session = await requireSession();

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { threadId: true },
    });

    if (!message) {
      return { data: null, error: 'Message not found', errorCode: 'NOT_FOUND', ok: false };
    }

    try {
      await requireThreadMembership(message.threadId, session.user.id);
    } catch {
      return { data: null, error: 'Forbidden', errorCode: 'FORBIDDEN', ok: false };
    }

    const reactions = await getMessageReactions(messageId, session.user.id);
    return { data: reactions, error: null, ok: true, errorCode: null };
  }
);
