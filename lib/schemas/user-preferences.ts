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

const DEFAULTS: UserPreferences = {
  theme: 'system',
  emailDigest: 'daily',
  pushEnabled: true,
  mentionEmails: true,
  replyEmails: true,
  publicActivityFeed: true,
  aiSummaryEnabled: true,
};

const THEMES = ['light', 'dark', 'system'] as const;
const DIGESTS = ['daily', 'weekly', 'never'] as const;

/**
 * Field-by-field parse rather than `userPreferencesSchema.parse`: preferences are
 * stored as a JSON blob that predates newer fields, so a single bad/missing key
 * must fall back to its default instead of discarding the whole object.
 */
export function parseUserPreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULTS };
  const v = value as Record<string, unknown>;

  const oneOf = <T extends readonly string[]>(allowed: T, raw: unknown, fallback: T[number]) =>
    allowed.includes(raw as T[number]) ? (raw as T[number]) : fallback;

  const bool = (raw: unknown, fallback: boolean) => (typeof raw === 'boolean' ? raw : fallback);

  return {
    theme: oneOf(THEMES, v.theme, DEFAULTS.theme),
    emailDigest: oneOf(DIGESTS, v.emailDigest, DEFAULTS.emailDigest),
    pushEnabled: bool(v.pushEnabled, DEFAULTS.pushEnabled),
    mentionEmails: bool(v.mentionEmails, DEFAULTS.mentionEmails),
    replyEmails: bool(v.replyEmails, DEFAULTS.replyEmails),
    publicActivityFeed: bool(v.publicActivityFeed, DEFAULTS.publicActivityFeed),
    aiSummaryEnabled: bool(v.aiSummaryEnabled, DEFAULTS.aiSummaryEnabled),
  };
}
