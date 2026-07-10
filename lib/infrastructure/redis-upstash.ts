import { Redis } from '@upstash/redis';
import { logger } from '@/lib/infrastructure/logger';

let _upstashRedis: Redis | null = null;

/**
 * Shared Upstash Redis client for quota/rate-limit operations.
 * Uses HTTP REST API — different protocol from ioredis (native TCP).
 * Returns null if Upstash env vars are not configured.
 */
export function getUpstashRedis(): Redis | null {
  if (_upstashRedis) return _upstashRedis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  _upstashRedis = new Redis({ url, token });
  return _upstashRedis;
}

/**
 * Reset the cached Upstash Redis client. Use in tests to avoid stale singletons.
 */
export function resetUpstashRedis(): void {
  _upstashRedis = null;
}

/**
 * Lua script for atomic INCR + EXPIRE.
 * Prevents orphan keys with no TTL if the process crashes between operations.
 *
 * Usage: await redis.eval(ATOMIC_INCR_EXPIRE_LUA, 1, key, ttlSeconds)
 * Returns the new counter value.
 */
export const ATOMIC_INCR_EXPIRE_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
`;

/**
 * Lua script for check-then-increment: only increments if current value < limit.
 * Returns -1 if limit already reached (no increment), otherwise returns the new count.
 * Prevents rejected requests from consuming counter capacity.
 *
 * Usage: await redis.eval(CHECK_AND_INCR_EXPIRE_LUA, key, limit, ttlSeconds)
 * Returns the new counter value, or -1 if limit reached.
 */
export const CHECK_AND_INCR_EXPIRE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
if current >= limit then
  return -1
end
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return count
`;

/**
 * Seconds remaining until the next UTC midnight.
 * Used for daily quota TTL.
 */
export function getSecondsUntilUtcMidnight(): number {
  const now = new Date();
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0
  );
  return Math.max(1, Math.floor((nextUtcMidnight - now.getTime()) / 1000));
}
