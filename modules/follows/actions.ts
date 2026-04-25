'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import {
  followUser as followUserRepo,
  unfollowUser as unfollowUserRepo,
  getFollowers as getFollowersRepo,
  getFollowing as getFollowingRepo,
  isFollowing as isFollowingRepo,
} from './repository';
import { createNotification } from '@/modules/notifications/repository';
import { createServerAction } from '@/lib/utils/server-action';
import { userIdSchema } from '@/lib/utils/validation-common';

const followUserSchema = z.object({
  userId: z.string().cuid(),
});

const getFollowersSchema = z.object({
  userId: z.string().cuid(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

const getFollowingSchema = z.object({
  userId: z.string().cuid(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const followUser = createServerAction(
  { schema: followUserSchema, actionName: 'followUser', requireAuth: true },
  async ({ userId }) => {
    const session = await requireSession();

    if (session.user.id === userId) {
      return { data: null, error: 'Cannot follow yourself' };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      return { data: null, error: 'User not found' };
    }

    await followUserRepo(session.user.id, userId);

    await createNotification({
      userId,
      type: 'SYSTEM',
      title: 'New Follower',
      message: `${session.user.name || session.user.email} started following you`,
      data: {
        followerId: session.user.id,
        followerName: session.user.name,
      },
    });

    revalidatePath(`/user/${userId}`);
    revalidatePath('/dashboard');

    return { data: null, error: null };
  }
);

export const unfollowUser = createServerAction(
  { schema: followUserSchema, actionName: 'unfollowUser', requireAuth: true },
  async ({ userId }) => {
    const session = await requireSession();
    await unfollowUserRepo(session.user.id, userId);

    revalidatePath(`/user/${userId}`);
    revalidatePath('/dashboard');

    return { data: null, error: null };
  }
);

export const getFollowers = createServerAction(
  { schema: getFollowersSchema, actionName: 'getFollowers' },
  async ({ userId, limit, offset }) => {
    const result = await getFollowersRepo(userId, limit, offset);
    return { data: result, error: null };
  }
);

export const getFollowing = createServerAction(
  { schema: getFollowingSchema, actionName: 'getFollowing' },
  async ({ userId, limit, offset }) => {
    const result = await getFollowingRepo(userId, limit, offset);
    return { data: result, error: null };
  }
);

export const checkFollowingStatus = createServerAction(
  { schema: followUserSchema, actionName: 'checkFollowingStatus', requireAuth: true },
  async ({ userId }) => {
    const session = await requireSession();
    const isFollowing = await isFollowingRepo(session.user.id, userId);
    return { data: { isFollowing }, error: null };
  }
);
