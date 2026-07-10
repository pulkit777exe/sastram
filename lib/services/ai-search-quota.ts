import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, CHECK_AND_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

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
    const result = (await r.eval(CHECK_AND_INCR_EXPIRE_LUA, [key], [DAILY_LIMIT, getSecondsUntilUtcMidnight()])) as number;

    if (result === -1) {
      return { allowed: false, remaining: 0 };
    }

    return {
      allowed: true,
      remaining: Math.max(0, DAILY_LIMIT - result),
    };
  } catch (error) {
    logger.error('[consumeAiSearchQuota] Redis error', error);
    return { allowed: true, remaining: -1 };
  }
}
