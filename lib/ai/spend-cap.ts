import { logger } from '@/lib/infrastructure/logger';
import { classifyAiCallCost, AiCostTier, AiCallPath } from './cost-classification';
import { getUpstashRedis, getSecondsUntilUtcMidnight, CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

const DAILY_DOLLAR_LIMIT = 5.00;
const SPEND_KEY = 'ai_global_spend';

function todayKey(): string {
  return `${SPEND_KEY}:${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Read-only cap check for pre-flight (API routes). Fails open everywhere —
 * losing Redis shouldn't take AI features down, and consumeSpendCap is the
 * authoritative gate anyway.
 */
export async function checkAiSpendCap(): Promise<{ allowed: boolean; remaining: number; used: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[checkAiSpendCap] Redis unavailable, allowing request (fail-open for spend cap)');
    return { allowed: true, remaining: -1, used: 0 };
  }

  const key = todayKey();

  try {
    const used = (await r.get<number>(key)) ?? 0;
    return {
      allowed: used < DAILY_DOLLAR_LIMIT,
      remaining: Math.max(0, DAILY_DOLLAR_LIMIT - used),
      used,
    };
  } catch (error) {
    logger.error('[checkAiSpendCap] Redis error', error);
    return { allowed: true, remaining: -1, used: 0 };
  }
}

/**
 * Check-and-increment in one Lua round trip, so concurrent callers can't both
 * squeeze past the limit. Call this before doing AI work, not after.
 */
export async function consumeSpendCap(costUsd: number = 0.01): Promise<{ allowed: boolean; remaining: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[consumeSpendCap] Redis unavailable, allowing request (fail-open for spend cap)');
    return { allowed: true, remaining: -1 };
  }

  const key = todayKey();

  try {
    const result = (await r.eval(CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA, [key], [DAILY_DOLLAR_LIMIT, getSecondsUntilUtcMidnight(), costUsd])) as number;

    if (result === -1) {
      logger.warn(`[consumeSpendCap] Daily spend cap reached: $${DAILY_DOLLAR_LIMIT}/$${DAILY_DOLLAR_LIMIT}`);
      return { allowed: false, remaining: 0 };
    }

    return {
      allowed: true,
      remaining: Math.max(0, DAILY_DOLLAR_LIMIT - result),
    };
  } catch (error) {
    logger.error('[consumeSpendCap] Redis error', error);
    return { allowed: true, remaining: -1 };
  }
}

/**
 * Single seam for spend-cap enforcement across all AI call paths.
 * Cheap paths (classification, scoring) always allowed — cost is bounded.
 * Expensive paths (synthesis) atomically check + increment.
 */
export async function enforceAiSpendCap(path: AiCallPath): Promise<{ allowed: boolean; remaining: number }> {
  if (classifyAiCallCost(path).tier === AiCostTier.CHEAP) {
    return { allowed: true, remaining: -1 };
  }
  return consumeSpendCap(classifyAiCallCost(path).estimatedCostUsd);
}

export async function getAiSpendUsage(): Promise<{ used: number; limit: number; date: string }> {
  const r = getUpstashRedis();
  const date = new Date().toISOString().slice(0, 10);
  const zero = { used: 0, limit: DAILY_DOLLAR_LIMIT, date };

  if (!r) return zero;

  const key = todayKey();
  try {
    const used = (await r.get(key)) as number | null;
    return { used: used ?? 0, limit: DAILY_DOLLAR_LIMIT, date };
  } catch {
    logger.warn('[ai-spend-cap] Failed to read spend from Redis, returning zero', { key });
    return zero;
  }
}
