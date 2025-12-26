"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import {
  createTag as createTagRepo,
  addTagToThread as addTagToThreadRepo,
  removeTagFromThread as removeTagFromThreadRepo,
  getThreadTags as getThreadTagsRepo,
  getPopularTags as getPopularTagsRepo,
} from "./repository";
import { z } from "zod";

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const tagThreadSchema = z.object({
  threadId: z.string().cuid(),
  tagId: z.string().cuid(),
});

export async function createTagAction(name: string, color?: string) {
  const session = await requireSession();

  const validation = validate(createTagSchema, { name, color });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const tag = await createTagRepo(validation.data.name, validation.data.color);
    return { success: true, data: tag };
  } catch (error) {
    return handleError(error);
  }
}

export async function addTagToThreadAction(threadId: string, tagId: string) {
  const session = await requireSession();

  const validation = validate(tagThreadSchema, { threadId, tagId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await addTagToThreadRepo(validation.data.threadId, validation.data.tagId);
    revalidatePath(`/dashboard/threads/thread/${threadId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function removeTagFromThreadAction(threadId: string, tagId: string) {
  const session = await requireSession();

  const validation = validate(tagThreadSchema, { threadId, tagId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await removeTagFromThreadRepo(validation.data.threadId, validation.data.tagId);
    revalidatePath(`/dashboard/threads/thread/${threadId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getThreadTagsAction(threadId: string) {
  try {
    const tags = await getThreadTagsRepo(threadId);
    return { success: true, data: tags };
  } catch (error) {
    return handleError(error);
  }
}

export async function getPopularTagsAction(limit?: number) {
  try {
    const tags = await getPopularTagsRepo(limit || 20);
    return { success: true, data: tags };
  } catch (error) {
    return handleError(error);
  }
}

