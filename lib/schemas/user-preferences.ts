export type UserPreferences = {
  theme: 'light' | 'dark' | 'system';
  emailDigest: 'daily' | 'weekly' | 'never';
  pushEnabled: boolean;
  mentionEmails: boolean;
  replyEmails: boolean;
  showOnlineStatus: boolean;
  publicActivityFeed: boolean;
  aiSummaryEnabled: boolean;
};

const VALID_THEMES = new Set(['light', 'dark', 'system']);
const VALID_DIGESTS = new Set(['daily', 'weekly', 'never']);

const DEFAULTS: UserPreferences = {
  theme: 'system',
  emailDigest: 'daily',
  pushEnabled: true,
  mentionEmails: true,
  replyEmails: true,
  showOnlineStatus: true,
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
    showOnlineStatus: typeof v.showOnlineStatus === 'boolean' ? v.showOnlineStatus : DEFAULTS.showOnlineStatus,
    publicActivityFeed: typeof v.publicActivityFeed === 'boolean' ? v.publicActivityFeed : DEFAULTS.publicActivityFeed,
    aiSummaryEnabled: typeof v.aiSummaryEnabled === 'boolean' ? v.aiSummaryEnabled : DEFAULTS.aiSummaryEnabled,
  };
}
