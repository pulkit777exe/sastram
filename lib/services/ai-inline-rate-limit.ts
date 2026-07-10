import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, CHECK_AND_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

const DAILY_LIMIT = 3;

export async function consumeAiInlineQuota(params: {
  userId: string;
  threadId: string;
}): Promise<{ allowed: boolean; used: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[consumeAiInlineQuota] Redis unavailable, allowing quota (fail-open)');
    return { allowed: true, used: 0 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `ai_inline:${params.userId}:${params.threadId}:${date}`;

  try {
    const result = (await r.eval(CHECK_AND_INCR_EXPIRE_LUA, [key], [DAILY_LIMIT, getSecondsUntilUtcMidnight()])) as number;

    if (result === -1) {
      return { allowed: false, used: DAILY_LIMIT };
    }

    return {
      allowed: true,
      used: result,
    };
  } catch (error) {
    logger.error('[consumeAiInlineQuota]', error);
    return { allowed: false, used: 0 };
  }
}
