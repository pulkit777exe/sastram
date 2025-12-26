"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import {
  bookmarkThread as bookmarkThreadRepo,
  unbookmarkThread as unbookmarkThreadRepo,
  getUserBookmarks as getUserBookmarksRepo,
  isBookmarked as isBookmarkedRepo,
} from "./repository";
import { z } from "zod";

const bookmarkSchema = z.object({
  threadId: z.string().cuid("Invalid thread ID"),
});

export async function toggleBookmark(threadId: string) {
  const session = await requireSession();

  const validation = validate(bookmarkSchema, { threadId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const isBookmarked = await isBookmarkedRepo(session.user.id, threadId);

    if (isBookmarked) {
      await unbookmarkThreadRepo(session.user.id, threadId);
    } else {
      await bookmarkThreadRepo(session.user.id, threadId);
    }

    revalidatePath("/dashboard/bookmarks");
    revalidatePath(`/dashboard/threads/thread/${threadId}`);

    return { success: true, isBookmarked: !isBookmarked };
  } catch (error) {
    return handleError(error);
  }
}

export async function getBookmarkedThreads(limit?: number, offset?: number) {
  try {
    const session = await requireSession();
    const result = await getUserBookmarksRepo(session.user.id, limit || 20, offset || 0);
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

export async function checkBookmarkStatus(threadId: string) {
  const session = await requireSession();

  try {
    const isBookmarked = await isBookmarkedRepo(session.user.id, threadId);
    return { success: true, isBookmarked };
  } catch (error) {
    return handleError(error);
  }
}

