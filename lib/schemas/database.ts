import { z } from 'zod';

/**
 * Message creation schema
 */
export const createMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message must be less than 10000 characters')
    .refine((val) => val.trim().length > 0, 'Message cannot be only whitespace')
    .refine((val) => !val.includes('\x00'), 'Message cannot contain null bytes'),
  threadId: z.string().cuid('Invalid thread ID'),
  parentId: z.string().cuid('Invalid parent message ID').optional(),
  mentions: z.array(z.string().cuid('Invalid user ID')).optional(),
});

/**
 * Attachment input schema
 */
export const attachmentInputSchema = z.object({
  url: z
    .string()
    .url('Invalid attachment URL')
    .refine(
      (val) => !val.includes('..') && !val.includes('\\'),
      'Invalid path in URL'
    )
    .refine(
      (val) => /^(https?|data:)/.test(val),
      'URL must start with https:// or data:'
    ),
  type: z.enum(['IMAGE', 'GIF', 'FILE', 'VIDEO']),
  name: z.string().nullable(),
  size: z.number().int().positive('File size must be positive').nullable(),
});

/**
 * Message with attachments schema
 */
export const createMessageWithAttachmentsSchema = createMessageSchema.extend({
  attachments: z.array(attachmentInputSchema).max(10, 'Maximum 10 attachments allowed').optional(),
});

/**
 * Thread creation schema
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
  threadId: z.string().cuid('Invalid thread ID'),
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
  threadId: z.string().cuid('Invalid thread ID'),
  content: z.string(),
  parentId: z.string().cuid('Invalid parent message ID').optional(),
});

export type AttachmentInput = z.infer<typeof attachmentInputSchema>;


