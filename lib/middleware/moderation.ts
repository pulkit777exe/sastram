'use server';

import { requireSessionOrThrow } from '@/modules/auth';
import { canModerate, isAdmin } from '@/lib/config/permissions';
import { AppError } from '@/lib/utils/errors';

const HTTP_FORBIDDEN = 403;

export async function requireModerator() {
  const session = await requireSessionOrThrow();
  const userRole = session.user.role;
  const hasModeratorAccess = canModerate(userRole);
  if (!hasModeratorAccess) {
    throw new AppError('Moderator access required', 'FORBIDDEN', HTTP_FORBIDDEN);
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSessionOrThrow();
  const userRole = session.user.role;
  const hasAdminAccess = isAdmin(userRole);
  if (!hasAdminAccess) {
    throw new AppError('Admin access required', 'FORBIDDEN', HTTP_FORBIDDEN);
  }
  return session;
}
