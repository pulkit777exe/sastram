import { getUpstashRedis, getSecondsUntilUtcMidnight } from '@/lib/infrastructure/redis-upstash';

export async function consumeIdempotencyKey(key: string): Promise<boolean> {
  const r = getUpstashRedis();
  if (!r) return true;

  try {
    const ttl = Math.max(60, getSecondsUntilUtcMidnight());
    const set = await r.set(key, '1', { nx: true, ex: ttl });
    // Upstash returns 'OK' on first write (allow), null if the key already existed (reject).
    return set === 'OK';
  } catch {
    return true;
  }
}
