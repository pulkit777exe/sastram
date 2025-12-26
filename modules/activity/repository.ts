import { prisma } from "@/lib/infrastructure/prisma";

export async function recordActivity(data: {
  userId: string;
  type: string;
  entityType: string;
  entityId: string;
  metadata?: any;
}) {
  return prisma.userActivity.create({
    data: {
      userId: data.userId,
      type: data.type,
      entityType: data.entityType,
      entityId: data.entityId,
      metadata: data.metadata as any,
    },
  });
}

export async function getUserActivity(
  userId: string,
  limit: number = 20,
  offset: number = 0
) {
  const [activities, total] = await Promise.all([
    prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.userActivity.count({
      where: { userId },
    }),
  ]);

  return {
    activities,
    total,
    hasMore: offset + limit < total,
  };
}

export async function getFollowedUsersActivity(
  userId: string,
  limit: number = 20,
  offset: number = 0
) {
  // Get users that the current user follows
  const following = await prisma.userFollow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });

  const followingIds = following.map((f) => f.followingId);

  if (followingIds.length === 0) {
    return {
      activities: [],
      total: 0,
      hasMore: false,
    };
  }

  const [activities, total] = await Promise.all([
    prisma.userActivity.findMany({
      where: {
        userId: { in: followingIds },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.userActivity.count({
      where: {
        userId: { in: followingIds },
      },
    }),
  ]);

  return {
    activities,
    total,
    hasMore: offset + limit < total,
  };
}

