import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, ATOMIC_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

const DAILY_LIMIT = 20;

export async function consumeAiSearchQuota(
  userId: string
): Promise<{ allowed: boolean; remaining: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[consumeAiSearchQuota] Redis unavailable, allowing request (fail-open)');
    return { allowed: true, remaining: -1 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `ai_search:${userId}:${date}`;

  try {
    const used = (await r.eval(ATOMIC_INCR_EXPIRE_LUA, [key], [getSecondsUntilUtcMidnight()])) as number;

    return {
      allowed: used <= DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - used),
    };
  } catch (error) {
    logger.error('[consumeAiSearchQuota] Redis error', error);
    return { allowed: true, remaining: -1 };
  }
}
