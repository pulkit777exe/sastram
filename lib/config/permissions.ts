/**
 * The single authorization seam — every role check in the app resolves here.
 * Other modules re-export from this file rather than comparing roles inline.
 */

import { USER_ROLES, type UserRole } from './constants';
import { AppError } from '@/lib/utils/errors';

export const PERMISSIONS = {
  // Message permissions
  CREATE_MESSAGE: [USER_ROLES.USER, USER_ROLES.MODERATOR, USER_ROLES.ADMIN],
  EDIT_OWN_MESSAGE: [USER_ROLES.USER, USER_ROLES.MODERATOR, USER_ROLES.ADMIN],
  DELETE_OWN_MESSAGE: [USER_ROLES.USER, USER_ROLES.MODERATOR, USER_ROLES.ADMIN],
  DELETE_ANY_MESSAGE: [USER_ROLES.MODERATOR, USER_ROLES.ADMIN],
  PIN_MESSAGE: [USER_ROLES.MODERATOR, USER_ROLES.ADMIN],

  // Thread permissions — creators manage their own threads; mods/admins manage all
  CREATE_THREAD: [USER_ROLES.USER, USER_ROLES.MODERATOR, USER_ROLES.ADMIN],
  DELETE_THREAD: [USER_ROLES.MODERATOR, USER_ROLES.ADMIN],
  EDIT_THREAD: [USER_ROLES.MODERATOR, USER_ROLES.ADMIN],

  // Moderation permissions
  BAN_USER: [USER_ROLES.ADMIN],
  UNBAN_USER: [USER_ROLES.ADMIN],
  VIEW_REPORTS: [USER_ROLES.ADMIN],
  RESOLVE_REPORTS: [USER_ROLES.ADMIN],

  // User permissions
  VIEW_ADMIN_PANEL: [USER_ROLES.ADMIN],
  MANAGE_USERS: [USER_ROLES.ADMIN],
} as const;

export function hasPermission(
  role: UserRole | string,
  permission: keyof typeof PERMISSIONS
): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role as UserRole);
}

// Role args are nullable throughout so callers can pass an unauthenticated
// session straight through without a guard.
export function canModerate(role: UserRole | string | null | undefined): boolean {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.MODERATOR;
}

export function isAdmin(role: UserRole | string | null | undefined): boolean {
  return role === USER_ROLES.ADMIN;
}

/** Thread-level management: creator or platform mod/admin. */
export function canManageThreadAsUser(
  role: UserRole,
  userId: string,
  createdBy: string | null
): boolean {
  return canModerate(role) || (createdBy !== null && createdBy === userId);
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
