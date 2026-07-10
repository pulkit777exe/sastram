import { z } from 'zod';

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
      (val) => /^https:\/\//.test(val),
      'URL must start with https://'
    ),
  type: z.enum(['IMAGE', 'GIF', 'FILE', 'VIDEO']),
  name: z.string().nullable(),
  size: z.number().int().positive('File size must be positive').nullable(),
});

/**
 * Message validation schemas
 */

export const createMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message must be less than 10000 characters'),
  threadId: z.string().cuid('Invalid thread ID'),
  parentId: z.string().cuid('Invalid parent message ID').optional(),
  mentions: z.array(z.string().cuid()).optional(),
});

export const createMessageWithAttachmentsSchema = createMessageSchema.extend({
  attachments: z.array(attachmentInputSchema).max(10, 'Maximum 10 attachments allowed').optional(),
});

export const editMessageSchema = z.object({
  messageId: z.string().cuid('Invalid message ID'),
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message must be less than 10000 characters'),
});

export const pinMessageSchema = z.object({
  messageId: z.string().cuid('Invalid message ID'),
});

export const deleteMessageSchema = z.object({
  messageId: z.string().cuid('Invalid message ID'),
});

export const getMessageEditHistorySchema = z.object({
  messageId: z.string().cuid('Invalid message ID'),
});

export const searchMentionUsersSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
  query: z
    .string()
    .trim()
    .min(1, 'Query is required')
    .max(50, 'Query must be less than 50 characters'),
});

export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type CreateMessage = z.infer<typeof createMessageSchema>;
export type CreateMessageWithAttachments = z.infer<typeof createMessageWithAttachmentsSchema>;
