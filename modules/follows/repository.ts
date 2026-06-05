import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore } from '@/lib/db/pagination';

export async function followUser(followerId: string, followingId: string) {
  // Prevent self-follow
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself');
  }

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.userFollow.findUnique({
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
  return await prisma.$transaction(async (tx) => {
    const follow = await tx.userFollow.findUnique({
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

export const getFollowers = cache(async (userId: string, limit: number = 50, offset: number = 0) => {
  try {
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
              bio: true,
              followerCount: true,
              followingCount: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userFollow.count({
        where: { followingId: userId },
      }),
    ]);

    return {
      followers: (follows ?? []).map((follow) => follow.follower),
      total,
      hasMore: computeHasMore(offset, limit, total),
    };
  } catch (error) {
    logger.error('[getFollowers]', error);
    return {
      followers: [],
      total: 0,
      hasMore: false,
    };
  }
});

export const getFollowing = cache(async (userId: string, limit: number = 50, offset: number = 0) => {
  try {
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
              bio: true,
              followerCount: true,
              followingCount: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userFollow.count({
        where: { followerId: userId },
      }),
    ]);

    return {
      following: (follows ?? []).map((follow) => follow.following),
      total,
      hasMore: computeHasMore(offset, limit, total),
    };
  } catch (error) {
    logger.error('[getFollowing]', error);
    return {
      following: [],
      total: 0,
      hasMore: false,
    };
  }
});

export const isFollowing = cache(async (followerId: string, followingId: string): Promise<boolean> => {
  const follow = await prisma.userFollow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });

  return !!follow;
});
