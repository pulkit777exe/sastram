/**
 * Guarded AI execution seam (D7) — one place for the quota → spend → gate
 * order. Routes consume spend here; workers skip consumption when the
 * request-scoped `alreadyBilled` idempotency key is present (see
 * `runGuardedWorker` in lib/queue/workers/_shared.ts).
 */

import { logger } from '@/lib/infrastructure/logger';
import { consumeQuota, type QuotaKind } from '@/lib/services/daily-quota';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { evaluateAiCostGate, type AiCallPath } from '@/lib/services/ai-cost-classification';
import { isQuotaError } from '@/lib/utils/errors';

export interface GuardQuota {
  kind: QuotaKind;
  threadId?: string;
}

export interface GuardRejection {
  code: 'RATE_LIMITED' | 'SERVICE_UNAVAILABLE';
  message: string;
  status: 429 | 503;
}

export type GuardCheck = { ok: true } | { ok: false; rejection: GuardRejection };

export type GuardedResult<T> = { ok: true; value: T } | { ok: false; rejection: GuardRejection };

export interface CronSpendCap {
  allowed: boolean;
  remaining: number;
}

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVICE_UNAVAILABLE = 503;

function quotaRejection(): GuardRejection {
  return {
    code: 'RATE_LIMITED',
    message: 'Daily AI limit reached. Resets at UTC midnight.',
    status: HTTP_TOO_MANY_REQUESTS,
  };
}

function spendRejection(): GuardRejection {
  return {
    code: 'SERVICE_UNAVAILABLE',
    message: 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.',
    status: HTTP_SERVICE_UNAVAILABLE,
  };
}

/**
 * Spend-cap errors are matched by message (mirrors the ai-inline worker's
 * check). No isSpendCapError helper exists in lib/utils/errors — this is it.
 */
export function isSpendCapError(unknownError: unknown): boolean {
  if (!(unknownError instanceof Error)) return false;
  return unknownError.message.toLowerCase().includes('spend cap');
}

/**
 * Fixed order: quota → spend → gate. Quota denial short-circuits before any
 * spend is consumed; spend denial short-circuits before the gate.
 */
export async function checkAiGuards(
  path: AiCallPath,
  userId: string,
  options?: { quota?: GuardQuota | null }
): Promise<GuardCheck> {
  const quota = options?.quota;
  if (quota) {
    let params: Record<string, string> | string;
    if (quota.threadId) {
      params = { userId, threadId: quota.threadId };
    } else {
      params = userId;
    }
    const quotaResult = await consumeQuota(quota.kind, params);
    if (!quotaResult.allowed) {
      return { ok: false, rejection: quotaRejection() };
    }
  }

  const spendCapResult = await enforceAiSpendCap(path);
  if (!spendCapResult.allowed) {
    return { ok: false, rejection: spendRejection() };
  }

  const gateResult = evaluateAiCostGate({ path, spendCapAllowed: spendCapResult.allowed });
  if (!gateResult.allowed) {
    return { ok: false, rejection: spendRejection() };
  }

  return { ok: true };
}

/**
 * Guards first, then runs the task. Provider quota / spend-cap failures from
 * the task itself map to rejections (terminal — retrying won't help); anything
 * else rethrows.
 */
export async function runGuardedAi<T>(
  path: AiCallPath,
  userId: string,
  task: () => Promise<T>,
  options?: { quota?: GuardQuota | null }
): Promise<GuardedResult<T>> {
  const guards = await checkAiGuards(path, userId, options);
  if (!guards.ok) {
    return guards;
  }

  try {
    return { ok: true, value: await task() };
  } catch (error) {
    if (isQuotaError(error)) {
      return { ok: false, rejection: quotaRejection() };
    }
    if (isSpendCapError(error)) {
      return { ok: false, rejection: spendRejection() };
    }
    throw error;
  }
}

/**
 * One fail-open spend check per path for crons. Each path is isolated so one
 * Redis failure never blocks the others; failures allow (fail-open).
 */
export async function checkCronSpendCaps(paths: AiCallPath[]): Promise<Record<string, CronSpendCap>> {
  const caps: Record<string, CronSpendCap> = {};
  for (const path of paths) {
    try {
      caps[path] = await enforceAiSpendCap(path);
    } catch (error) {
      logger.warn(`[cron] spend cap check failed for ${path}, allowing (fail-open)`, error);
      caps[path] = { allowed: true, remaining: -1 };
    }
  }
  return caps;
}
