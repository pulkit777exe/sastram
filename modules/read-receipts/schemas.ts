import { z } from 'zod';

export const markThreadReadSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
  lastReadMessageId: z.string().cuid('Invalid message ID').nullable().optional(),
});
