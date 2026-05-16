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

export const paginationSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const activityQuerySchema = z.object({
  userId: z.string().cuid().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});
