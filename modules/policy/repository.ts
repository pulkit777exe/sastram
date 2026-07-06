import { requireSession, type SessionPayload } from '@/modules/auth/session';
import type { Role } from '@prisma/client';
import type { AuthPolicyRole } from './types';

const MODERATION_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'MODERATOR']);

export function hasAnyRole(
  role: Role | null | undefined,
  allowedRoles: ReadonlyArray<AuthPolicyRole>
): boolean {
  return Boolean(role && allowedRoles.includes(role as AuthPolicyRole));
}

export function canModerate(role: Role | null | undefined): boolean {
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
