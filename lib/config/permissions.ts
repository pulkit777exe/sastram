/**
 * The single authorization seam — every role check in the app resolves here.
 * Other modules re-export from this file rather than comparing roles inline.
 */

import { USER_ROLES, type UserRole } from './constants';
import { AppError } from '@/lib/utils/errors';

// Role args are nullable throughout so callers can pass an unauthenticated
// session straight through without a guard.
export function canModerate(role: UserRole | string | null | undefined): boolean {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.MODERATOR;
}

export function isAdmin(role: UserRole | string | null | undefined): boolean {
  return role === USER_ROLES.ADMIN;
}

export function requireAdmin(role: UserRole | string | null | undefined): void {
  if (!isAdmin(role)) {
    throw new AppError('Admin access required', 'FORBIDDEN', 403);
  }
}

export function requireModerator(role: UserRole | string | null | undefined): void {
  if (!canModerate(role)) {
    throw new AppError('Moderator access required', 'FORBIDDEN', 403);
  }
}
