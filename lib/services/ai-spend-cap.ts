import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

const DAILY_DOLLAR_LIMIT = 5.00;
const SPEND_KEY = 'ai_global_spend';

/**
 * Check if the global AI spend cap has been reached without incrementing the counter.
 * Use this for read-only checks (e.g., API route pre-flight).
 */
export async function checkAiSpendCap(): Promise<{ allowed: boolean; remaining: number; used: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[checkAiSpendCap] Redis unavailable, allowing request (fail-open for spend cap)');
    return { allowed: true, remaining: -1, used: 0 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `${SPEND_KEY}:${date}`;

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
 * Atomically check the spend cap and increment the counter if under limit.
 * Returns allowed: false without incrementing if the cap is already reached.
 * Use this before executing AI work to avoid double-counting.
 */
export async function consumeSpendCap(costUsd: number = 0.01): Promise<{ allowed: boolean; remaining: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[consumeSpendCap] Redis unavailable, allowing request (fail-open for spend cap)');
    return { allowed: true, remaining: -1 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `${SPEND_KEY}:${date}`;

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

export async function getAiSpendUsage(): Promise<{ used: number; limit: number; date: string }> {
  const r = getUpstashRedis();
  const date = new Date().toISOString().slice(0, 10);

  if (!r) {
    return { used: 0, limit: DAILY_DOLLAR_LIMIT, date };
  }

  const key = `${SPEND_KEY}:${date}`;
  try {
    const used = (await r.get(key)) as number | null;
    return { used: used ?? 0, limit: DAILY_DOLLAR_LIMIT, date };
  } catch {
    logger.warn('[ai-spend-cap] Failed to read spend from Redis, returning zero', { key });
    return { used: 0, limit: DAILY_DOLLAR_LIMIT, date };
  }
}
