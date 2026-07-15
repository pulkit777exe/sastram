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
 * Type exports
 */
export type CreateThread = z.infer<typeof createThreadSchema>;
export type UpdateThread = z.infer<typeof updateThreadSchema>;
