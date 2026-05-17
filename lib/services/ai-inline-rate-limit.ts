import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, ATOMIC_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

const DAILY_LIMIT = 3;

export async function consumeAiInlineQuota(params: {
  userId: string;
  threadId: string;
}): Promise<{ allowed: boolean; used: number }> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn('[consumeAiInlineQuota] Redis unavailable, denying quota (fail-closed)');
    return { allowed: false, used: 0 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `ai_inline:${params.userId}:${params.threadId}:${date}`;

  try {
    const used = (await r.eval(ATOMIC_INCR_EXPIRE_LUA, [key], [getSecondsUntilUtcMidnight()])) as number;

    return {
      allowed: used <= DAILY_LIMIT,
      used,
    };
  } catch (error) {
    logger.error('[consumeAiInlineQuota]', error);
    return { allowed: true, used: 0 };
  }
}
