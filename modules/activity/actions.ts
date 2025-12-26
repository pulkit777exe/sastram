"use server";

import { requireSession } from "@/modules/auth/session";
import { handleError } from "@/lib/utils/errors";
import {
  recordActivity as recordActivityRepo,
  getUserActivity as getUserActivityRepo,
  getFollowedUsersActivity as getFollowedUsersActivityRepo,
} from "./repository";

export async function recordActivityAction(
  type: string,
  entityType: string,
  entityId: string,
  metadata?: any
) {
  const session = await requireSession();

  try {
    await recordActivityRepo({
      userId: session.user.id,
      type,
      entityType,
      entityId,
      metadata,
    });
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getUserActivityAction(userId: string, limit?: number, offset?: number) {
  try {
    const result = await getUserActivityRepo(userId, limit || 20, offset || 0);
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

export async function getFollowedUsersActivityAction(limit?: number, offset?: number) {
  const session = await requireSession();

  try {
    const result = await getFollowedUsersActivityRepo(session.user.id, limit || 20, offset || 0);
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

