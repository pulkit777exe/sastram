import { z } from 'zod';

/**
 * Thread validation schemas
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
  createdBy: z.string().cuid('Invalid user ID'),
  communityId: z.string().cuid('Invalid community ID').nullable().optional(),
});

export const updateThreadSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(480).optional(),
  summary: z.string().max(2000).optional(),
  icon: z.string().emoji().optional(),
});

export type CreateThread = z.infer<typeof createThreadSchema>;
export type UpdateThread = z.infer<typeof updateThreadSchema>;
