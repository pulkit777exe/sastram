'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { getSession } from '@/modules/auth';
import { createServerAction } from '@/lib/utils/server-action';
import { logger } from '@/lib/infrastructure/logger';

const NOT_AUTHENTICATED = {
  data: null,
  error: 'Not authenticated',
  ok: false,
  errorCode: 'AUTH_REQUIRED',
} as const;

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const changePasswordAction = createServerAction(
  { schema: changePasswordSchema, actionName: 'changePasswordAction' },
  async ({ currentPassword, newPassword }) => {
    const session = await getSession();
    if (!session) return NOT_AUTHENTICATED;
    try {
      await auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: false },
        headers: await headers(),
      });
      return { data: { ok: true }, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[changePasswordAction]', error);
      const message = error instanceof Error ? error.message : 'Failed to change password';
      return { data: null, error: message, ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

const changeEmailSchema = z.object({
  newEmail: z.string().email('Enter a valid email address'),
});

export const changeEmailAction = createServerAction(
  { schema: changeEmailSchema, actionName: 'changeEmailAction' },
  async ({ newEmail }) => {
    const session = await getSession();
    if (!session) return NOT_AUTHENTICATED;
    try {
      await auth.api.changeEmail({
        body: {
          newEmail,
          callbackURL: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/settings?tab=account`,
        },
        headers: await headers(),
      });
      return { data: { ok: true }, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[changeEmailAction]', error);
      const message = error instanceof Error ? error.message : 'Failed to change email';
      return { data: null, error: message, ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const listSessionsAction = createServerAction(
  { schema: z.object({}), actionName: 'listSessionsAction' },
  async () => {
    const current = await getSession();
    if (!current) return NOT_AUTHENTICATED;
    try {
      const currentToken = await getCurrentSessionToken();
      const sessions = await prisma.session.findMany({
        where: { userId: current.user.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        data: {
          sessions: sessions.map((s) => ({
            id: s.id,
            token: s.token,
            ipAddress: s.ipAddress,
            userAgent: s.userAgent,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            isCurrent: s.token === currentToken,
          })),
        },
        error: null,
        ok: true,
        errorCode: null,
      };
    } catch (error) {
      logger.error('[listSessionsAction]', error);
      return { data: null, error: 'Failed to load sessions', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

const revokeSessionSchema = z.object({
  token: z.string().min(1),
});

export const revokeSessionAction = createServerAction(
  { schema: revokeSessionSchema, actionName: 'revokeSessionAction' },
  async ({ token }) => {
    const session = await getSession();
    if (!session) return NOT_AUTHENTICATED;
    try {
      await auth.api.revokeSession({ body: { token }, headers: await headers() });
      return { data: { ok: true }, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[revokeSessionAction]', error);
      return { data: null, error: 'Failed to revoke session', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

async function getCurrentSessionToken(): Promise<string | null> {
  const h = await headers();
  const cookie = h.get('cookie');
  if (!cookie) return null;
  const match = cookie.match(/better-auth\.session_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function decodeIdTokenDisplayName(idToken: string | null, providerId: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf-8'));
    if (providerId === 'github') return payload.login ?? payload.email ?? payload.name ?? null;
    return payload.email ?? payload.name ?? null;
  } catch {
    return null;
  }
}

export const getLinkedAccountsAction = createServerAction(
  { schema: z.object({}), actionName: 'getLinkedAccountsAction' },
  async () => {
    const session = await getSession();
    if (!session) return { ...NOT_AUTHENTICATED, data: [] };
    const accounts = await prisma.account.findMany({
      where: { userId: session.user.id },
      select: { providerId: true, createdAt: true, idToken: true },
    });
    return {
      data: accounts.map((a) => ({
        provider: a.providerId,
        linkedAt: a.createdAt,
        displayName: decodeIdTokenDisplayName(a.idToken, a.providerId),
      })),
      error: null,
      ok: true,
      errorCode: null,
    };
  }
);

const unlinkAccountSchema = z.object({
  provider: z.string().min(1),
});

export const unlinkAccountAction = createServerAction(
  { schema: unlinkAccountSchema, actionName: 'unlinkAccountAction' },
  async ({ provider }) => {
    const session = await getSession();
    if (!session) return NOT_AUTHENTICATED;
    try {
      const accounts = await prisma.account.findMany({
        where: { userId: session.user.id },
        select: { providerId: true },
      });
      if (accounts.length <= 1) {
        return {
          data: null,
          error: 'You must keep at least one sign-in method.',
          ok: false,
          errorCode: 'FORBIDDEN',
        };
      }
      await auth.api.unlinkAccount({ body: { providerId: provider }, headers: await headers() });
      return { data: { ok: true }, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[unlinkAccountAction]', error);
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('SESSION_NOT_FRESH') || msg.includes('Unauthorized')) {
        return { data: null, error: 'Session expired. Please sign in again and try unlinking.', ok: false, errorCode: 'AUTH_REQUIRED' };
      }
      return { data: null, error: msg || 'Failed to unlink account', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);
