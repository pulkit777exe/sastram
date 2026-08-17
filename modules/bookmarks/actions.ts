'use server';

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

export const toggleBookmark = createServerAction(
  { schema: threadIdSchema, actionName: 'toggleBookmark' },
  async ({ threadId }) => {
    const session = await requireSession();
    const isBookmarked = await isBookmarkedRepo(session.user.id, threadId);

    if (isBookmarked) {
      await unbookmarkThreadRepo(session.user.id, threadId);
    } else {
      await bookmarkThreadRepo(session.user.id, threadId);
    }

    revalidatePath(ROUTES.DASHBOARD_BOOKMARKS);
    revalidatePath(ROUTES.THREAD(threadId));

    return actionSuccess({ isBookmarked: !isBookmarked });
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
    const isBookmarked = await isBookmarkedRepo(session.user.id, threadId);
    return actionSuccess({ isBookmarked });
  }
);
