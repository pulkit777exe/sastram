import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma, ProfilePrivacy } from '@prisma/client';
import type { Role } from '@prisma/client';
import { cache } from 'react';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore } from '@/lib/db/pagination';
import { visibilityFilter } from '@/lib/thread-access';

const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
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
  createdAt: true,
} as const;

const USER_THREAD_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  messageCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

const USER_BOOTSTRAP_SELECT = { id: true, name: true, image: true, role: true } as const;

const PROFILE_HEADER_SELECT = {
  id: true,
  name: true,
  bio: true,
  location: true,
  website: true,
  twitter: true,
  github: true,
  image: true,
  bannerUrl: true,
  followerCount: true,
  followingCount: true,
  createdAt: true,
  profilePrivacy: true,
} as const;

type ProfileHeaderRow = Prisma.UserGetPayload<{ select: typeof PROFILE_HEADER_SELECT }>;
export type ProfileHeaderData = Omit<ProfileHeaderRow, 'profilePrivacy'>;

function canViewFullProfile(
  privacy: ProfilePrivacy,
  isOwnProfile: boolean,
  isFollowing: boolean
): boolean {
  if (isOwnProfile) return true;
  if (privacy === ProfilePrivacy.PUBLIC) return true;
  return privacy === ProfilePrivacy.FOLLOWERS_ONLY && isFollowing;
}

/**
 * Single read for the profile page: returns header data plus the viewer's
 * relationship to it. Private profiles keep name/avatar but never receive bio,
 * links, stats, or any account fields.
 */
export const getProfileForViewer = cache(async (userId: string, viewerId: string) => {
  const row = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: PROFILE_HEADER_SELECT,
  });

  if (!row) return null;

  const isOwnProfile = userId === viewerId;
  const isFollowing =
    !isOwnProfile &&
    (await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
      select: { id: true },
    })) !== null;
  const canViewFull = canViewFullProfile(row.profilePrivacy, isOwnProfile, isFollowing);

  // Build the payload field-by-field. Spreading the Prisma row would silently
  // forward any future column added to PROFILE_HEADER_SELECT to the client.
  const publicFields: ProfileHeaderData = {
    id: row.id,
    name: row.name,
    bio: row.bio,
    location: row.location,
    website: row.website,
    twitter: row.twitter,
    github: row.github,
    image: row.image,
    bannerUrl: row.bannerUrl,
    followerCount: row.followerCount,
    followingCount: row.followingCount,
    createdAt: row.createdAt,
  };
  const profile: ProfileHeaderData = canViewFull
    ? publicFields
    : {
        ...publicFields,
        bio: null,
        location: null,
        website: null,
        twitter: null,
        github: null,
        bannerUrl: null,
        followerCount: 0,
        followingCount: 0,
      };

  return { profile, isOwnProfile, isFollowing, canViewFull };
});

export const getPublicProfile = cache(async (userId: string, viewerId?: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: USER_PUBLIC_SELECT,
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

  return user;
});

export const getUserBootstrapProfile = cache(async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: USER_BOOTSTRAP_SELECT,
  });
});

export const getUserThreads = cache(async (userId: string, limit: number = 20, offset: number = 0, viewerId?: string, viewerRole?: Role) => {
  const vf = await visibilityFilter(viewerId, viewerRole ?? null);
  const where: Prisma.ThreadWhereInput = { createdBy: userId, deletedAt: null, ...vf };

  try {
    const [threads, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        select: USER_THREAD_SELECT,
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
