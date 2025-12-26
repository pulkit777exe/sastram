import { z } from "zod";

export const followUserSchema = z.object({
  userId: z.string().cuid("Invalid user ID"),
});

export const getFollowersSchema = z.object({
  userId: z.string().cuid("Invalid user ID"),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const getFollowingSchema = z.object({
  userId: z.string().cuid("Invalid user ID"),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

