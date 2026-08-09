import { getUpstashRedis, getSecondsUntilUtcMidnight } from '@/lib/infrastructure/redis-upstash';

/** Returns true the first time a key is seen, false on replays. Fails open. */
export async function consumeIdempotencyKey(key: string): Promise<boolean> {
  const r = getUpstashRedis();
  if (!r) return true;

  try {
    const ttl = Math.max(60, getSecondsUntilUtcMidnight());
    // 'OK' on first write; null when the key already existed.
    return (await r.set(key, '1', { nx: true, ex: ttl })) === 'OK';
  } catch {
    return true;
  }
}
