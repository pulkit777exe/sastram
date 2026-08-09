import { z } from 'zod';

const uploadedFileSchema = z.object({
  url: z.string().url(),
  type: z.enum(['IMAGE', 'GIF', 'FILE', 'VIDEO', 'PDF']),
  name: z.string(),
  size: z.number().int().positive(),
  flagged: z.boolean().optional(),
});

export const uploadResponseSchema = z.object({
  files: z
    .array(uploadedFileSchema)
    .min(1, 'At least one file is required')
    .max(10, 'Maximum 10 files allowed'),
});
