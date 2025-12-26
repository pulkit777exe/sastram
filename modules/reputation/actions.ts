"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { handleError } from "@/lib/utils/errors";
import {
  getUserReputation as getUserReputationRepo,
  awardReputation as awardReputationRepo,
  syncReputationPoints as syncReputationPointsRepo,
} from "./repository";

export async function getUserReputationAction(userId: string) {
  try {
    const reputation = await getUserReputationRepo(userId);
    return { success: true, data: reputation };
  } catch (error) {
    return handleError(error);
  }
}

export async function awardReputationAction(
  userId: string,
  points: number,
  reason: string
) {
  const session = await requireSession();

  // Only admins can manually award reputation
  if (session.user.role !== "ADMIN") {
    return { error: "Unauthorized" };
  }

  try {
    await awardReputationRepo(userId, points, reason);
    revalidatePath(`/user/${userId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function syncReputationPointsAction(userId: string) {
  try {
    await syncReputationPointsRepo(userId);
    revalidatePath(`/user/${userId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

// Helper function to award reputation for common actions
export async function awardReputationForAction(
  userId: string,
  action: "thread_created" | "message_posted" | "reaction_received" | "follower_gained"
) {
  const pointsMap = {
    thread_created: 10,
    message_posted: 1,
    reaction_received: 5,
    follower_gained: 2,
  };

  const points = pointsMap[action];
  if (points) {
    await awardReputationRepo(userId, points, action);
  }
}

