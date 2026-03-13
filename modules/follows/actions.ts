"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
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
  const parsed = followUserSchema.safeParse({ userId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    // Prevent self-follow
    if (session.user.id === parsed.data.userId) {
      return { data: null, error: "Cannot follow yourself" };
    }

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      return { data: null, error: "User not found" };
    }

    await followUserRepo(session.user.id, parsed.data.userId);

    // Create notification for the user being followed
    await createNotification({
      userId: parsed.data.userId,
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

    return { data: null, error: null };
  } catch (error) {
    console.error("[followUser]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function unfollowUser(userId: string) {
  const parsed = followUserSchema.safeParse({ userId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    await unfollowUserRepo(session.user.id, parsed.data.userId);

    revalidatePath(`/user/${userId}`);
    revalidatePath("/dashboard");

    return { data: null, error: null };
  } catch (error) {
    console.error("[unfollowUser]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getFollowers(userId: string, limit?: number, offset?: number) {
  const parsed = getFollowersSchema.safeParse({ userId, limit, offset });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const result = await getFollowersRepo(
      parsed.data.userId,
      parsed.data.limit,
      parsed.data.offset,
    );

    return { data: result, error: null };
  } catch (error) {
    console.error("[getFollowers]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getFollowing(userId: string, limit?: number, offset?: number) {
  const parsed = getFollowingSchema.safeParse({ userId, limit, offset });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const result = await getFollowingRepo(
      parsed.data.userId,
      parsed.data.limit,
      parsed.data.offset,
    );

    return { data: result, error: null };
  } catch (error) {
    console.error("[getFollowing]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function checkFollowingStatus(userId: string) {
  const parsed = followUserSchema.safeParse({ userId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    const isFollowing = await isFollowingRepo(
      session.user.id,
      parsed.data.userId,
    );
    return { data: { isFollowing }, error: null };
  } catch (error) {
    console.error("[checkFollowingStatus]", error);
    return { data: null, error: "Something went wrong" };
  }
}
