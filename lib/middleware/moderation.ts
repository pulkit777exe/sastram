'use server';

import { requireSessionOrThrow } from '@/modules/auth';
import { canModerate, isAdmin } from '@/lib/config/permissions';

export async function requireModerator() {
  const session = await requireSessionOrThrow();
  if (!canModerate(session.user.role)) {
    throw new Error('Moderator access required');
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSessionOrThrow();
  if (!isAdmin(session.user.role)) {
    throw new Error('Admin access required');
  }
  return session;
}
