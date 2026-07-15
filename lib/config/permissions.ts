/**
 * Permission constants and helpers
 * Global User.role is the only role system (USER / MODERATOR / ADMIN).
 */

import { USER_ROLES, type UserRole } from './constants';

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

/**
 * Check if a role has a specific permission
 */
export function hasPermission(
  role: UserRole | string,
  permission: keyof typeof PERMISSIONS
): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role as UserRole);
}

/**
 * Check if user can perform moderation actions
 */
export function canModerate(role: UserRole): boolean {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.MODERATOR;
}

/**
 * Check if user is admin
 */
export function isAdmin(role: UserRole): boolean {
  return role === USER_ROLES.ADMIN;
}

/**
 * Thread-level management: creator or platform mod/admin
 */
export function canManageThreadAsUser(
  role: UserRole,
  userId: string,
  createdBy: string | null
): boolean {
  if (canModerate(role)) {
    return true;
  }
  return createdBy !== null && createdBy === userId;
}
