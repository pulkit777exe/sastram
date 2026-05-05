import { requireSession, type SessionPayload } from '@/modules/auth/session';
import type { AuthPolicyRole } from './types';

const MODERATION_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'MODERATOR', 'SUPER_ADMIN']);

export function hasAnyRole(
  role: string | null | undefined,
  allowedRoles: ReadonlyArray<AuthPolicyRole>
): boolean {
  return Boolean(role && allowedRoles.includes(role as AuthPolicyRole));
}

export function canModerate(role: string | null | undefined): boolean {
  return Boolean(role && MODERATION_ROLES.has(role));
}

export async function requireRole(
  allowedRoles: ReadonlyArray<AuthPolicyRole>,
  checkBanStatus = true
): Promise<SessionPayload> {
  const session = await requireSession(checkBanStatus);
  if (!hasAnyRole(session.user.role, allowedRoles)) {
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
