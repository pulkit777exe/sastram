import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import type { ReactionSummary } from './types';

const userPreview = { select: { id: true, name: true, image: true } };

export async function addReaction(messageId: string, userId: string, emoji: string) {
  return prisma.reaction.create({
    data: { messageId, userId, emoji },
    include: { user: userPreview },
  });
}

export async function removeReaction(messageId: string, userId: string, emoji: string) {
  return prisma.reaction.deleteMany({
    where: { messageId, userId, emoji },
  });
}

export async function getMessageReactions(
  messageId: string,
  userId?: string | null
): Promise<ReactionSummary[]> {
  try {
    const reactions = await prisma.reaction.findMany({
      where: { messageId },
      include: { user: userPreview },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = new Map<string, ReactionSummary>();
    for (const reaction of reactions) {
      let entry = grouped.get(reaction.emoji);
      if (!entry) {
        entry = { emoji: reaction.emoji, count: 0, users: [], hasReacted: false };
        grouped.set(reaction.emoji, entry);
      }
      entry.count++;
      entry.users.push(reaction.user);
      if (reaction.user.id === userId) entry.hasReacted = true;
    }

    return [...grouped.values()];
  } catch (error) {
    logger.error('[getMessageReactions]', error);
    return [];
  }
}

export async function getUserReaction(messageId: string, userId: string, emoji: string) {
  return prisma.reaction.findFirst({
    where: { messageId, userId, emoji },
  });
}
