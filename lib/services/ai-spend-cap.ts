import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, ATOMIC_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

const DAILY_LIMIT = 200;
const SPEND_KEY = 'ai_global_spend';

export async function checkAiSpendCap(): Promise<{ allowed: boolean; remaining: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[checkAiSpendCap] Redis unavailable, allowing request (fail-open for spend cap)');
    return { allowed: true, remaining: -1 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `${SPEND_KEY}:${date}`;

  try {
    const used = (await r.eval(ATOMIC_INCR_EXPIRE_LUA, [key], [getSecondsUntilUtcMidnight()])) as number;

    if (used > DAILY_LIMIT) {
      logger.warn(`[checkAiSpendCap] Daily spend cap exceeded: ${used}/${DAILY_LIMIT}`);
    }

    return {
      allowed: used <= DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - used),
    };
  } catch (error) {
    logger.error('[checkAiSpendCap] Redis error', error);
    return { allowed: true, remaining: -1 };
  }
}

export async function getAiSpendUsage(): Promise<{ used: number; limit: number; date: string }> {
  const r = getUpstashRedis();
  const date = new Date().toISOString().slice(0, 10);

  if (!r) {
    return { used: 0, limit: DAILY_LIMIT, date };
  }

  const key = `${SPEND_KEY}:${date}`;
  try {
    const used = (await r.get(key)) as number | null;
    return { used: used ?? 0, limit: DAILY_LIMIT, date };
  } catch {
    return { used: 0, limit: DAILY_LIMIT, date };
  }
}
