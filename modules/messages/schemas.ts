import { z } from "zod";

/**
 * Message validation schemas
 */

export const createMessageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(10000, "Message must be less than 10000 characters"),
  sectionId: z.string().cuid("Invalid section ID"),
  parentId: z.string().cuid("Invalid parent message ID").optional(),
  mentions: z.array(z.string().cuid()).optional(),
});

export const editMessageSchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
  content: z.string().min(1, "Message cannot be empty").max(10000, "Message must be less than 10000 characters"),
});

export const pinMessageSchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
});

export const getMessageEditHistorySchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
});

// Re-export from lib/schemas/database for backward compatibility
export { createMessageWithAttachmentsSchema } from "@/lib/schemas/database";

