import { requireSession, type SessionPayload } from '@/modules/auth/session';
import type { AuthPolicyRole } from './types';
import { canModerate } from '@/lib/config/permissions';

export async function requireRole(
  allowedRoles: ReadonlyArray<AuthPolicyRole>,
  checkBanStatus = true
): Promise<SessionPayload> {
  const session = await requireSession(checkBanStatus);
  if (!session.user.role || !allowedRoles.includes(session.user.role as AuthPolicyRole)) {
    throw new Error('FORBIDDEN');
  }

  return session;
}

export async function requireModerationRole(checkBanStatus = true): Promise<SessionPayload> {
  const session = await requireSession(checkBanStatus);
  if (!canModerate(session.user.role)) {
    throw new Error('FORBIDDEN');
  }

  return session;
}
