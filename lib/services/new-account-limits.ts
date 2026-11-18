import { prisma } from '@/lib/infrastructure/prisma';
import { AppError } from '@/lib/utils/errors';
import { actionFailure } from '@/lib/utils/server-action';
import type { ActionErrorCode } from '@/lib/utils/server-action';

export const NEW_ACCOUNT_WRITE_WINDOW_MINUTES = 30;
export const NEW_ACCOUNT_THREAD_LIMIT = 2;
export const NEW_ACCOUNT_MESSAGE_LIMIT = 8;

export type NewAccountWriteAction = 'thread' | 'message';

export type NewAccountPolicyResult =
  | { ok: true }
  | {
      ok: false;
      code: ActionErrorCode;
      message: string;
    };

function minutesToMs(minutes: number) {
  return minutes * 60 * 1000;
}

export function isPrivilegedRole(role?: string | null) {
  return role === 'ADMIN' || role === 'MODERATOR';
}

export async function enforceNewAccountWriteLimit(params: {
  userId: string;
  role?: string | null;
  action: NewAccountWriteAction;
}): Promise<NewAccountPolicyResult> {
  const { userId, role, action } = params;
  if (isPrivilegedRole(role)) return { ok: true };

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    // Defensive: treat unknown account age as new for write-abuse controls.
    const createdAt = user?.createdAt ?? new Date();
    const windowMs = minutesToMs(NEW_ACCOUNT_WRITE_WINDOW_MINUTES);
    const ageMs = Date.now() - createdAt.getTime();
    if (ageMs >= windowMs) {
      return { ok: true };
    }

    const since = new Date(Date.now() - windowMs);
    const limit = action === 'thread' ? NEW_ACCOUNT_THREAD_LIMIT : NEW_ACCOUNT_MESSAGE_LIMIT;
    const count =
      action === 'thread'
        ? await prisma.thread.count({ where: { createdBy: userId, createdAt: { gte: since } } })
        : await prisma.message.count({ where: { senderId: userId, createdAt: { gte: since } } });

    if (count < limit) return { ok: true };

    const minutesLeft = Math.max(
      1,
      Math.ceil(Math.max(0, createdAt.getTime() + windowMs - Date.now()) / 60000)
    );
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: `New accounts have a temporary posting limit to reduce spam. Please try again in about ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} or post more gradually.`,
    };
  } catch {
    // Fail closed for abuse-prone write paths when account-age checks cannot be evaluated.
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message:
        'Temporary posting protection is active and account checks are unavailable right now. Please try again shortly.',
    };
  }
}

export async function enforceNewAccountWriteLimitOrThrow(params: {
  userId: string;
  role?: string | null;
  action: NewAccountWriteAction;
}): Promise<void> {
  const result = await enforceNewAccountWriteLimit(params);
  if (result.ok) return;
  throw new AppError(result.message, result.code, 429);
}

export function newAccountLimitFailure(result: Extract<NewAccountPolicyResult, { ok: false }>) {
  return actionFailure(result.code, result.message);
}

