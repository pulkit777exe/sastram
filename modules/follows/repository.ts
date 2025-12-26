import { prisma } from "@/lib/infrastructure/prisma";

export async function followUser(followerId: string, followingId: string) {
  // Prevent self-follow
  if (followerId === followingId) {
    throw new Error("Cannot follow yourself");
  }

  // Check if already following
  const existing = await prisma.userFollow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });

  if (existing) {
    return existing;
  }

  // Create follow relationship and update counts in transaction
  return await prisma.$transaction(async (tx) => {
    const follow = await tx.userFollow.create({
      data: {
        followerId,
        followingId,
      },
    });

    // Update follower count for the user being followed
    await tx.user.update({
      where: { id: followingId },
      data: {
        followerCount: {
          increment: 1,
        },
      },
    });

    // Update following count for the follower
    await tx.user.update({
      where: { id: followerId },
      data: {
        followingCount: {
          increment: 1,
        },
      },
    });

    return follow;
  });
}

export async function unfollowUser(followerId: string, followingId: string) {
  const follow = await prisma.userFollow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });

  if (!follow) {
    return null;
  }

  // Delete follow relationship and update counts in transaction
  return await prisma.$transaction(async (tx) => {
    await tx.userFollow.delete({
      where: {
        id: follow.id,
      },
    });

    // Decrement follower count for the user being unfollowed
    await tx.user.update({
      where: { id: followingId },
      data: {
        followerCount: {
          decrement: 1,
        },
      },
    });

    // Decrement following count for the unfollower
    await tx.user.update({
      where: { id: followerId },
      data: {
        followingCount: {
          decrement: 1,
        },
      },
    });

    return follow;
  });
}

export async function getFollowers(userId: string, limit: number = 50, offset: number = 0) {
  const [follows, total] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followingId: userId },
      include: {
        follower: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            avatarUrl: true,
            bio: true,
            followerCount: true,
            followingCount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.userFollow.count({
      where: { followingId: userId },
    }),
  ]);

  return {
    followers: follows.map((f) => f.follower),
    total,
    hasMore: offset + limit < total,
  };
}

export async function getFollowing(userId: string, limit: number = 50, offset: number = 0) {
  const [follows, total] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followerId: userId },
      include: {
        following: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            avatarUrl: true,
            bio: true,
            followerCount: true,
            followingCount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.userFollow.count({
      where: { followerId: userId },
    }),
  ]);

  return {
    following: follows.map((f) => f.following),
    total,
    hasMore: offset + limit < total,
  };
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const follow = await prisma.userFollow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });

  return !!follow;
}

export async function getMutualFollows(userId1: string, userId2: string) {
  // Get users that both userId1 and userId2 follow
  const user1Following = await prisma.userFollow.findMany({
    where: { followerId: userId1 },
    select: { followingId: true },
  });

  const user2Following = await prisma.userFollow.findMany({
    where: { followerId: userId2 },
    select: { followingId: true },
  });

  const user1FollowingIds = new Set(user1Following.map((f) => f.followingId));
  const mutualIds = user2Following
    .map((f) => f.followingId)
    .filter((id) => user1FollowingIds.has(id));

  if (mutualIds.length === 0) {
    return [];
  }

  return prisma.user.findMany({
    where: {
      id: { in: mutualIds },
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      avatarUrl: true,
    },
  });
}

