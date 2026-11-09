import 'server-only';

import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { AppError } from '@/lib/utils/errors';
import { isAdmin } from '@/lib/config/permissions';
import { safeRedirectPath } from '@/lib/utils/safe-redirect';
import { requireReadOrThrow, requireWriteOrThrow } from '@/lib/thread-access';
import { getSessionCookie } from 'better-auth/cookies';

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'image' | 'role' | 'status' | 'preferences'>;

export interface SessionPayload {
  user: SessionUser;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  const headersList = await headers();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      session = await withTimeout(
        auth.api.getSession({
          headers: headersList,
        }),
        attempt === 1 ? 8000 : 12000,
        'getSession'
      );
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isDbError =
        msg.includes('ENOTFOUND') ||
        msg.includes('Failed to get session') ||
        msg.includes('network error') ||
        msg.includes('getaddrinfo') ||
        msg.includes('ENETUNREACH') ||
        msg.includes('timeout after') ||
        (err as { code?: string })?.code === 'ENOTFOUND' ||
        (err as { code?: string })?.code === 'ENETUNREACH';
      if (attempt === 2) {
        if (isDbError) {
          logger.warn('[auth] getSession failed - DB unavailable, trying fallback', {
            error: msg.slice(0, 120),
          });
          // Fallback: try to read session directly from DB via cookie
          try {
            const cookieStore = await cookies();
            // Build a request-like object for getSessionCookie
            const token = getSessionCookie({
              headers: new Headers({
                cookie: cookieStore.toString(),
              }),
            } as unknown as Request);
            if (token) {
              const dbSession = await prisma.session.findUnique({
                where: { token },
                include: { user: true },
              });
              if (dbSession && dbSession.expiresAt > new Date() && !dbSession.user.deletedAt) {
                const fullUser = await prisma.user.findUnique({
                  where: { id: dbSession.user.id, deletedAt: null },
                  select: { role: true, status: true, preferences: true },
                });
                if (fullUser && fullUser.status !== 'BANNED' && fullUser.status !== 'SUSPENDED') {
                  return {
                    user: {
                      id: dbSession.user.id,
                      email: dbSession.user.email,
                      name: dbSession.user.name,
                      image: dbSession.user.image ?? null,
                      role: fullUser.role as Role,
                      status: fullUser.status,
                      preferences: (fullUser as unknown as { preferences: unknown }).preferences ?? {},
                    },
                  };
                }
              }
            }
          } catch (fallbackErr) {
            logger.warn('[auth] getSession fallback failed', {
              error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
            });
          }
          return null;
        }
        throw err;
      }
      // brief backoff before retry
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  if (!session) {
    // try fallback if we somehow got here
    try {
      const cookieStore = await cookies();
      const token = getSessionCookie({
        headers: new Headers({
          cookie: cookieStore.toString(),
        }),
      } as unknown as Request);
      if (token) {
        const dbSession = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });
        if (dbSession && dbSession.expiresAt > new Date() && !dbSession.user.deletedAt) {
          const fullUser = await prisma.user.findUnique({
            where: { id: dbSession.user.id, deletedAt: null },
            select: { role: true, status: true, preferences: true },
          });
          if (fullUser && fullUser.status !== 'BANNED' && fullUser.status !== 'SUSPENDED') {
            return {
              user: {
                id: dbSession.user.id,
                email: dbSession.user.email,
                name: dbSession.user.name,
                image: dbSession.user.image ?? null,
                role: fullUser.role as Role,
                status: fullUser.status,
                preferences: (fullUser as unknown as { preferences: unknown }).preferences ?? {},
              },
            };
          }
        }
      }
    } catch {}
    return null;
  }

  if (!session) {
    return null;
  }

  const { user } = session;

  async function tryFetchWithLogging(attempt: number): Promise<Pick<User, 'role' | 'status' | 'preferences'> | null> {
    try {
      return await prisma.user.findUnique({
        where: { id: user.id, deletedAt: null },
        select: { role: true, status: true, preferences: true },
      });
    } catch (err) {
      logger.warn('[auth] Failed to fetch full user profile', {
        userId: user.id,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  let fullUser = await tryFetchWithLogging(1);
  if (!fullUser) {
    fullUser = await tryFetchWithLogging(2);
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
      preferences: (fullUser as unknown as { preferences: unknown }).preferences ?? {},
    },
  };
});

export async function requireSession(checkBanStatus = true): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    const h = await headers();
    const requestedPath = safeRedirectPath(h.get('x-invoke-path'), '/dashboard');
    redirect(`/login?reason=session_expired&redirect=${encodeURIComponent(requestedPath)}`);
  }

  const banned = checkBanStatus && session.user.status === 'BANNED';
  const suspended = checkBanStatus && session.user.status === 'SUSPENDED';

  if (banned) {
    redirect('/banned');
  }
  if (suspended) {
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

  if (checkBanStatus && session.user.status === 'SUSPENDED') {
    throw new AppError('Forbidden: user is suspended', 'FORBIDDEN', 403);
  }

  return session;
}

export { requireReadOrThrow, requireWriteOrThrow, isAdmin };

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
