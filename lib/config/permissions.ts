/**
 * The single authorization seam — every role check in the app resolves here.
 * Other modules re-export from this file rather than comparing roles inline.
 */

import { USER_ROLES, type UserRole } from './constants';
import { AppError } from '@/lib/utils/errors';

// Role args are nullable throughout so callers can pass an unauthenticated
// session straight through without a guard.
export function canModerate(userRole: UserRole | string | null | undefined): boolean {
  return userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.MODERATOR;
}

export function isAdmin(userRole: UserRole | string | null | undefined): boolean {
  return userRole === USER_ROLES.ADMIN;
}

const HTTP_FORBIDDEN = 403;

export function requireAdmin(userRole: UserRole | string | null | undefined): void {
  const hasAdminAccess = isAdmin(userRole);
  if (!hasAdminAccess) {
    throw new AppError('Admin access required', 'FORBIDDEN', HTTP_FORBIDDEN);
  }
}

export function requireModerator(userRole: UserRole | string | null | undefined): void {
  const hasModeratorAccess = canModerate(userRole);
  if (!hasModeratorAccess) {
    throw new AppError('Moderator access required', 'FORBIDDEN', HTTP_FORBIDDEN);
  }
}
