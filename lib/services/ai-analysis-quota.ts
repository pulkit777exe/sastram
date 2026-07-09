import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, ATOMIC_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

const DAILY_LIMIT = 30;

export async function consumeAiAnalysisQuota(
  userId: string
): Promise<{ allowed: boolean; remaining: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[consumeAiAnalysisQuota] Redis unavailable, allowing quota (fail-open)');
    return { allowed: true, remaining: DAILY_LIMIT };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `ai_analysis:${userId}:${date}`;

  try {
    const used = (await r.eval(ATOMIC_INCR_EXPIRE_LUA, [key], [getSecondsUntilUtcMidnight()])) as number;

    return {
      allowed: used <= DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - used),
    };
  } catch (error) {
    logger.error('[consumeAiAnalysisQuota] Redis error', error);
    return { allowed: false, remaining: 0 };
  }
}
