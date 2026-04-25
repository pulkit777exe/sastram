'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';

import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import {
  bookmarkThread as bookmarkThreadRepo,
  unbookmarkThread as unbookmarkThreadRepo,
  getUserBookmarks as getUserBookmarksRepo,
  isBookmarked as isBookmarkedRepo,
} from './repository';
import { createServerAction } from '@/lib/utils/server-action';
import { paginationSchema } from '@/lib/utils/validation-common';

const bookmarkSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
});

export const toggleBookmark = createServerAction(
  { schema: bookmarkSchema, actionName: 'toggleBookmark' },
  async ({ threadId }) => {
    const session = await requireSession();
    const isBookmarked = await isBookmarkedRepo(session.user.id, threadId);

    if (isBookmarked) {
      await unbookmarkThreadRepo(session.user.id, threadId);
    } else {
      await bookmarkThreadRepo(session.user.id, threadId);
    }

    revalidatePath('/dashboard/bookmarks');
    revalidatePath(`/dashboard/threads/thread/${threadId}`);

    return { data: { isBookmarked: !isBookmarked }, error: null };
  }
);

export const getBookmarkedThreads = createServerAction(
  { schema: paginationSchema, actionName: 'getBookmarkedThreads' },
  async ({ limit, offset }) => {
    const session = await requireSession();
    const result = await getUserBookmarksRepo(
      session.user.id,
      limit || 20,
      offset || 0
    );
    return { data: result, error: null };
  }
);

export const checkBookmarkStatus = createServerAction(
  { schema: bookmarkSchema, actionName: 'checkBookmarkStatus' },
  async ({ threadId }) => {
    const session = await requireSession();
    const isBookmarked = await isBookmarkedRepo(session.user.id, threadId);
    return { data: { isBookmarked }, error: null };
  }
);
