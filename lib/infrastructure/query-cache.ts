import { Redis } from 'ioredis';
import { logger } from '@/lib/infrastructure/logger';

type CacheValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const KEY_PREFIX = 'qc:';
const DEFAULT_TTL_SECONDS = 300;

let _redis: Redis | null = null;
const _memoryCache = new Map<string, { value: string; expiry: number }>();

function getCacheClient(): Redis | null {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    logger.warn('[query-cache] No REDIS_URL configured, using in-memory fallback');
    return null;
  }

  try {
    _redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    _redis.on('error', (err) => {
      logger.error('[query-cache] Redis error', { error: err.message });
    });

    return _redis;
  } catch (err) {
    logger.error('[query-cache] Failed to create Redis client', { error: (err as Error).message });
    return null;
  }
}

function memoryGet(key: string): CacheValue | null {
  const entry = _memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    _memoryCache.delete(key);
    return null;
  }
  return JSON.parse(entry.value);
}

function memorySet(key: string, value: CacheValue, ttlSeconds: number): void {
  _memoryCache.set(key, {
    value: JSON.stringify(value),
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

function memoryDel(key: string): void {
  _memoryCache.delete(key);
}

function buildKey(parts: string[]): string {
  return KEY_PREFIX + parts.join(':');
}

export async function cacheGet<T = CacheValue>(keyParts: string[]): Promise<T | null> {
  const key = buildKey(keyParts);
  const client = getCacheClient();
  if (!client) {
    return (memoryGet(key) as T) ?? null;
  }
  try {
    const raw = await client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.error('[query-cache] cacheGet error', { key, error: (err as Error).message });
    return null;
  }
}

export async function cacheSet(keyParts: string[], value: CacheValue, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
  const key = buildKey(keyParts);
  const client = getCacheClient();
  const serialized = JSON.stringify(value);
  if (!client) {
    memorySet(key, value, ttlSeconds);
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
  memoryDel(key);
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
  if (!client) {
    for (const key of _memoryCache.keys()) {
      if (key.startsWith(KEY_PREFIX + pattern)) {
        _memoryCache.delete(key);
      }
    }
    return;
  }
  try {
    let cursor = '0';
    do {
      const result = await (client as any).scan(cursor, 'MATCH', KEY_PREFIX + pattern + '*', 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.error('[query-cache] invalidatePattern error', { pattern, error: (err as Error).message });
  }
}
