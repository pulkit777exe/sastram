import { z } from 'zod';

// Re-export from modules/messages/schemas for backward compatibility
export { attachmentInputSchema, createMessageWithAttachmentsSchema } from '@/modules/messages/schemas';

/**
 * Thread/Section creation schema
 */
export const createThreadSchema = z.object({
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must be less than 100 characters')
    .refine((val) => /[a-zA-Z]/.test(val), 'Name must contain at least one letter'),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .min(3, 'Slug must be at least 3 characters')
    .refine((val) => !val.startsWith('-'), 'Slug cannot start with a hyphen')
    .refine((val) => !val.endsWith('-'), 'Slug cannot end with a hyphen')
    .refine((val) => !val.includes('--'), 'Slug cannot have consecutive hyphens'),
  description: z.string().max(480, 'Description must be less than 480 characters').optional(),
  aiSummary: z.string().max(2000, 'Summary must be less than 2000 characters').optional(),
  createdBy: z.string().cuid('Invalid user ID'),
  communityId: z.string().cuid('Invalid community ID').nullable().optional(),
});

/**
 * Thread update schema
 */
export const updateThreadSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(480).optional(),
  aiSummary: z.string().max(2000).optional(),
});

/**
 * Community creation schema
 */
export const createCommunitySchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be less than 100 characters')
    .refine((val) => val.trim() === val, 'Title cannot have leading or trailing whitespace'),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .refine((val) => !val.startsWith('-'), 'Slug cannot start with a hyphen')
    .refine((val) => !val.endsWith('-'), 'Slug cannot end with a hyphen')
    .refine((val) => !val.includes('--'), 'Slug cannot have consecutive hyphens'),
  description: z.string().max(280, 'Description must be less than 280 characters').optional(),
  createdBy: z.string().cuid('Invalid user ID'),
});

/**
 * Community update schema
 */
export const updateCommunitySchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().max(280).optional(),
});

/**
 * Newsletter subscription schema
 */
export const newsletterSubscriptionSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
  email: z.string().email('Invalid email address'),
  userId: z.string().cuid('Invalid user ID').optional(),
});

/**
 * Message queue schema
 */
export const messageQueueSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  sectionId: z.string().cuid('Invalid section ID'),
  messageId: z.string().cuid('Invalid message ID'),
  delivered: z.boolean().default(false),
});

/**
 * Mention data schema
 */
export const mentionDataSchema = z.object({
  messageId: z.string().cuid('Invalid message ID'),
  mentionedUserId: z.string().cuid('Invalid user ID'),
  mentionedBy: z.string().cuid('Invalid user ID'),
  mentionedByName: z.string(),
  sectionId: z.string().cuid('Invalid section ID'),
  content: z.string(),
  parentId: z.string().cuid('Invalid parent message ID').optional(),
});

/**
 * Type exports
 */
export type CreateThread = z.infer<typeof createThreadSchema>;
export type UpdateThread = z.infer<typeof updateThreadSchema>;
export type CreateCommunity = z.infer<typeof createCommunitySchema>;
export type UpdateCommunity = z.infer<typeof updateCommunitySchema>;
export type NewsletterSubscription = z.infer<typeof newsletterSubscriptionSchema>;
export type MessageQueue = z.infer<typeof messageQueueSchema>;
export type MentionData = z.infer<typeof mentionDataSchema>;
