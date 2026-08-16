/**
 * The single authorization seam — every role check in the app resolves here.
 * Other modules re-export from this file rather than comparing roles inline.
 *
 * These are pure predicates ("is this user allowed?"). Enforcement that also
 * loads the session lives in lib/middleware/moderation.ts (requireModerator /
 * requireAdmin) — do not add session-aware variants here.
 */

import { USER_ROLES, type UserRole } from './constants';

// Role args are nullable throughout so callers can pass an unauthenticated
// session straight through without a guard.
export function canModerate(role: UserRole | string | null | undefined): boolean {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.MODERATOR;
}

export function isAdmin(role: UserRole | string | null | undefined): boolean {
  return role === USER_ROLES.ADMIN;
}
