import { getUpstashRedis, getSecondsUntilUtcMidnight, withRedisTimeout } from '@/lib/infrastructure/redis-upstash';
import { logger } from '@/lib/infrastructure/logger';

const MIN_IDEMPOTENCY_TTL_SECONDS = 60; // safety floor — at least 1 minute

/** 1 hour — covers the QStash retry window. */
export const JOB_DEDUP_TTL_SECONDS = 3600;

export type ClaimScope = 'request' | 'job';

/**
 * TTL policy for exactly-once claims — the one place that decides how long
 * "seen" lasts. Request claims live until UTC midnight (matches the daily
 * quota clock); job claims live one hour (covers the QStash retry window).
 */
export function ttlForScope(scope: ClaimScope): number {
  if (scope === 'job') return JOB_DEDUP_TTL_SECONDS;
  return Math.max(MIN_IDEMPOTENCY_TTL_SECONDS, getSecondsUntilUtcMidnight());
}

/**
 * Single SET-NX seam for exactly-once. Returns true the first time a key is
 * seen, false on replays. Fails open: without Redis (or on Redis errors) a
 * double-run beats a dropped request — same rationale as the quota gates.
 */
export async function claimOnce(
  key: string,
  scope: ClaimScope = 'request',
  ttlSeconds?: number
): Promise<boolean> {
  const redis = getUpstashRedis();
  if (redis === null || redis === undefined) return true;

  try {
    const ttl = ttlSeconds ?? ttlForScope(scope);
    // 'OK' on first write; null when the key already existed.
    const setResult = await withRedisTimeout(redis.set(key, '1', { nx: true, ex: ttl }), 4000);
    return setResult === 'OK';
  } catch {
    return true;
  }
}

/** Request-scoped exactly-once (AI Pipeline idempotency keys). */
export async function consumeIdempotencyKey(idempotencyKey: string): Promise<boolean> {
  return claimOnce(idempotencyKey, 'request');
}

/**
 * Release a previously claimed key so a later delivery can re-claim it. Used
 * by the jobs route when a handler fails retryably: the claim exists to stop
 * *concurrent* duplicate delivery, not to swallow QStash retries. Returns true
 * when the key existed and was deleted; fail-safe false on Redis errors.
 */
export async function releaseOnce(key: string, scope: ClaimScope = 'request'): Promise<boolean> {
  const redis = getUpstashRedis();
  if (redis === null || redis === undefined) return false;

  try {
    const deleted = await withRedisTimeout(redis.del(key), 4000);
    return deleted > 0;
  } catch (error) {
    logger.warn(`[idempotency] failed to release ${scope} claim ${key}`, error);
    return false;
  }
}
