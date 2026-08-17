'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth';
import { requireRole } from '@/modules/policy';
import { requireThreadWriteOrThrow } from '@/lib/thread-access';
import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/lib/config/routes';
import {
  createTag as createTagRepo,
  addTagToThread as addTagToThreadRepo,
  removeTagFromThread as removeTagFromThreadRepo,
  getThreadTags as getThreadTagsRepo,
  getPopularTags as getPopularTagsRepo,
  listAllTags as listAllTagsRepo,
  updateTag as updateTagRepo,
  deleteTag as deleteTagRepo,
  mergeTags as mergeTagsRepo,
} from './repository';
import { createServerAction, withValidation } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/actions/result';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: hexColor.optional(),
});

const tagThreadSchema = z.object({
  threadId: z.string().cuid(),
  tagId: z.string().cuid(),
});

const updateTagSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50).optional(),
  color: hexColor.optional(),
});

const mergeTagsSchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
});

const listTagsSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  search: z.string().optional(),
});

export const createTagAction = createServerAction(
  { schema: createTagSchema, actionName: 'createTagAction' },
  async ({ name, color }) => {
    await requireSession();
    const tag = await createTagRepo(name, color);
    return actionSuccess(tag);
  }
);

export const addTagToThreadAction = createServerAction(
  { schema: tagThreadSchema, actionName: 'addTagToThreadAction' },
  async ({ threadId, tagId }) => {
    const session = await requireSession();
    await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);
    await addTagToThreadRepo(threadId, tagId);
    revalidatePath(ROUTES.THREAD(threadId));
    return actionSuccess(null);
  }
);

export const removeTagFromThreadAction = createServerAction(
  { schema: tagThreadSchema, actionName: 'removeTagFromThreadAction' },
  async ({ threadId, tagId }) => {
    const session = await requireSession();
    await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);
    await removeTagFromThreadRepo(threadId, tagId);
    revalidatePath(ROUTES.THREAD(threadId));
    return actionSuccess(null);
  }
);

export const getThreadTagsAction = createServerAction(
  { schema: z.object({ threadId: z.string().cuid() }), actionName: 'getThreadTagsAction' },
  async ({ threadId }) => {
    const session = await requireSession();
    await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);
    const tags = await getThreadTagsRepo(threadId);
    return actionSuccess(tags);
  }
);

export const getPopularTagsAction = withValidation(
  z.object({ limit: z.number().int().positive().max(100).optional() }),
  'getPopularTagsAction',
  async ({ limit }) => {
    const tags = await getPopularTagsRepo(limit || 20);
    return actionSuccess(tags);
  }
);

export const listAllTagsAction = createServerAction(
  { schema: listTagsSchema, actionName: 'listAllTagsAction' },
  async (params) => {
    await requireRole(['ADMIN']);
    const result = await listAllTagsRepo(params);
    return actionSuccess(result);
  }
);

export const updateTagAction = createServerAction(
  { schema: updateTagSchema, actionName: 'updateTagAction' },
  async ({ id, name, color }) => {
    await requireRole(['ADMIN']);
    const tag = await updateTagRepo(id, { name, color });
    revalidatePath(ROUTES.ADMIN);
    return actionSuccess(tag);
  }
);

export const deleteTagAction = createServerAction(
  { schema: z.object({ id: z.string() }), actionName: 'deleteTagAction' },
  async ({ id }) => {
    await requireRole(['ADMIN']);
    await deleteTagRepo(id);
    revalidatePath(ROUTES.ADMIN);
    return actionSuccess(null);
  }
);

export const mergeTagsAction = createServerAction(
  { schema: mergeTagsSchema, actionName: 'mergeTagsAction' },
  async ({ sourceId, targetId }) => {
    await requireRole(['ADMIN']);
    const tag = await mergeTagsRepo(sourceId, targetId);
    revalidatePath(ROUTES.ADMIN);
    return actionSuccess(tag);
  }
);
