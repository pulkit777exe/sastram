import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore } from '@/lib/db/pagination';

const FOLLOW_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  bio: true,
  followerCount: true,
  followingCount: true,
} as const;

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.userFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    // Already following — don't double-count
    if (existing) return existing;

    const follow = await tx.userFollow.create({
      data: { followerId, followingId },
    });

    await tx.user.update({
      where: { id: followerId },
      data: { followingCount: { increment: 1 } },
    });

    await tx.user.update({
      where: { id: followingId },
      data: { followerCount: { increment: 1 } },
    });

    return follow;
  });
}

export async function unfollowUser(followerId: string, followingId: string) {
  const follow = await prisma.userFollow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  });

  if (!follow) return null;

  return prisma.$transaction(async (tx) => {
    await tx.userFollow.delete({ where: { id: follow.id } });

    await tx.user.update({
      where: { id: followingId },
      data: { followerCount: { decrement: 1 } },
    });

    await tx.user.update({
      where: { id: followerId },
      data: { followingCount: { decrement: 1 } },
    });

    return follow;
  });
}

export async function getFollowers(userId: string, limit: number = 50, offset: number = 0) {
  try {
    const [follows, total] = await Promise.all([
      prisma.userFollow.findMany({
        where: { followingId: userId },
        include: { follower: { select: FOLLOW_USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userFollow.count({ where: { followingId: userId } }),
    ]);

    return {
      followers: follows.map((follow) => follow.follower),
      total,
      hasMore: computeHasMore(offset, limit, total),
    };
  } catch (error) {
    logger.error('[getFollowers]', error);
    return { followers: [], total: 0, hasMore: false };
  }
}

export async function getFollowing(userId: string, limit: number = 50, offset: number = 0) {
  try {
    const [follows, total] = await Promise.all([
      prisma.userFollow.findMany({
        where: { followerId: userId },
        include: { following: { select: FOLLOW_USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userFollow.count({ where: { followerId: userId } }),
    ]);

    return {
      following: follows.map((follow) => follow.following),
      total,
      hasMore: computeHasMore(offset, limit, total),
    };
  } catch (error) {
    logger.error('[getFollowing]', error);
    return { following: [], total: 0, hasMore: false };
  }
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const follow = await prisma.userFollow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { id: true },
  });

  return follow !== null;
}
