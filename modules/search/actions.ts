'use server';

import {
  searchThreads as searchThreadsRepo,
  searchMessages as searchMessagesRepo,
  searchUsers as searchUsersRepo,
} from './repository';
import { z } from 'zod';
import { withValidation } from '@/lib/utils/server-action';

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(100).optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
});

const searchMessagesSchema = searchSchema.extend({
  threadId: z.string().optional(),
});

// The repositories already swallow and log their own failures, returning empty
// result sets; createServerAction covers anything that escapes.
export const searchThreadsAction = withValidation(
  searchSchema,
  'searchThreads',
  async ({ query, limit, offset }) => {
    const result = await searchThreadsRepo(query, limit, offset);
    return { data: result, error: null, ok: true, errorCode: null };
  }
);

export const searchMessagesAction = withValidation(
  searchMessagesSchema,
  'searchMessages',
  async ({ query, threadId, limit, offset }) => {
    const result = await searchMessagesRepo(query, threadId, limit, offset);
    return { data: result, error: null, ok: true, errorCode: null };
  }
);

export const searchUsersAction = withValidation(
  searchSchema,
  'searchUsers',
  async ({ query, limit, offset }) => {
    const result = await searchUsersRepo(query, limit, offset);
    return { data: result, error: null, ok: true, errorCode: null };
  }
);
