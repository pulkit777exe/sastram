import { z } from 'zod';
import { env } from '@/lib/config/env';

const MAX_CONTENT_LENGTH = 10000;

const SAFE_URL_RE = /^https:\/\//;

function isBlobDomainUrl(value: string): boolean {
  const blobUrl = env.BLOB_URL;
  if (blobUrl && value.startsWith(blobUrl)) return true;
  // Vercel Blob URLs always contain blob.vercel-storage.com or vercel-blob
  return value.includes('blob.vercel-storage.com') || value.includes('vercel-blob');
}

function isSafeUrl(value: string): boolean {
  if (value.includes('..') || value.includes('\\')) return false;
  if (!SAFE_URL_RE.test(value)) return false;
  return isBlobDomainUrl(value);
}

export const attachmentInputSchema = z.object({
  url: z
    .string()
    .url('Invalid attachment URL')
    .refine(isSafeUrl, 'URL must be a Vercel Blob URL (https://*.public.blob.vercel-storage.com)'),
  type: z.enum(['IMAGE', 'GIF', 'FILE', 'VIDEO', 'PDF']),
  name: z.string().nullable(),
  size: z.number().int().positive('File size must be positive').nullable(),
});

const messageContent = z
  .string()
  .min(1, 'Message cannot be empty')
  .max(MAX_CONTENT_LENGTH, `Message must be less than ${MAX_CONTENT_LENGTH} characters`);

export const createMessageSchema = z.object({
  content: messageContent,
  threadId: z.string().cuid('Invalid thread ID'),
  parentId: z.string().cuid('Invalid parent message ID').optional(),
  mentions: z.array(z.string().cuid()).optional(),
});

export const createMessageWithAttachmentsSchema = createMessageSchema.extend({
  attachments: z.array(attachmentInputSchema).max(10, 'Maximum 10 attachments allowed').optional(),
  poll: z
    .object({
      question: z.string().min(1).max(500),
      options: z.array(z.string().min(1).max(200)).min(2).max(10),
      expiresAt: z.coerce.date().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const messageIdSchema = z.object({
  messageId: z.string().cuid('Invalid message ID'),
});

export const editMessageSchema = messageIdSchema.extend({
  content: messageContent,
});

export const pinMessageSchema = messageIdSchema;
export const deleteMessageSchema = messageIdSchema;
export const getMessageEditHistorySchema = messageIdSchema;

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
