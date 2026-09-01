import { prisma } from '@/lib/infrastructure/prisma';
import { ProfilePrivacy } from '@prisma/client';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore } from '@/lib/db/pagination';

export const getPublicProfile = cache(async (userId: string, viewerId?: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      bio: true,
      location: true,
      website: true,
      twitter: true,
      github: true,
      image: true,
      bannerUrl: true,
      profilePrivacy: true,
      followerCount: true,
      followingCount: true,
      role: true,
      status: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });

  if (!user) return null;
  if (viewerId === userId) return user;

  if (user.profilePrivacy === ProfilePrivacy.PRIVATE) {
    return null;
  }

  if (user.profilePrivacy === ProfilePrivacy.FOLLOWERS_ONLY) {
    if (!viewerId) return null;
    const isFollowing = await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
    });
    if (!isFollowing) return null;
  }

  // Email is only ever exposed to the profile owner
  return { ...user, email: undefined };
});

export const getUserBootstrapProfile = cache(async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      image: true,
      role: true,
    },
  });
});

export const getUserThreads = cache(async (userId: string, limit: number = 20, offset: number = 0, viewerId?: string, viewerRole?: import('@prisma/client').Role) => {
  const { visibilityFilter } = await import('@/lib/thread-access');
  const vf = await visibilityFilter(viewerId, viewerRole ?? null);
  const where = { createdBy: userId, deletedAt: null, ...vf } as import('@prisma/client').Prisma.ThreadWhereInput;

  try {
    const [threads, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          messageCount: true,
          memberCount: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.thread.count({ where }),
    ]);

    return { threads, total, hasMore: computeHasMore(offset, limit, total) };
  } catch (error) {
    logger.error('[getUserThreads]', error);
    return { threads: [], total: 0, hasMore: false };
  }
});

export async function updateProfilePrivacy(userId: string, privacy: ProfilePrivacy) {
  return prisma.user.update({
    where: { id: userId },
    data: { profilePrivacy: privacy },
  });
}

export const getUserMessages = cache(async (userId: string, limit: number = 20, offset: number = 0) => {
  const where = { senderId: userId, deletedAt: null };

  try {
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        select: {
          id: true,
          content: true,
          createdAt: true,
          parentId: true,
          thread: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          parent: {
            select: {
              id: true,
              content: true,
              sender: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.message.count({ where }),
    ]);

    return { messages, total, hasMore: computeHasMore(offset, limit, total) };
  } catch (error) {
    logger.error('[getUserMessages]', error);
    return { messages: [], total: 0, hasMore: false };
  }
});
