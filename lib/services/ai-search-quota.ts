import { Redis } from '@upstash/redis';
import { logger } from '@/lib/infrastructure/logger';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

const DAILY_LIMIT = 20;

export function getSecondsUntilUtcMidnight() {
  const now = new Date();
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0
  );
  return Math.max(1, Math.floor((nextUtcMidnight - now.getTime()) / 1000));
}

export async function consumeAiSearchQuota(
  userId: string
): Promise<{ allowed: boolean; remaining: number }> {
  const r = getRedis();
  if (!r) {
    logger.warn('[consumeAiSearchQuota] Redis unavailable, allowing request (fail-open)');
    return { allowed: true, remaining: -1 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `ai_search:${userId}:${date}`;

  try {
    const used = await r.incr(key);
    if (used === 1) {
      await r.expire(key, getSecondsUntilUtcMidnight());
    }

    return {
      allowed: used <= DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - used),
    };
  } catch (error) {
    logger.error('[consumeAiSearchQuota] Redis error', error);
    return { allowed: true, remaining: -1 };
  }
}
