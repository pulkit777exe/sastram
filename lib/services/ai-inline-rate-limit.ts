import { Redis } from '@upstash/redis';
import { logger } from '@/lib/infrastructure/logger';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const DAILY_LIMIT = 3;

function getSecondsUntilUtcMidnight() {
  const now = new Date();
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0
  );
  return Math.max(1, Math.floor((nextUtcMidnight - now.getTime()) / 1000));
}

export async function consumeAiInlineQuota(params: {
  userId: string;
  threadId: string;
}): Promise<{ allowed: boolean; used: number }> {
  if (!redis) {
    return { allowed: true, used: 0 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `ai_inline:${params.userId}:${params.threadId}:${date}`;

  try {
    const used = await redis.incr(key);
    if (used === 1) {
      await redis.expire(key, getSecondsUntilUtcMidnight());
    }

    return {
      allowed: used <= DAILY_LIMIT,
      used,
    };
  } catch (error) {
    logger.error('[consumeAiInlineQuota]', error);
    return { allowed: true, used: 0 };
  }
}
