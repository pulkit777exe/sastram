import { z } from 'zod';

export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  emailDigest: z.enum(['daily', 'weekly', 'never']).default('daily'),
  pushEnabled: z.boolean().default(true),
  mentionEmails: z.boolean().default(true),
  replyEmails: z.boolean().default(true),
  showOnlineStatus: z.boolean().default(true),
  publicActivityFeed: z.boolean().default(true),
  aiSummaryEnabled: z.boolean().default(true),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export function parseUserPreferences(value: unknown): UserPreferences {
  const result = userPreferencesSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  return userPreferencesSchema.parse({});
}
