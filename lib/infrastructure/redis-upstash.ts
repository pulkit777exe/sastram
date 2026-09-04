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
  let configKey: string | null = null;
  if (url && token) {
    configKey = `${url}:${token}`;
  }

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

// ---------------------------------------------------------------------------
// Lua scripts — kept as named constants so callers can eval without extra RTT.
// Each script's ARGV contract is documented above the constant.
// ---------------------------------------------------------------------------

/**
 * ATOMIC_INCR_EXPIRE
 * Args: ARGV[1] = ttlSeconds
 * Returns: new count after INCR
 * Why atomic: INCR + EXPIRE in one eval so a crash can't leave a TTL-less key.
 */
export const ATOMIC_INCR_EXPIRE_LUA = [
  "local count = redis.call('INCR', KEYS[1])",
  "if count == 1 then",
  "  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))",
  "end",
  "return count",
].join("\n");

/**
 * CHECK_AND_INCR_EXPIRE
 * Args: ARGV[1] = limit, ARGV[2] = ttlSeconds
 * Returns: new count, or -1 if already at limit (so rejected requests don't burn quota).
 */
export const CHECK_AND_INCR_EXPIRE_LUA = [
  "local current = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "local limit = tonumber(ARGV[1])",
  "if current >= limit then",
  "  return -1",
  "end",
  "local count = redis.call('INCR', KEYS[1])",
  "if count == 1 then",
  "  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))",
  "end",
  "return count",
].join("\n");

/**
 * CHECK_AND_INCRBY_FLOAT_EXPIRE
 * Args: ARGV[1] = limit, ARGV[2] = ttlSeconds, ARGV[3] = amount
 * Returns: new float value, or -1 if already at limit.
 * Float variant for dollar-spend counters.
 */
export const CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA = [
  "local current = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "local limit = tonumber(ARGV[1])",
  "if current >= limit then",
  "  return -1",
  "end",
  "local newVal = redis.call('INCRBYFLOAT', KEYS[1], ARGV[3])",
  "if tonumber(newVal) == tonumber(ARGV[3]) then",
  "  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))",
  "end",
  "return tonumber(newVal)",
].join("\n");

// ---------------------------------------------------------------------------
// TTL helper — daily quotas reset at UTC midnight, not 24h after first use.
// ---------------------------------------------------------------------------

const MS_PER_SECOND = 1000;
const MIN_TTL_SECONDS = 1;

function getNextUtcMidnightTimestamp(now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const nextDay = now.getUTCDate() + 1;
  return Date.UTC(year, month, nextDay);
}

function secondsBetween(nowMs: number, futureMs: number): number {
  const diffMs = futureMs - nowMs;
  return Math.floor(diffMs / MS_PER_SECOND);
}

export function getSecondsUntilUtcMidnight(): number {
  const now = new Date();
  const nextMidnightMs = getNextUtcMidnightTimestamp(now);
  const secondsUntilMidnight = secondsBetween(now.getTime(), nextMidnightMs);
  const clamped = Math.max(MIN_TTL_SECONDS, secondsUntilMidnight);
  return clamped;
}
