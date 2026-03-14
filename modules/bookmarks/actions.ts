"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
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

const paginationSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export async function toggleBookmark(threadId: string) {
  const parsed = bookmarkSchema.safeParse({ threadId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    const isBookmarked = await isBookmarkedRepo(
      session.user.id,
      parsed.data.threadId,
    );

    if (isBookmarked) {
      await unbookmarkThreadRepo(session.user.id, parsed.data.threadId);
    } else {
      await bookmarkThreadRepo(session.user.id, parsed.data.threadId);
    }

    revalidatePath("/dashboard/bookmarks");
    revalidatePath(`/dashboard/threads/thread/${parsed.data.threadId}`);

    return { data: { isBookmarked: !isBookmarked }, error: null };
  } catch (error) {
    console.error("[toggleBookmark]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getBookmarkedThreads(limit?: number, offset?: number) {
  const parsed = paginationSchema.safeParse({ limit, offset });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    const result = await getUserBookmarksRepo(
      session.user.id,
      parsed.data.limit || 20,
      parsed.data.offset || 0,
    );
    return { data: result, error: null };
  } catch (error) {
    console.error("[getBookmarkedThreads]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function checkBookmarkStatus(threadId: string) {
  const parsed = bookmarkSchema.safeParse({ threadId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    const isBookmarked = await isBookmarkedRepo(
      session.user.id,
      parsed.data.threadId,
    );
    return { data: { isBookmarked }, error: null };
  } catch (error) {
    console.error("[checkBookmarkStatus]", error);
    return { data: null, error: "Something went wrong" };
  }
}
