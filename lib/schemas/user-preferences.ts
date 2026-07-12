import { z } from 'zod';

export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  emailDigest: z.enum(['daily', 'weekly', 'never']),
  pushEnabled: z.boolean(),
  mentionEmails: z.boolean(),
  replyEmails: z.boolean(),
  publicActivityFeed: z.boolean(),
  aiSummaryEnabled: z.boolean(),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

const VALID_THEMES = new Set(['light', 'dark', 'system']);
const VALID_DIGESTS = new Set(['daily', 'weekly', 'never']);

const DEFAULTS: UserPreferences = {
  theme: 'system',
  emailDigest: 'daily',
  pushEnabled: true,
  mentionEmails: true,
  replyEmails: true,
  publicActivityFeed: true,
  aiSummaryEnabled: true,
};

/**
 * Parse user preferences from a raw DB value.
 * No Zod dependency — safe for client-side import.
 */
export function parseUserPreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULTS };
  const v = value as Record<string, unknown>;
  return {
    theme: VALID_THEMES.has(v.theme as string) ? (v.theme as UserPreferences['theme']) : DEFAULTS.theme,
    emailDigest: VALID_DIGESTS.has(v.emailDigest as string) ? (v.emailDigest as UserPreferences['emailDigest']) : DEFAULTS.emailDigest,
    pushEnabled: typeof v.pushEnabled === 'boolean' ? v.pushEnabled : DEFAULTS.pushEnabled,
    mentionEmails: typeof v.mentionEmails === 'boolean' ? v.mentionEmails : DEFAULTS.mentionEmails,
    replyEmails: typeof v.replyEmails === 'boolean' ? v.replyEmails : DEFAULTS.replyEmails,
    publicActivityFeed: typeof v.publicActivityFeed === 'boolean' ? v.publicActivityFeed : DEFAULTS.publicActivityFeed,
    aiSummaryEnabled: typeof v.aiSummaryEnabled === 'boolean' ? v.aiSummaryEnabled : DEFAULTS.aiSummaryEnabled,
  };
}
