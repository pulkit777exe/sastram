import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Type for rate limiter that works with both Ratelimit and fallback
type RateLimiter = {
  check: (identifier: string) => Promise<{ success: boolean }>;
};

// Create Redis client (will use env vars UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
    })
  : null;

// Helper to create a rate limiter wrapper
const createRateLimiter = (ratelimit: Ratelimit): RateLimiter => {
  return {
    check: async (identifier: string) => {
      const result = await ratelimit.limit(identifier);
      return { success: result.success };
    },
  };
};

export const messageLimiter: RateLimiter = redis
  ? createRateLimiter(
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "10 s"),
        analytics: true,
      })
    )
  : {
      check: async () => ({ success: true }),
    };

export const moderationLimiter: RateLimiter = redis
  ? createRateLimiter(
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(50, "1 m"),
        analytics: true,
      })
    )
  : {
      check: async () => ({ success: true }),
    };

export const apiLimiter: RateLimiter = redis
  ? createRateLimiter(
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, "1 m"),
        analytics: true,
      })
    )
  : {
      check: async () => ({ success: true }),
    };

