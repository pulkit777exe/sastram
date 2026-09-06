'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/lib/config/routes';
import {
  bookmarkThread as bookmarkThreadRepo,
  unbookmarkThread as unbookmarkThreadRepo,
  getUserBookmarks as getUserBookmarksRepo,
  isBookmarked as isBookmarkedRepo,
} from './repository';
import { createServerAction } from '@/lib/utils/server-action';
import { paginationSchema, threadIdSchema } from '@/lib/utils/validation-common';
import { actionSuccess } from '@/lib/actions/result';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import type { Role } from '@prisma/client';

function revalidateBookmarkPaths(threadId: string) {
  revalidatePath(ROUTES.DASHBOARD_BOOKMARKS);
  revalidatePath(ROUTES.THREAD(threadId));
}

async function assertThreadAccess(threadId: string, userId: string, role: Role) {
  await requireThreadAccessOrThrow(threadId, userId, role);
}

export const toggleBookmark = createServerAction(
  { schema: threadIdSchema, actionName: 'toggleBookmark' },
  async ({ threadId }) => {
    const session = await requireSession();
    await assertThreadAccess(threadId, session.user.id, session.user.role as Role);
    const currentlyBookmarked = await isBookmarkedRepo(session.user.id, threadId);

    if (currentlyBookmarked) {
      await unbookmarkThreadRepo(session.user.id, threadId);
    } else {
      await bookmarkThreadRepo(session.user.id, threadId);
    }

    revalidateBookmarkPaths(threadId);

    const newBookmarkedState = !currentlyBookmarked;
    return actionSuccess({ isBookmarked: newBookmarkedState });
  }
);

export const getBookmarkedThreads = createServerAction(
  { schema: paginationSchema, actionName: 'getBookmarkedThreads' },
  async ({ limit, offset }) => {
    const session = await requireSession();
    const result = await getUserBookmarksRepo(session.user.id, limit || 20, offset || 0);
    return actionSuccess(result);
  }
);

export const checkBookmarkStatus = createServerAction(
  { schema: threadIdSchema, actionName: 'checkBookmarkStatus' },
  async ({ threadId }) => {
    const session = await requireSession();
    await assertThreadAccess(threadId, session.user.id, session.user.role as Role);
    const isBookmarked = await isBookmarkedRepo(session.user.id, threadId);
    return actionSuccess({ isBookmarked });
  }
);

const setBookmarkStatusSchema = z.object({
  threadId: z.string().cuid(),
  bookmarked: z.boolean(),
});

/**
 * Idempotent deep module — no read-then-write race.
 * Client decides desired state; server upserts/deletes directly.
 */
export const setBookmarkStatus = createServerAction(
  { schema: setBookmarkStatusSchema, actionName: 'setBookmarkStatus' },
  async ({ threadId, bookmarked }) => {
    const session = await requireSession();
    await assertThreadAccess(threadId, session.user.id, session.user.role as Role);

    if (bookmarked) {
      await bookmarkThreadRepo(session.user.id, threadId);
    } else {
      await unbookmarkThreadRepo(session.user.id, threadId);
    }

    revalidateBookmarkPaths(threadId);

    return actionSuccess({ isBookmarked: bookmarked });
  }
);
