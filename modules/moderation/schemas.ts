import { z } from 'zod';

/**
 * Moderation validation schemas
 */

export const getBannedUsersSchema = z.object({
  isActive: z.boolean().optional(),
  threadId: z.string().cuid().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});
