import { z } from "zod";

/**
 * Reaction validation schemas
 */

export const toggleReactionSchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
  emoji: z.string().min(1, "Emoji is required").max(10, "Emoji must be less than 10 characters"),
});

export const getReactionSummarySchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
});

