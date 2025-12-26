"use server";

import { handleError } from "@/lib/utils/errors";
import {
  searchThreads as searchThreadsRepo,
  searchMessages as searchMessagesRepo,
  searchUsers as searchUsersRepo,
} from "./repository";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(100).optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
});

export async function searchThreadsAction(query: string, limit?: number, offset?: number) {
  const validation = searchSchema.safeParse({ query, limit, offset });
  if (!validation.success) {
    return { error: "Invalid search parameters" };
  }

  try {
    const result = await searchThreadsRepo(
      validation.data.query,
      validation.data.limit,
      validation.data.offset
    );
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

export async function searchMessagesAction(
  query: string,
  threadId?: string,
  limit?: number,
  offset?: number
) {
  const validation = searchSchema.safeParse({ query, limit, offset });
  if (!validation.success) {
    return { error: "Invalid search parameters" };
  }

  try {
    const result = await searchMessagesRepo(
      validation.data.query,
      threadId,
      validation.data.limit,
      validation.data.offset
    );
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

export async function searchUsersAction(query: string, limit?: number, offset?: number) {
  const validation = searchSchema.safeParse({ query, limit, offset });
  if (!validation.success) {
    return { error: "Invalid search parameters" };
  }

  try {
    const result = await searchUsersRepo(
      validation.data.query,
      validation.data.limit,
      validation.data.offset
    );
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

