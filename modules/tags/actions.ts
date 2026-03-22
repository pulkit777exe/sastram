"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
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
  const parsed = createTagSchema.safeParse({ name, color });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    await requireSession();
    const tag = await createTagRepo(parsed.data.name, parsed.data.color);
    return { data: tag, error: null };
  } catch (error) {
    console.error("[createTagAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function addTagToThreadAction(threadId: string, tagId: string) {
  const parsed = tagThreadSchema.safeParse({ threadId, tagId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    await requireSession();
    await addTagToThreadRepo(parsed.data.threadId, parsed.data.tagId);
    revalidatePath(`/dashboard/threads/thread/${parsed.data.threadId}`);
    return { data: null, error: null };
  } catch (error) {
    console.error("[addTagToThreadAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function removeTagFromThreadAction(threadId: string, tagId: string) {
  const parsed = tagThreadSchema.safeParse({ threadId, tagId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    await requireSession();
    await removeTagFromThreadRepo(parsed.data.threadId, parsed.data.tagId);
    revalidatePath(`/dashboard/threads/thread/${parsed.data.threadId}`);
    return { data: null, error: null };
  } catch (error) {
    console.error("[removeTagFromThreadAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getThreadTagsAction(threadId: string) {
  const parsed = z.object({ threadId: z.string().cuid() }).safeParse({
    threadId,
  });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const tags = await getThreadTagsRepo(parsed.data.threadId);
    return { data: tags, error: null };
  } catch (error) {
    console.error("[getThreadTagsAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getPopularTagsAction(limit?: number) {
  const parsed = z
    .object({ limit: z.number().int().positive().max(100).optional() })
    .safeParse({ limit });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const tags = await getPopularTagsRepo(parsed.data.limit || 20);
    return { data: tags, error: null };
  } catch (error) {
    console.error("[getPopularTagsAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}
