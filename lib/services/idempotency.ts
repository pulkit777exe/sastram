import { getUpstashRedis, getSecondsUntilUtcMidnight } from '@/lib/infrastructure/redis-upstash';

const MIN_IDEMPOTENCY_TTL_SECONDS = 60; // safety floor — at least 1 minute

/** Returns true the first time a key is seen, false on replays. Fails open. */
export async function consumeIdempotencyKey(idempotencyKey: string): Promise<boolean> {
  const redis = getUpstashRedis();
  if (redis === null || redis === undefined) return true;

  try {
    const ttlSeconds = Math.max(MIN_IDEMPOTENCY_TTL_SECONDS, getSecondsUntilUtcMidnight());
    // 'OK' on first write; null when the key already existed.
    const setResult = await redis.set(idempotencyKey, '1', { nx: true, ex: ttlSeconds });
    return setResult === 'OK';
  } catch {
    return true;
  }
}
