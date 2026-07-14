import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, CHECK_AND_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

const DAILY_LIMIT = 50;

export async function consumeImageModerationQuota(): Promise<{ allowed: boolean; remaining: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[consumeImageModerationQuota] Redis unavailable, allowing request (fail-open)');
    return { allowed: true, remaining: -1 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `img_moderation:${date}`;

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
    logger.error('[consumeImageModerationQuota] Redis error', error);
    return { allowed: true, remaining: -1 };
  }
}
