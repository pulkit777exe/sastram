import { z } from 'zod';

export const userIdSchema = z.object({
  userId: z.string().cuid(),
});

export const threadIdSchema = z.object({
  threadId: z.string().cuid(),
});

export const messageIdSchema = z.object({
  messageId: z.string().cuid(),
});

const MAX_PAGINATION_LIMIT = 100; // matches MAX_PAGE_SIZE — keeps validation single-sourced

export const paginationSchema = z.object({
  limit: z.number().int().positive().max(MAX_PAGINATION_LIMIT).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const activityQuerySchema = z.object({
  userId: z.string().cuid().optional(),
  limit: z.number().int().positive().max(MAX_PAGINATION_LIMIT).optional(),
  offset: z.number().int().nonnegative().optional(),
});
