import { z } from 'zod';

/**
 * Invitation validation schemas
 */

export const inviteFriendSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
  email: z.string().email('Invalid email address'),
});
