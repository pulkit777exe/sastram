import { prisma } from "@/lib/infrastructure/prisma";

export async function getUserBadges(userId: string) {
  const earnedBadges = await prisma.userBadgeEarned.findMany({
    where: { userId },
    include: {
      badge: true,
    },
    orderBy: {
      earnedAt: "desc",
    },
  });

  return earnedBadges.map((eb) => eb.badge);
}

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
  const badges = await prisma.userBadge.findMany();
  const awardedBadges: string[] = [];

  for (const badge of badges) {
    const criteria = badge.criteria as any;
    let shouldAward = false;

    // Check criteria based on badge type
    if (criteria.type === "first_thread") {
      const threadCount = await prisma.section.count({
        where: {
          createdBy: userId,
          deletedAt: null,
        },
      });
      shouldAward = threadCount >= 1;
    } else if (criteria.type === "thread_milestone") {
      const threadCount = await prisma.section.count({
        where: {
          createdBy: userId,
          deletedAt: null,
        },
      });
      shouldAward = threadCount >= (criteria.count || 10);
    } else if (criteria.type === "message_milestone") {
      const messageCount = await prisma.message.count({
        where: {
          senderId: userId,
          deletedAt: null,
        },
      });
      shouldAward = messageCount >= (criteria.count || 100);
    } else if (criteria.type === "follower_milestone") {
      const followerCount = await prisma.userFollow.count({
        where: {
          followingId: userId,
        },
      });
      shouldAward = followerCount >= (criteria.count || 50);
    } else if (criteria.type === "reputation_milestone") {
      const reputation = await prisma.userReputation.findUnique({
        where: { userId },
      });
      const points = reputation?.points || 0;
      shouldAward = points >= (criteria.points || 1000);
    }

    if (shouldAward) {
      const existing = await prisma.userBadgeEarned.findUnique({
        where: {
          userId_badgeId: {
            userId,
            badgeId: badge.id,
          },
        },
      });

      if (!existing) {
        await awardBadge(userId, badge.id);
        awardedBadges.push(badge.id);
      }
    }
  }

  return awardedBadges;
}

export async function getAllBadges() {
  return prisma.userBadge.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function createBadge(
  name: string,
  description: string,
  icon: string | null,
  color: string,
  criteria: any
) {
  return prisma.userBadge.create({
    data: {
      name,
      description,
      icon,
      color,
      criteria: criteria as any,
    },
  });
}

