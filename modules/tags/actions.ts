'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import {
  createTag as createTagRepo,
  addTagToThread as addTagToThreadRepo,
  removeTagFromThread as removeTagFromThreadRepo,
  getThreadTags as getThreadTagsRepo,
  getPopularTags as getPopularTagsRepo,
} from './repository';
import { createServerAction, withValidation } from '@/lib/utils/server-action';

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const tagThreadSchema = z.object({
  threadId: z.string().cuid(),
  tagId: z.string().cuid(),
});

export const createTagAction = createServerAction(
  { schema: createTagSchema, actionName: 'createTagAction' },
  async ({ name, color }) => {
    await requireSession();
    const tag = await createTagRepo(name, color);
    return { data: tag, error: null };
  }
);

export const addTagToThreadAction = createServerAction(
  { schema: tagThreadSchema, actionName: 'addTagToThreadAction' },
  async ({ threadId, tagId }) => {
    await requireSession();
    await addTagToThreadRepo(threadId, tagId);
    revalidatePath(`/dashboard/threads/thread/${threadId}`);
    return { data: null, error: null };
  }
);

export const removeTagFromThreadAction = createServerAction(
  { schema: tagThreadSchema, actionName: 'removeTagFromThreadAction' },
  async ({ threadId, tagId }) => {
    await requireSession();
    await removeTagFromThreadRepo(threadId, tagId);
    revalidatePath(`/dashboard/threads/thread/${threadId}`);
    return { data: null, error: null };
  }
);

export const getThreadTagsAction = createServerAction(
  { schema: z.object({ threadId: z.string().cuid() }), actionName: 'getThreadTagsAction' },
  async ({ threadId }) => {
    const tags = await getThreadTagsRepo(threadId);
    return { data: tags, error: null };
  }
);

export const getPopularTagsAction = withValidation(
  z.object({ limit: z.number().int().positive().max(100).optional() }),
  'getPopularTagsAction',
  async ({ limit }) => {
    const tags = await getPopularTagsRepo(limit || 20);
    return { data: tags, error: null };
  }
);
