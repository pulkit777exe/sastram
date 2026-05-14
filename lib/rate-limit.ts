import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// In-memory fallback when Upstash env vars are not available
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

function getInMemoryRateLimiter() {
  return {
    async limit(identifier: string) {
      const now = Date.now();
      const windowMs = 60_000; // 1 minute
      const maxRequests = 10;

      const entry = inMemoryStore.get(identifier);
      if (!entry || now > entry.resetAt) {
        inMemoryStore.set(identifier, {
          count: 1,
          resetAt: now + windowMs,
        });
        return {
          success: true,
          remaining: maxRequests - 1,
          reset: now + windowMs,
        };
      }

      if (entry.count >= maxRequests) {
        return { success: false, remaining: 0, reset: entry.resetAt };
      }

      entry.count++;
      return {
        success: true,
        remaining: maxRequests - entry.count,
        reset: entry.resetAt,
      };
    },
  };
}

function getUpstashRateLimiter() {
  const redis = Redis.fromEnv();
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    analytics: true,
    prefix: 'sastram:ai-search',
  });
}

let rateLimiter: ReturnType<typeof getInMemoryRateLimiter> | Ratelimit | null = null;

function getRateLimiter() {
  if (rateLimiter) return rateLimiter;

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    rateLimiter = getUpstashRateLimiter();
  } else {
    rateLimiter = getInMemoryRateLimiter();
  }
  return rateLimiter;
}

/**
 * Rate-limits a request by identifier (typically IP address).
 * Returns { success, remaining, reset } — if !success, caller should return 429.
 */
export async function rateLimit(identifier: string) {
  const limiter = getRateLimiter();
  return limiter.limit(identifier);
}
