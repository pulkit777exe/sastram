import { z } from "zod";

export const createPollSchema = z.object({
  threadId: z.string().cuid("Invalid thread ID"),
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).min(2).max(10),
  expiresAt: z.date().optional(),
});

export const voteOnPollSchema = z.object({
  pollId: z.string().cuid("Invalid poll ID"),
  optionIndex: z.number().int().nonnegative(),
});

