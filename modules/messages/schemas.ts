import { z } from 'zod';
import { env } from '@/lib/config/env';

const MAX_CONTENT_LENGTH = 10000;

function isBlobDomainUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;

    // When the deployment pins its Blob origin, compare the full origin — a
    // substring check would accept https://evil.example/?blob.vercel-storage.com.
    if (env.BLOB_URL) {
      return parsed.origin === new URL(env.BLOB_URL).origin;
    }

    const host = parsed.hostname.toLowerCase();
    return host === 'blob.vercel-storage.com' || host.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export const attachmentInputSchema = z.object({
  url: z
    .string()
    .url('Invalid attachment URL')
    .refine(isBlobDomainUrl, 'URL must be a Vercel Blob URL (https://*.public.blob.vercel-storage.com)'),
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
