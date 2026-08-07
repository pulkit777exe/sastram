import { z } from 'zod';

export const submitFeedbackSchema = z.object({
  type: z.enum(['BUG', 'SUGGESTION', 'OTHER']),
  message: z.string().min(10).max(2000),
  route: z.string().max(500).optional(),
});
