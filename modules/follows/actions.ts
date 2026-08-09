'use server';

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
import { createNotification } from '@/modules/notifications';
import { createServerAction } from '@/lib/utils/server-action';
import { actionFailure, actionSuccess } from '@/lib/actions/result';
import { paginationSchema, userIdSchema } from '@/lib/utils/validation-common';

const followListSchema = userIdSchema.merge(paginationSchema);

function revalidateFollowPaths(userId: string) {
  revalidatePath(`/user/${userId}`);
  revalidatePath('/dashboard');
}

export const followUser = createServerAction(
  { schema: userIdSchema, actionName: 'followUser' },
  async ({ userId }) => {
    const session = await requireSession();

    if (session.user.id === userId) {
      return actionFailure('VALIDATION_ERROR', 'Cannot follow yourself');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });

    if (!targetUser) {
      return actionFailure('NOT_FOUND', 'User not found');
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

    revalidateFollowPaths(userId);

    return actionSuccess(null);
  }
);

export const unfollowUser = createServerAction(
  { schema: userIdSchema, actionName: 'unfollowUser' },
  async ({ userId }) => {
    const session = await requireSession();
    await unfollowUserRepo(session.user.id, userId);

    revalidateFollowPaths(userId);

    return actionSuccess(null);
  }
);

export const getFollowers = createServerAction(
  { schema: followListSchema, actionName: 'getFollowers' },
  async ({ userId, limit, offset }) => {
    return actionSuccess(await getFollowersRepo(userId, limit, offset));
  }
);

export const getFollowing = createServerAction(
  { schema: followListSchema, actionName: 'getFollowing' },
  async ({ userId, limit, offset }) => {
    return actionSuccess(await getFollowingRepo(userId, limit, offset));
  }
);

export const checkFollowingStatus = createServerAction(
  { schema: userIdSchema, actionName: 'checkFollowingStatus' },
  async ({ userId }) => {
    const session = await requireSession();
    return actionSuccess({ isFollowing: await isFollowingRepo(session.user.id, userId) });
  }
);
