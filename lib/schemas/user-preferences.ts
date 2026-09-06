import { z } from 'zod';

export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  emailDigest: z.enum(['daily', 'weekly', 'never']),
  pushEnabled: z.boolean(),
  mentionEmails: z.boolean(),
  replyEmails: z.boolean(),
  publicActivityFeed: z.boolean(),
  aiSummaryEnabled: z.boolean(),
  expertiseLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  deepResearchEnabled: z.boolean().optional(),
  collectionsEnabled: z.boolean().optional(),
  graphEnabled: z.boolean().optional(),
  sourceProvenanceEnabled: z.boolean().optional(),
  verifiedResolutionEnabled: z.boolean().optional(),
  confidenceDecayEnabled: z.boolean().optional(),
  challengeModeEnabled: z.boolean().optional(),
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
  expertiseLevel: undefined as unknown as UserPreferences['expertiseLevel'],
  deepResearchEnabled: true,
  collectionsEnabled: true,
  graphEnabled: true,
  sourceProvenanceEnabled: true,
  verifiedResolutionEnabled: true,
  confidenceDecayEnabled: true,
  challengeModeEnabled: true,
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

  function oneOf<T extends readonly string[]>(allowed: T, raw: unknown, fallback: T[number]): T[number] {
    if (allowed.includes(raw as T[number])) return raw as T[number];
    return fallback;
  }

  function bool(raw: unknown, fallback: boolean): boolean {
    if (typeof raw === 'boolean') return raw;
    return fallback;
  }

  const EXPERTISE = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
  return {
    theme: oneOf(THEMES, v.theme, DEFAULTS.theme),
    emailDigest: oneOf(DIGESTS, v.emailDigest, DEFAULTS.emailDigest),
    pushEnabled: bool(v.pushEnabled, DEFAULTS.pushEnabled),
    mentionEmails: bool(v.mentionEmails, DEFAULTS.mentionEmails),
    replyEmails: bool(v.replyEmails, DEFAULTS.replyEmails),
    publicActivityFeed: bool(v.publicActivityFeed, DEFAULTS.publicActivityFeed),
    aiSummaryEnabled: bool(v.aiSummaryEnabled, DEFAULTS.aiSummaryEnabled),
    expertiseLevel: (EXPERTISE as readonly string[]).includes(v.expertiseLevel as string) ? (v.expertiseLevel as UserPreferences['expertiseLevel']) : DEFAULTS.expertiseLevel,
    deepResearchEnabled: bool(v.deepResearchEnabled, DEFAULTS.deepResearchEnabled as boolean),
    collectionsEnabled: bool(v.collectionsEnabled, DEFAULTS.collectionsEnabled as boolean),
    graphEnabled: bool(v.graphEnabled, DEFAULTS.graphEnabled as boolean),
    sourceProvenanceEnabled: bool(v.sourceProvenanceEnabled, DEFAULTS.sourceProvenanceEnabled as boolean),
    verifiedResolutionEnabled: bool(v.verifiedResolutionEnabled, DEFAULTS.verifiedResolutionEnabled as boolean),
    confidenceDecayEnabled: bool(v.confidenceDecayEnabled, DEFAULTS.confidenceDecayEnabled as boolean),
    challengeModeEnabled: bool(v.challengeModeEnabled, DEFAULTS.challengeModeEnabled as boolean),
  };
}
