'use server';

import { logger } from '@/lib/infrastructure/logger';

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

export const searchThreadsAction = withValidation(
  searchSchema,
  'searchThreads',
  async ({ query, limit, offset }) => {
    try {
      const result = await searchThreadsRepo(query, limit, offset);
      return { data: result, error: null };
    } catch (error) {
      logger.error('[searchThreads]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const searchMessagesAction = withValidation(
  searchSchema,
  'searchMessages',
  async ({ query, limit, offset }, threadId?: string) => {
    try {
      const result = await searchMessagesRepo(query, threadId, limit, offset);
      return { data: result, error: null };
    } catch (error) {
      logger.error('[searchMessages]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const searchUsersAction = withValidation(
  searchSchema,
  'searchUsers',
  async ({ query, limit, offset }) => {
    try {
      const result = await searchUsersRepo(query, limit, offset);
      return { data: result, error: null };
    } catch (error) {
      logger.error('[searchUsers]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);
