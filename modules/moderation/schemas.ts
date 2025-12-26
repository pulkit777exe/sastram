import { z } from "zod";
import { BAN_REASONS } from "@/lib/config/constants";

/**
 * Moderation validation schemas
 */

export const banUserSchema = z.object({
  userId: z.string().cuid("Invalid user ID"),
  reason: z.enum([
    BAN_REASONS.SPAM,
    BAN_REASONS.HARASSMENT,
    BAN_REASONS.HATE_SPEECH,
    BAN_REASONS.ILLEGAL_CONTENT,
    BAN_REASONS.IMPERSONATION,
    BAN_REASONS.THREATS,
    BAN_REASONS.DOXXING,
    BAN_REASONS.OTHER,
  ] as [string, ...string[]], {
    message: "Invalid ban reason"
  }),
  customReason: z.string()
    .max(1000, "Custom reason too long (max 1000 characters)")
    .optional(),
  threadId: z.string().cuid("Invalid thread ID").optional(),
  expiresAt: z.date()
    .min(new Date(), "Expiration date must be in the future")
    .optional(),
});

export const deleteMessageSchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
  sectionSlug: z.string().min(1, "Section slug required"),
  reason: z.string()
    .max(500, "Reason too long (max 500 characters)")
    .optional(),
});

export const deleteEntitySchema = z.object({
  entityId: z.string().cuid("Invalid entity ID"),
  reason: z.string()
    .max(500, "Reason too long (max 500 characters)")
    .optional(),
});

export const getBannedUsersSchema = z.object({
  isActive: z.boolean().optional(),
  threadId: z.string().cuid().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const getMessageDetailsSchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
});

export const getModerationQueueSchema = z.object({
  status: z.enum(["PENDING", "REVIEWING"]).optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

