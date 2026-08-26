'use server';

import { requireSessionOrThrow } from '@/modules/auth';
import { canModerate, isAdmin } from '@/lib/config/permissions';
import { AppError } from '@/lib/utils/errors';

export async function requireModerator() {
  const session = await requireSessionOrThrow();
  if (!canModerate(session.user.role)) {
    throw new AppError('Moderator access required', 'FORBIDDEN', 403);
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSessionOrThrow();
  if (!isAdmin(session.user.role)) {
    throw new AppError('Admin access required', 'FORBIDDEN', 403);
  }
  return session;
}
