/**
 * Shared poll-expiry guard — canonical home for the rule previously
 * duplicated across threads-write/service.ts, messages/actions/post.ts and
 * polls/actions.ts.
 *
 * Returns an error message when invalid, null when valid or empty.
 */
export function validatePollExpiry(expiresAt: Date | string | null | undefined): string | null {
  if (expiresAt === undefined || expiresAt === null || expiresAt === '') return null;
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime()) || exp.getTime() <= Date.now()) {
    return 'Poll expiry must be in the future';
  }
  return null;
}
