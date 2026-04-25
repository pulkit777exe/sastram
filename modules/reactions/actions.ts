import { logger } from '@/lib/infrastructure/logger';
'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { addReaction, removeReaction, getMessageReactions } from '@/modules/reactions/repository';
import { emitReactionUpdate } from '@/modules/ws/publisher';
import { toggleReactionSchema, getReactionSummarySchema } from './schemas';

export async function toggleReaction(messageId: string, emoji: string) {
  const parsed = toggleReactionSchema.safeParse({ messageId, emoji });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    // Check if user already reacted with this emoji
    const existing = await prisma.reaction.findFirst({
      where: {
        messageId: parsed.data.messageId,
        userId: session.user.id,
        emoji: parsed.data.emoji,
      },
    });

    if (existing) {
      // Remove reaction
      await removeReaction(parsed.data.messageId, session.user.id, parsed.data.emoji);
    } else {
      // Add reaction
      await addReaction(parsed.data.messageId, session.user.id, parsed.data.emoji);
    }

    const [message, reactionCounts] = await Promise.all([
      prisma.message.findUnique({
        where: { id: parsed.data.messageId },
        select: { sectionId: true },
      }),
      prisma.reaction.groupBy({
        by: ['emoji'],
        where: { messageId: parsed.data.messageId },
        _count: { _all: true },
      }),
    ]);

    if (message?.sectionId) {
      const match = reactionCounts.find((r) => r.emoji === parsed.data.emoji);
      emitReactionUpdate(message.sectionId, {
        messageId: parsed.data.messageId,
        reactionType: parsed.data.emoji,
        count: match?._count._all ?? 0,
      });
    }

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[toggleReaction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getReactionSummary(messageId: string) {
  const parsed = getReactionSummarySchema.safeParse({ messageId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const reactions = await getMessageReactions(parsed.data.messageId);
    return { data: reactions, error: null };
  } catch (error) {
    logger.error('[getReactionSummary]', error);
    return { data: null, error: 'Something went wrong' };
  }
}
