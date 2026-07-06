import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

type UserPreview = {
  id: string;
  name: string | null;
  image: string | null;
};

export async function addReaction(messageId: string, userId: string, emoji: string) {
  return prisma.reaction.create({
    data: {
      messageId,
      userId,
      emoji,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });
}

export async function removeReaction(messageId: string, userId: string, emoji: string) {
  return prisma.reaction.deleteMany({
    where: {
      messageId,
      userId,
      emoji,
    },
  });
}

export async function getMessageReactions(messageId: string, userId?: string | null) {
  try {
    const reactions = await prisma.reaction.findMany({
      where: { messageId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    let userEmojis: Set<string> = new Set();
    if (userId) {
      const userReactions = await prisma.reaction.findMany({
        where: { messageId, userId },
        select: { emoji: true },
      });
      userEmojis = new Set(userReactions.map((r) => r.emoji));
    }

    const grouped = (reactions ?? []).reduce(
      (acc, reaction) => {
        if (!acc[reaction.emoji]) {
          acc[reaction.emoji] = {
            emoji: reaction.emoji,
            count: 0,
            users: [],
            hasReacted: false,
          };
        }
        acc[reaction.emoji].count++;
        acc[reaction.emoji].users.push(reaction.user);
        acc[reaction.emoji].hasReacted = userEmojis.has(reaction.emoji);
        return acc;
      },
      {} as Record<
        string,
        { emoji: string; count: number; users: UserPreview[]; hasReacted: boolean }
      >
    );

    return Object.values(grouped);
  } catch (error) {
    logger.error('[getMessageReactions]', error);
    return [];
  }
}

export async function getUserReaction(messageId: string, userId: string, emoji: string) {
  return prisma.reaction.findFirst({
    where: {
      messageId,
      userId,
      emoji,
    },
  });
}
