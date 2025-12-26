"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import {
  followUser as followUserRepo,
  unfollowUser as unfollowUserRepo,
  getFollowers as getFollowersRepo,
  getFollowing as getFollowingRepo,
  isFollowing as isFollowingRepo,
} from "./repository";
import { followUserSchema, getFollowersSchema, getFollowingSchema } from "./schemas";
import { createNotification } from "@/modules/notifications/repository";

export async function followUser(userId: string) {
  const session = await requireSession();

  const validation = validate(followUserSchema, { userId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    // Prevent self-follow
    if (session.user.id === userId) {
      return { error: "Cannot follow yourself" };
    }

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      return { error: "User not found" };
    }

    await followUserRepo(session.user.id, userId);

    // Create notification for the user being followed
    await createNotification({
      userId,
      type: "SYSTEM",
      title: "New Follower",
      message: `${session.user.name || session.user.email} started following you`,
      data: {
        followerId: session.user.id,
        followerName: session.user.name,
      },
    });

    // Record activity (will be implemented in activity module)
    // await recordActivity({...});

    revalidatePath(`/user/${userId}`);
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function unfollowUser(userId: string) {
  const session = await requireSession();

  const validation = validate(followUserSchema, { userId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await unfollowUserRepo(session.user.id, userId);

    revalidatePath(`/user/${userId}`);
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getFollowers(userId: string, limit?: number, offset?: number) {
  const validation = validate(getFollowersSchema, { userId, limit, offset });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const result = await getFollowersRepo(
      validation.data.userId,
      validation.data.limit,
      validation.data.offset
    );

    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

export async function getFollowing(userId: string, limit?: number, offset?: number) {
  const validation = validate(getFollowingSchema, { userId, limit, offset });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const result = await getFollowingRepo(
      validation.data.userId,
      validation.data.limit,
      validation.data.offset
    );

    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

export async function checkFollowingStatus(userId: string) {
  const session = await requireSession();

  try {
    const isFollowing = await isFollowingRepo(session.user.id, userId);
    return { success: true, isFollowing };
  } catch (error) {
    return handleError(error);
  }
}

