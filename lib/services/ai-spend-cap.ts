import { logger } from '@/lib/infrastructure/logger';
import { classifyAiCallCost, AiCostTier, AiCallPath } from '@/lib/services/ai-cost-classification';
import { getUpstashRedis, getSecondsUntilUtcMidnight, CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA, withRedisTimeout } from '@/lib/infrastructure/redis-upstash';

const DAILY_DOLLAR_LIMIT = 5.00;
const SPEND_KEY = 'ai_global_spend';

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayKey(): string {
  const today = getTodayDateString();
  return `${SPEND_KEY}:${today}`;
}

/**
 * In development a missing Redis should not block work. In production the
 * spend cap is the last line of defence after the readiness probe; silently
 * allowing every AI request would turn an Upstash outage into an unbounded
 * provider bill.
 */
function unavailablePolicy(): { allowed: boolean; remaining: number } {
  if (process.env.NODE_ENV === 'production') {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: -1 };
}

/**
 * Check-and-increment in one Lua round trip, so concurrent callers can't both
 * squeeze past the limit. Call this before doing AI work, not after.
 */
export async function consumeSpendCap(costUsd: number = 0.01): Promise<{ allowed: boolean; remaining: number }> {
  const r = getUpstashRedis();
  if (!r) {
    const policy = unavailablePolicy();
    logger.error(
      `[consumeSpendCap] Redis unavailable — ${policy.allowed ? 'allowing' : 'denying'} request (fail-${policy.allowed ? 'open' : 'closed'})`
    );
    return policy;
  }

  const key = todayKey();

  try {
    const result = (await withRedisTimeout(r.eval(CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA, [key], [DAILY_DOLLAR_LIMIT, getSecondsUntilUtcMidnight(), costUsd]) as Promise<number>, 4000)) as number;

    if (result === -1) {
      logger.warn(`[consumeSpendCap] Daily spend cap reached: $${DAILY_DOLLAR_LIMIT}/$${DAILY_DOLLAR_LIMIT}`);
      return { allowed: false, remaining: 0 };
    }

    return {
      allowed: true,
      remaining: Math.max(0, DAILY_DOLLAR_LIMIT - result),
    };
  } catch (error) {
    const policy = unavailablePolicy();
    logger.error(`[consumeSpendCap] Redis error — ${policy.allowed ? 'allowing' : 'denying'} request`, error);
    return policy;
  }
}

/**
 * Single seam for spend-cap enforcement across all AI call paths.
 * Cheap paths (classification, scoring) always allowed — cost is bounded.
 * Expensive paths (synthesis) atomically check + increment.
 */
export async function enforceAiSpendCap(path: AiCallPath): Promise<{ allowed: boolean; remaining: number }> {
  const classification = classifyAiCallCost(path);
  const isCheap = classification.tier === AiCostTier.CHEAP;

  if (isCheap) {
    // Cheap — bounded cost, no spend cap needed.
    return { allowed: true, remaining: -1 };
  }

  // Expensive — check and increment spend cap atomically.
  const estimatedCost = classification.estimatedCostUsd;
  return consumeSpendCap(estimatedCost);
}

/**
 * Read-only counterpart to `enforceAiSpendCap`: reports whether the day's
 * spend has already reached the cap without consuming any of it. Crons use
 * this for fan-out pre-flight; the consuming call happens once per unit of
 * work in the enqueued worker (ADR-0001: workers consume, fan-out only reads).
 * Production fails closed when the counter cannot be read; development stays
 * fail-open so offline work is not blocked.
 */
export async function checkAiSpendCap(path: AiCallPath): Promise<{ allowed: boolean; remaining: number }> {
  const classification = classifyAiCallCost(path);
  if (classification.tier === AiCostTier.CHEAP) {
    return { allowed: true, remaining: -1 };
  }

  const r = getUpstashRedis();
  if (!r) {
    const policy = unavailablePolicy();
    logger.error(
      `[checkAiSpendCap] Redis unavailable — ${policy.allowed ? 'allowing' : 'denying'} request (fail-${policy.allowed ? 'open' : 'closed'})`
    );
    return policy;
  }

  try {
    const rawUsed = (await withRedisTimeout(r.get(todayKey()) as Promise<number | null>, 4000)) as number | null;
    let used: number;
    if (rawUsed !== null && rawUsed !== undefined) {
      used = rawUsed;
    } else {
      used = 0;
    }
    // Fail-closed verdict for "over cap": used >= limit is definitively denied.
    return {
      allowed: used < DAILY_DOLLAR_LIMIT,
      remaining: Math.max(0, DAILY_DOLLAR_LIMIT - used),
    };
  } catch (error) {
    const policy = unavailablePolicy();
    logger.error(`[checkAiSpendCap] Redis error — ${policy.allowed ? 'allowing' : 'denying'} request`, error);
    return policy;
  }
}

export async function getAiSpendUsage(): Promise<{ used: number; limit: number; date: string }> {
  const r = getUpstashRedis();
  const date = new Date().toISOString().slice(0, 10);
  const zero = { used: 0, limit: DAILY_DOLLAR_LIMIT, date };

  if (!r) {
    return zero;
  }

  const key = todayKey();
  try {
    const rawUsed = (await withRedisTimeout(r.get(key) as Promise<number | null>, 4000)) as number | null;
    let used: number;
    if (rawUsed !== null && rawUsed !== undefined) {
      used = rawUsed;
    } else {
      used = 0;
    }
    return { used, limit: DAILY_DOLLAR_LIMIT, date };
  } catch {
    logger.warn('[ai-spend-cap] Failed to read spend from Redis, returning zero', { key });
    return zero;
  }
}
