'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import {
  followUser as followUserRepo,
  unfollowUser as unfollowUserRepo,
  getFollowers as getFollowersRepo,
  getFollowing as getFollowingRepo,
  isFollowing as isFollowingRepo,
} from './repository';
import { dispatch } from '@/modules/notifications/dispatcher';
import { createServerAction } from '@/lib/utils/server-action';
import { actionFailure, actionSuccess } from '@/lib/actions/result';
import { paginationSchema, userIdSchema } from '@/lib/utils/validation-common';

const followListSchema = userIdSchema.merge(paginationSchema);

function revalidateFollowPaths(userId: string) {
  revalidatePath(`/user/${userId}`);
  revalidatePath('/dashboard');
}

function getFollowerDisplayName(user: { name: string | null; email: string }): string {
  return user.name ?? user.email;
}

async function assertFollowTargetExists(userId: string) {
  const targetUser = await prisma.user.findUnique({ where: { id: userId, deletedAt: null }, select: { id: true } });
  return targetUser !== null;
}

export const followUser = createServerAction(
  { schema: userIdSchema, actionName: 'followUser' },
  async ({ userId }) => {
    const session = await requireSession();

    if (session.user.id === userId) {
      return actionFailure('VALIDATION_ERROR', 'Cannot follow yourself');
    }

    const targetExists = await assertFollowTargetExists(userId);
    if (!targetExists) {
      return actionFailure('NOT_FOUND', 'User not found');
    }

    await followUserRepo(session.user.id, userId);

    const followerDisplayName = getFollowerDisplayName(session.user);

    await dispatch({
      recipients: { userIds: [userId] },
      category: 'SYSTEM',
      title: 'New Follower',
      message: `${followerDisplayName} started following you`,
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
