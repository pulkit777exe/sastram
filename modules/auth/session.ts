import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Role, ThreadMember, ThreadRole, User } from '@prisma/client';
import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { AppError } from '@/lib/utils/errors';

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'image' | 'role' | 'status'>;

export interface SessionPayload {
  user: SessionUser;
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  const { user } = session;

  let role: Role = Role.USER;
  let status: User['status'] = 'ACTIVE';

  try {
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        role: true,
        status: true,
      },
    });

    if (fullUser) {
      role = fullUser.role as Role;
      status = fullUser.status;
    }
  } catch {
    logger.warn('[auth] Failed to fetch full user profile, using auth defaults', { userId: user.id });
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      role,
      status,
    },
  };
});

export async function requireSession(checkBanStatus = true): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect('/login?reason=session_expired');
  }

  if (checkBanStatus && session.user.status === 'BANNED') {
    redirect('/banned');
  }

  return session;
}

/**
 * API route variant — throws an error instead of redirecting.
 * Use in API route handlers where redirect() is not available.
 */
export async function requireSessionOrThrow(checkBanStatus = true): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AppError('Unauthorized: no session', 'AUTH_REQUIRED', 401);
  }

  if (checkBanStatus && session.user.status === 'BANNED') {
    throw new AppError('Forbidden: user is banned', 'FORBIDDEN', 403);
  }

  return session;
}

/**
 * Require that a user is a member of the given thread.
 * Returns the ThreadMember record if membership exists.
 * Throws (redirects to dashboard) if not a member.
 *
 * Usage in server actions:
 *   const membership = await requireThreadMembership(threadId, session.user.id);
 *
 * Usage in API routes (throws instead of redirecting):
 *   const membership = await requireThreadMembershipOrThrow(threadId, userId);
 */
export async function requireThreadMembership(
  threadId: string,
  userId: string,
  requiredRole?: ThreadRole
): Promise<ThreadMember> {
  const membership = await prisma.threadMember.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });

  if (!membership) {
    redirect('/dashboard');
  }

  if (requiredRole && membership.role !== requiredRole) {
    redirect('/dashboard');
  }

  return membership;
}

/**
 * API route variant — throws an error instead of redirecting.
 * Use in API route handlers where redirect() is not available.
 */
export async function requireThreadMembershipOrThrow(
  threadId: string,
  userId: string,
  requiredRole?: ThreadRole
): Promise<ThreadMember> {
  const membership = await prisma.threadMember.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });

  if (!membership) {
    throw new AppError('Forbidden: not a member of this thread', 'FORBIDDEN', 403);
  }

  if (requiredRole && membership.role !== requiredRole) {
    throw new AppError('Forbidden: insufficient role', 'FORBIDDEN', 403);
  }

  return membership;
}

export function isAdmin(user: SessionUser | undefined | null): boolean {
  return user?.role === Role.ADMIN;
}

export function assertAdmin(user: SessionUser | undefined | null) {
  if (!isAdmin(user)) {
    redirect('/dashboard');
  }
}
