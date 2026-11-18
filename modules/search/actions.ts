'use server';

import {
  searchThreads as searchThreadsRepo,
  searchMessages as searchMessagesRepo,
  searchUsers as searchUsersRepo,
} from './repository';
import { z } from 'zod';
import { withValidation } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/utils/server-action';
import { getSession } from '@/modules/auth';

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(100).optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
});

const searchMessagesSchema = searchSchema.extend({
  threadId: z.string().optional(),
});

// Public/read-only search: logged-out visitors see only public content; signed-in
// users keep their existing visibility scope.
export const searchThreadsAction = withValidation(
  searchSchema,
  'searchThreads',
  async ({ query, limit, offset }) => {
    const session = await getSession();
    const result = await searchThreadsRepo(
      query,
      limit,
      offset,
      undefined,
      session?.user.id,
      session?.user.role
    );
    return actionSuccess(result);
  }
);

export const searchMessagesAction = withValidation(
  searchMessagesSchema,
  'searchMessages',
  async ({ query, threadId, limit, offset }) => {
    const session = await getSession();
    const result = await searchMessagesRepo(
      query,
      threadId,
      limit,
      offset,
      session?.user.id,
      session?.user.role
    );
    return actionSuccess(result);
  }
);

export const searchUsersAction = withValidation(
  searchSchema,
  'searchUsers',
  async ({ query, limit, offset }) => {
    const session = await getSession();
    const result = await searchUsersRepo(query, limit, offset, session?.user.id);
    return actionSuccess(result);
  }
);
