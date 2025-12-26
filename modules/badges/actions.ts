"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { handleError } from "@/lib/utils/errors";
import {
  getUserBadges as getUserBadgesRepo,
  checkAndAwardBadges as checkAndAwardBadgesRepo,
  getAllBadges as getAllBadgesRepo,
} from "./repository";

export async function getUserBadgesAction(userId: string) {
  try {
    const badges = await getUserBadgesRepo(userId);
    return { success: true, data: badges };
  } catch (error) {
    return handleError(error);
  }
}

export async function checkAndAwardBadgesAction(userId: string) {
  try {
    const awardedBadges = await checkAndAwardBadgesRepo(userId);
    if (awardedBadges.length > 0) {
      revalidatePath(`/user/${userId}`);
    }
    return { success: true, data: awardedBadges };
  } catch (error) {
    return handleError(error);
  }
}

export async function getAllBadgesAction() {
  try {
    const badges = await getAllBadgesRepo();
    return { success: true, data: badges };
  } catch (error) {
    return handleError(error);
  }
}

