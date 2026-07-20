'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { getSession } from '@/modules/auth';
import { createServerAction } from '@/lib/utils/server-action';
import { logger } from '@/lib/infrastructure/logger';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const changePasswordAction = createServerAction(
  { schema: changePasswordSchema, actionName: 'changePasswordAction' },
  async ({ currentPassword, newPassword }) => {
    const session = await getSession();
    if (!session) {
      return { data: null, error: 'Not authenticated', ok: false, errorCode: 'AUTH_REQUIRED' };
    }
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
    if (!session) {
      return { data: null, error: 'Not authenticated', ok: false, errorCode: 'AUTH_REQUIRED' };
    }
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
    const session = await getSession();
    if (!session) {
      return { data: null, error: 'Not authenticated', ok: false, errorCode: 'AUTH_REQUIRED' };
    }
    try {
      const sessions = await auth.api.listSessions({ headers: await headers() });
      return { data: { sessions }, error: null, ok: true, errorCode: null };
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
    if (!session) {
      return { data: null, error: 'Not authenticated', ok: false, errorCode: 'AUTH_REQUIRED' };
    }
    try {
      await auth.api.revokeSession({ body: { token }, headers: await headers() });
      return { data: { ok: true }, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[revokeSessionAction]', error);
      return { data: null, error: 'Failed to revoke session', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export async function getLinkedAccountsAction() {
  try {
    const session = await getSession();
    if (!session) {
      return { data: [], error: 'Not authenticated', ok: false, errorCode: 'AUTH_REQUIRED' };
    }
    const accounts = await prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true, providerAccountId: true, createdAt: true },
    });
    return {
      data: accounts.map((a) => ({ provider: a.provider, linkedAt: a.createdAt })),
      error: null,
      ok: true,
      errorCode: null,
    };
  } catch (error) {
    logger.error('[getLinkedAccountsAction]', error);
    return { data: [], error: 'Failed to load linked accounts', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

const unlinkAccountSchema = z.object({
  provider: z.string().min(1),
});

export const unlinkAccountAction = createServerAction(
  { schema: unlinkAccountSchema, actionName: 'unlinkAccountAction' },
  async ({ provider }) => {
    const session = await getSession();
    if (!session) {
      return { data: null, error: 'Not authenticated', ok: false, errorCode: 'AUTH_REQUIRED' };
    }
    try {
      await auth.api.unlinkAccount({ body: { providerId: provider }, headers: await headers() });
      return { data: { ok: true }, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[unlinkAccountAction]', error);
      const message = error instanceof Error ? error.message : 'Failed to unlink account';
      return { data: null, error: message, ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);
