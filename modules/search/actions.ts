'use server';

import {
  searchThreads as searchThreadsRepo,
  searchMessages as searchMessagesRepo,
  searchUsers as searchUsersRepo,
} from './repository';
import { z } from 'zod';

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(100).optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
});

export async function searchThreadsAction(query: string, limit?: number, offset?: number) {
  const parsed = searchSchema.safeParse({ query, limit, offset });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const result = await searchThreadsRepo(
      parsed.data.query,
      parsed.data.limit,
      parsed.data.offset
    );
    return { data: result, error: null };
  } catch (error) {
    console.error('[searchThreadsAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function searchMessagesAction(
  query: string,
  threadId?: string,
  limit?: number,
  offset?: number
) {
  const parsed = searchSchema.safeParse({ query, limit, offset });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const result = await searchMessagesRepo(
      parsed.data.query,
      threadId,
      parsed.data.limit,
      parsed.data.offset
    );
    return { data: result, error: null };
  } catch (error) {
    console.error('[searchMessagesAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function searchUsersAction(query: string, limit?: number, offset?: number) {
  const parsed = searchSchema.safeParse({ query, limit, offset });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const result = await searchUsersRepo(parsed.data.query, parsed.data.limit, parsed.data.offset);
    return { data: result, error: null };
  } catch (error) {
    console.error('[searchUsersAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}
