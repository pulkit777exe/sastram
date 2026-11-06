/**
 * Guarded AI execution seam (D7) — one place for the quota → spend → gate
 * order. Routes consume spend here; workers skip consumption when the
 * request-scoped `alreadyBilled` idempotency key is present (see
 * `runGuardedWorker` in lib/queue/workers/_shared.ts).
 */

import { logger } from '@/lib/infrastructure/logger';
import { consumeQuota, type QuotaKind } from '@/lib/services/daily-quota';
import {
  enforceAiSpendCap,
  getAiSpendDailyLimit,
  readTodayAiSpend,
} from '@/lib/services/ai-spend-cap';
import {
  evaluateAiCostGate,
  classifyAiCallCost,
  AiCostTier,
  type AiCallPath,
} from '@/lib/services/ai-cost-classification';
import { isQuotaError } from '@/lib/utils/errors';

const AI_SPEND_DAILY_LIMIT = getAiSpendDailyLimit();

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
 * One read-only spend check for crons (one Redis RTT for the whole fan-out —
 * every path reads the same counter, so they share one GET instead of one per
 * path). Consumes nothing — enqueued workers consume their
 * own per-execution estimate via `runGuardedWorker` (ADR-0001: routes that run
 * work synchronously still pass `alreadyBilled`). Cheap paths are always
 * allowed without touching Redis; the read is only needed for expensive ones.
 * Fail closed for expensive paths when the counter cannot be read in production.
 */
export async function checkCronSpendCaps(paths: AiCallPath[]): Promise<Record<string, CronSpendCap>> {
  const classificationByPath = new Map(paths.map((path) => [path, classifyAiCallCost(path)]));
  const needsExpensive = paths.some((path) => classificationByPath.get(path)!.tier !== AiCostTier.CHEAP);

  let used = 0;
  let spendReadFailed = false;
  if (needsExpensive) {
    try {
      used = await readTodayAiSpend();
    } catch (error) {
      spendReadFailed = true;
      logger.warn('[cron] spend cap read failed — applying fallback policy for expensive paths', error);
    }
  }

  const caps: Record<string, CronSpendCap> = {};
  for (const path of paths) {
    const classification = classificationByPath.get(path)!;
    if (classification.tier === AiCostTier.CHEAP) {
      caps[path] = { allowed: true, remaining: -1 };
      continue;
    }
    if (spendReadFailed) {
      // Unknown spend: production denies expensive work, development allows it
      // and reports -1 (unlimited/unknown) rather than a fabricated budget.
      caps[path] =
        process.env.NODE_ENV === 'production'
          ? { allowed: false, remaining: 0 }
          : { allowed: true, remaining: -1 };
      continue;
    }
    caps[path] = {
      allowed: used < AI_SPEND_DAILY_LIMIT,
      remaining: Math.max(0, AI_SPEND_DAILY_LIMIT - used),
    };
  }
  return caps;
}
