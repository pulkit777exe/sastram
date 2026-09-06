import { requireSession, type SessionPayload } from '@/modules/auth';
import type { AuthPolicyRole } from './types';
import { canModerate } from '@/lib/config/permissions';
import { AppError } from '@/lib/utils/errors';

export async function requireRole(
  allowedRoles: ReadonlyArray<AuthPolicyRole>,
  checkBanStatus = true
): Promise<SessionPayload> {
  const session = await requireSession(checkBanStatus);
  if (!session.user.role || !allowedRoles.includes(session.user.role as AuthPolicyRole)) {
    throw new AppError('Forbidden', 'FORBIDDEN', 403);
  }

  return session;
}

export async function requireModerationRole(checkBanStatus = true): Promise<SessionPayload> {
  const session = await requireSession(checkBanStatus);
  if (!canModerate(session.user.role)) {
    throw new AppError('Forbidden', 'FORBIDDEN', 403);
  }

  return session;
}
