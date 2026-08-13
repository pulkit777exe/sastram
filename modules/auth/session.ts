import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { AppError } from '@/lib/utils/errors';
import { isAdmin } from '@/lib/config/permissions';
import { requireThreadAccessOrThrow, requireThreadWriteOrThrow } from '@/lib/thread-access';

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

  let fullUser: Pick<User, 'role' | 'status'> | null = null;

  for (let attempt = 0; attempt < 2 && fullUser === null; attempt++) {
    try {
      fullUser = await prisma.user.findUnique({
        where: { id: user.id, deletedAt: null },
        select: { role: true, status: true },
      });
    } catch (err) {
      logger.warn('[auth] Failed to fetch full user profile', {
        userId: user.id,
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!fullUser) {
    logger.error('[auth] Could not verify user role/status after retry — failing closed', {
      userId: user.id,
    });
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      role: fullUser.role as Role,
      status: fullUser.status,
    },
  };
});

export async function requireSession(checkBanStatus = true): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || '';
    const proto = h.get('x-forwarded-proto') || 'https';
    const url = host ? `${proto}://${host}${h.get('x-invoke-path') || '/'}` : '/';
    redirect(`/login?reason=session_expired&redirect=${encodeURIComponent(url)}`);
  }

  if (checkBanStatus && session.user.status === 'BANNED') {
    redirect('/banned');
  }

  return session;
}

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

export { requireThreadAccessOrThrow, requireThreadWriteOrThrow, isAdmin };

export function isAdminUser(user: SessionUser | undefined | null): boolean {
  return isAdmin(user?.role);
}

export function assertAdmin(user: SessionUser | undefined | null) {
  if (!isAdminUser(user)) {
    redirect('/dashboard');
  }
}

export function assertAdminOrThrow(user: SessionUser | undefined | null): void {
  if (!isAdminUser(user)) {
    throw new AppError('Forbidden: admin access required', 'FORBIDDEN', 403);
  }
}