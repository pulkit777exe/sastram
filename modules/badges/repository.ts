import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import type { Prisma } from '@prisma/client';

interface BadgeCriteria {
  type: string;
  count?: number;
  points?: number;
}

export const getUserBadges = cache(async (userId: string) => {
  try {
    const earnedBadges = await prisma.userBadgeEarned.findMany({
      where: { userId },
      include: {
        badge: true,
      },
      orderBy: {
        earnedAt: 'desc',
      },
    });

    return (earnedBadges ?? []).map((eb) => eb.badge);
  } catch (error) {
    logger.error('[getUserBadges]', error);
    return [];
  }
});

export async function awardBadge(userId: string, badgeId: string) {
  const existing = await prisma.userBadgeEarned.findUnique({
    where: {
      userId_badgeId: {
        userId,
        badgeId,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.userBadgeEarned.create({
    data: {
      userId,
      badgeId,
    },
  });
}

export async function checkAndAwardBadges(userId: string) {
  try {
    const [badges, threadCount, messageCount, followerCount, reputation, earnedBadges] =
      await Promise.all([
        prisma.userBadge.findMany(),
        prisma.thread.count({ where: { createdBy: userId } }),
        prisma.message.count({ where: { senderId: userId, deletedAt: null } }),
        prisma.userFollow.count({ where: { followingId: userId } }),
        prisma.userReputation.findUnique({ where: { userId } }),
        prisma.userBadgeEarned.findMany({
          where: { userId },
          select: { badgeId: true },
        }),
      ]);

    const earnedBadgeIds = new Set(earnedBadges.map((eb) => eb.badgeId));
    const reputationPoints = reputation?.points || 0;
    const awardedBadges: string[] = [];

    for (const badge of badges ?? []) {
      const criteria = badge.criteria as unknown as BadgeCriteria;
      let shouldAward = false;

      switch (criteria.type) {
        case 'first_thread':
          shouldAward = threadCount >= 1;
          break;
        case 'thread_milestone':
          shouldAward = threadCount >= (criteria.count || 10);
          break;
        case 'message_milestone':
          shouldAward = messageCount >= (criteria.count || 100);
          break;
        case 'follower_milestone':
          shouldAward = followerCount >= (criteria.count || 50);
          break;
        case 'reputation_milestone':
          shouldAward = reputationPoints >= (criteria.points || 1000);
          break;
      }

      if (shouldAward && !earnedBadgeIds.has(badge.id)) {
        await awardBadge(userId, badge.id);
        awardedBadges.push(badge.id);
      }
    }

    return awardedBadges;
  } catch (error) {
    logger.error('[checkAndAwardBadges]', error);
    return [];
  }
}

export const getAllBadges = cache(async () => {
  try {
    return (
      (await prisma.userBadge.findMany({
        orderBy: {
          createdAt: 'asc',
        },
      })) ?? []
    );
  } catch (error) {
    logger.error('[getAllBadges]', error);
    return [];
  }
});

export async function createBadge(
  name: string,
  description: string,
  icon: string | null,
  color: string,
  criteria: Prisma.InputJsonValue
) {
  return prisma.userBadge.create({
    data: {
      name,
      description,
      icon,
      color,
      criteria,
    },
  });
}
