import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/config/env";

export const rateLimitConfig = {
  auth: { points: 5, duration: 900 }, // 5 requests per 15 min
  api: { points: 100, duration: 60 }, // 100 requests per minute
  upload: { points: 10, duration: 3600 }, // 10 uploads per hour
  websocket: { points: 50, duration: 60 }, // 50 messages per minute
  message: { points: 20, duration: 60 }, // 20 messages per minute (NEW!)
  newsletter: { points: 3, duration: 86400 }, // 3 subscriptions per day
} as const;

export type RateLimitBucket = keyof typeof rateLimitConfig;

// Type for rate limiter
type RateLimiter = {
  check: (identifier: string) => Promise<{ success: boolean }>;
};

// Create Redis client
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Helper to create a rate limiter wrapper
const createRateLimiter = (bucket: RateLimitBucket): RateLimiter => {
  const config = rateLimitConfig[bucket];

  if (!redis || !env.RATE_LIMIT_ENABLED) {
    return {
      check: async () => ({ success: true }),
    };
  }

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.points, `${config.duration} s`),
    analytics: true,
  });

  return {
    check: async (identifier: string) => {
      try {
        const result = await ratelimit.limit(identifier);
        return { success: result.success };
      } catch (error) {
        console.error(`Rate limit check failed for ${bucket}:`, error);
        // Fail open if Redis is down
        return { success: true };
      }
    },
  };
};

export async function rateLimit(params: {
  key: string;
  type: RateLimitBucket;
}): Promise<{ success: boolean }> {
  const limiter = createRateLimiter(params.type);
  return limiter.check(params.key);
}

export const authLimiter: RateLimiter = createRateLimiter("auth");
export const apiLimiter: RateLimiter = createRateLimiter("api");
export const uploadLimiter: RateLimiter = createRateLimiter("upload");
export const websocketLimiter: RateLimiter = createRateLimiter("websocket");
export const messageLimiter: RateLimiter = createRateLimiter("message");
export const newsletterLimiter: RateLimiter = createRateLimiter("newsletter");

export async function checkRateLimit(
  userId: string,
  bucket: RateLimitBucket
): Promise<void> {
  const result = await rateLimit({
    key: userId,
    type: bucket,
  });

  if (!result.success) {
    throw new Error(
      `Rate limit exceeded. Please try again in 10 sec seconds.`
    );
  }
}

class InMemoryRateLimiter implements RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxPoints: number;
  private duration: number;

  constructor(maxPoints: number, duration: number) {
    this.maxPoints = maxPoints;
    this.duration = duration;
  }

  async check(identifier: string): Promise<{ success: boolean }> {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];

    const filtered = requests.filter(
      (timestamp) => now - timestamp < this.duration * 1000
    );

    if (filtered.length >= this.maxPoints) {
      return { success: false };
    }

    filtered.push(now);
    this.requests.set(identifier, filtered);

    return { success: true };
  }
}

export function createInMemoryRateLimiter(
  bucket: RateLimitBucket
): RateLimiter {
  const config = rateLimitConfig[bucket];
  return new InMemoryRateLimiter(config.points, config.duration);
}