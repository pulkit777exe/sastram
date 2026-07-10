import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, CHECK_AND_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

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
    const result = (await r.eval(CHECK_AND_INCR_EXPIRE_LUA, [key], [DAILY_LIMIT, getSecondsUntilUtcMidnight()])) as number;

    if (result === -1) {
      return { allowed: false, remaining: 0 };
    }

    return {
      allowed: true,
      remaining: Math.max(0, DAILY_LIMIT - result),
    };
  } catch (error) {
    logger.error('[consumeAiAnalysisQuota] Redis error', error);
    return { allowed: false, remaining: 0 };
  }
}
