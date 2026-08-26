import { Redis } from '@upstash/redis';

let _upstashRedis: Redis | null = null;
let _upstashRedisConfigKey: string | null = null;

/**
 * Upstash REST client for quota/rate-limit work. HTTP-based, so it works on
 * serverless (Vercel free tier). Returns null when Upstash isn't configured —
 * callers degrade gracefully.
 */
export function getUpstashRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const configKey = url && token ? `${url}:${token}` : null;

  // Re-create if the env changed under us (tests swap credentials at runtime).
  if (_upstashRedis && _upstashRedisConfigKey === configKey) return _upstashRedis;

  if (!url || !token) {
    resetUpstashRedis();
    return null;
  }

  _upstashRedis = new Redis({ url, token });
  _upstashRedisConfigKey = configKey;
  return _upstashRedis;
}

export function resetUpstashRedis(): void {
  _upstashRedis = null;
  _upstashRedisConfigKey = null;
}

/**
 * INCR + EXPIRE in one round trip, so a crash between the two can't leave a
 * TTL-less counter behind. eval(script, [key], [ttlSeconds]) -> new count.
 */
export const ATOMIC_INCR_EXPIRE_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
`;

/**
 * Increments only while under the limit, so rejected requests don't burn quota.
 * eval(script, [key], [limit, ttlSeconds]) -> new count, or -1 if already at limit.
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
 * Float variant of the above for fractional counters (dollar spend).
 * eval(script, [key], [limit, ttlSeconds, amount]) -> new value, or -1 if at limit.
 */
export const CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
if current >= limit then
  return -1
end
local newVal = redis.call('INCRBYFLOAT', KEYS[1], ARGV[3])
if tonumber(newVal) == tonumber(ARGV[3]) then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return tonumber(newVal)
`;

// TTL for daily quotas — they reset on the UTC day boundary, not 24h after first use.
export function getSecondsUntilUtcMidnight(): number {
  const now = new Date();
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.floor((nextUtcMidnight - now.getTime()) / 1000));
}
