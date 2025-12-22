import { z } from "zod";

/**
 * Message creation schema
 */
export const createMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(1000, "Message must be less than 1000 characters"),
  sectionId: z.string().cuid("Invalid section ID"),
  parentId: z.string().cuid("Invalid parent message ID").optional(),
  mentions: z.array(z.string().cuid("Invalid user ID")).optional(),
});

/**
 * Attachment input schema
 */
export const attachmentInputSchema = z.object({
  url: z.string().url("Invalid attachment URL"),
  type: z.enum(["IMAGE", "GIF", "FILE", "VIDEO"]),
  name: z.string().nullable(),
  size: z.number().int().positive("File size must be positive").nullable(),
});

/**
 * Message with attachments schema
 */
export const createMessageWithAttachmentsSchema = createMessageSchema.extend({
  attachments: z
    .array(attachmentInputSchema)
    .max(10, "Maximum 10 attachments allowed")
    .optional(),
});

/**
 * Thread/Section creation schema
 */
export const createThreadSchema = z.object({
  name: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .max(100, "Name must be less than 100 characters"),
  slug: z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens"
    ),
  description: z
    .string()
    .max(480, "Description must be less than 480 characters")
    .optional(),
  summary: z
    .string()
    .max(2000, "Summary must be less than 2000 characters")
    .optional(),
  icon: z.string().emoji("Icon must be a valid emoji").optional(),
  createdBy: z.string().cuid("Invalid user ID"),
  communityId: z.string().cuid("Invalid community ID").nullable().optional(),
});

/**
 * Thread update schema
 */
export const updateThreadSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(480).optional(),
  summary: z.string().max(2000).optional(),
  icon: z.string().emoji().optional(),
});

/**
 * Community creation schema
 */
export const createCommunitySchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be less than 100 characters"),
  slug: z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens"
    ),
  description: z
    .string()
    .max(280, "Description must be less than 280 characters")
    .optional(),
  createdBy: z.string().cuid("Invalid user ID"),
});

/**
 * Community update schema
 */
export const updateCommunitySchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().max(280).optional(),
});

/**
 * User profile update schema
 */
export const updateUserProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be less than 50 characters"),
  bio: z.string().max(160, "Bio must be less than 160 characters").optional(),
  image: z.string().url("Invalid image URL").optional(),
});

/**
 * Newsletter subscription schema
 */
export const newsletterSubscriptionSchema = z.object({
  threadId: z.string().cuid("Invalid thread ID"),
  email: z.string().email("Invalid email address"),
  userId: z.string().cuid("Invalid user ID").optional(),
});

/**
 * Message queue schema
 */
export const messageQueueSchema = z.object({
  userId: z.string().cuid("Invalid user ID"),
  sectionId: z.string().cuid("Invalid section ID"),
  messageId: z.string().cuid("Invalid message ID"),
  delivered: z.boolean().default(false),
});

/**
 * Mention data schema
 */
export const mentionDataSchema = z.object({
  messageId: z.string().cuid("Invalid message ID"),
  mentionedUserId: z.string().cuid("Invalid user ID"),
  mentionedBy: z.string().cuid("Invalid user ID"),
  mentionedByName: z.string(),
  sectionId: z.string().cuid("Invalid section ID"),
  content: z.string(),
  parentId: z.string().cuid("Invalid parent message ID").optional(),
});

/**
 * Type exports
 */
export type CreateMessage = z.infer<typeof createMessageSchema>;
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type CreateMessageWithAttachments = z.infer<
  typeof createMessageWithAttachmentsSchema
>;
export type CreateThread = z.infer<typeof createThreadSchema>;
export type UpdateThread = z.infer<typeof updateThreadSchema>;
export type CreateCommunity = z.infer<typeof createCommunitySchema>;
export type UpdateCommunity = z.infer<typeof updateCommunitySchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type NewsletterSubscription = z.infer<
  typeof newsletterSubscriptionSchema
>;
export type MessageQueue = z.infer<typeof messageQueueSchema>;
export type MentionData = z.infer<typeof mentionDataSchema>;
