import { Redis } from 'ioredis';
import { logger } from '@/lib/infrastructure/logger';
import { createRedisConnection } from '@/lib/infrastructure/redis';

type CacheValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const KEY_PREFIX = 'qc:';
const DEFAULT_TTL_SECONDS = 300;

let _redis: Redis | null = null;
const _memoryCache = new Map<string, { value: string; expiry: number }>();

function getCacheClient(): Redis | null {
  if (_redis) return _redis;

  if (!process.env.REDIS_URL && !process.env.UPSTASH_REDIS_REST_URL) {
    logger.warn('[query-cache] No REDIS_URL configured, using in-memory fallback');
    return null;
  }

  try {
    // Fail fast rather than queueing: a slow cache is worse than no cache here.
    _redis = createRedisConnection({
      label: 'query-cache',
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    return _redis;
  } catch (err) {
    logger.error('[query-cache] Failed to create Redis client', { error: (err as Error).message });
    return null;
  }
}

function buildKey(parts: string[]): string {
  return KEY_PREFIX + parts.join(':');
}

export async function cacheGet<T = CacheValue>(keyParts: string[]): Promise<T | null> {
  const key = buildKey(keyParts);
  const client = getCacheClient();

  if (!client) {
    const entry = _memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      _memoryCache.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  try {
    const raw = await client.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (err) {
    logger.error('[query-cache] cacheGet error', { key, error: (err as Error).message });
    return null;
  }
}

export async function cacheSet(
  keyParts: string[],
  value: CacheValue,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const key = buildKey(keyParts);
  const client = getCacheClient();
  const serialized = JSON.stringify(value);

  if (!client) {
    _memoryCache.set(key, { value: serialized, expiry: Date.now() + ttlSeconds * 1000 });
    return;
  }

  try {
    await client.setex(key, ttlSeconds, serialized);
  } catch (err) {
    logger.error('[query-cache] cacheSet error', { key, error: (err as Error).message });
  }
}

export async function cacheDel(keyParts: string[]): Promise<void> {
  const key = buildKey(keyParts);
  const client = getCacheClient();
  _memoryCache.delete(key);
  if (!client) return;

  try {
    await client.del(key);
  } catch (err) {
    logger.error('[query-cache] cacheDel error', { key, error: (err as Error).message });
  }
}

export async function cacheWrap<T = CacheValue>(
  keyParts: string[],
  fn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<T> {
  const cached = await cacheGet<T>(keyParts);
  if (cached !== null) return cached;

  const value = await fn();
  await cacheSet(keyParts, value as CacheValue, ttlSeconds);
  return value;
}

export async function invalidatePattern(pattern: string): Promise<void> {
  const client = getCacheClient();
  const prefix = KEY_PREFIX + pattern;

  if (!client) {
    for (const key of _memoryCache.keys()) {
      if (key.startsWith(prefix)) _memoryCache.delete(key);
    }
    return;
  }

  try {
    // SCAN rather than KEYS — this runs against a shared Redis in production.
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await client.del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    logger.error('[query-cache] invalidatePattern error', { pattern, error: (err as Error).message });
  }
}
