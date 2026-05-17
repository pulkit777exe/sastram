import { Ratelimit } from '@upstash/ratelimit';
import { logger } from '@/lib/infrastructure/logger';
import { env } from '@/lib/config/env';
import { getUpstashRedis } from '@/lib/infrastructure/redis-upstash';

export const rateLimitConfig = {
  auth: { points: 5, duration: 900 }, // 5 requests per 15 min
  api: { points: 100, duration: 60 }, // 100 requests per minute
  upload: { points: 10, duration: 3600 }, // 10 uploads per hour
  websocket: { points: 50, duration: 60 }, // 50 messages per minute
  message: { points: 20, duration: 60 }, // 20 messages per minute (NEW!)
  newsletter: { points: 3, duration: 86400 }, // 3 subscriptions per day
} as const;

export type RateLimitBucket = keyof typeof rateLimitConfig;

type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number;
};

type RateLimiter = {
  check: (identifier: string) => Promise<RateLimitResult>;
};

class InMemoryRateLimiter implements RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxPoints: number;
  private duration: number;

  constructor(maxPoints: number, duration: number) {
    this.maxPoints = maxPoints;
    this.duration = duration;
  }

  async check(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    const windowMs = this.duration * 1000;

    const filtered = requests.filter((timestamp) => now - timestamp < windowMs);

    const remaining = Math.max(0, this.maxPoints - filtered.length - 1);
    const reset = now + windowMs;

    if (filtered.length >= this.maxPoints) {
      return { success: false, remaining: 0, reset };
    }

    filtered.push(now);
    this.requests.set(identifier, filtered);

    return { success: true, remaining, reset };
  }
}

const inMemoryLimiter = new InMemoryRateLimiter(100, 60);

// Memoized rate limiters — one instance per bucket name.
// Prevents creating new Ratelimit objects on every check.
const _limiters = new Map<RateLimitBucket, RateLimiter>();

function getOrCreateLimiter(bucket: RateLimitBucket): RateLimiter {
  const cached = _limiters.get(bucket);
  if (cached) return cached;

  const config = rateLimitConfig[bucket];
  const r = getUpstashRedis();

  let limiter: RateLimiter;

  if (!r || !env.RATE_LIMIT_ENABLED) {
    limiter = {
      check: async () => ({ success: true, remaining: config.points, reset: Date.now() + config.duration * 1000 }),
    };
  } else {
    const ratelimit = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(config.points, `${config.duration} s`),
      analytics: false,
    });

    limiter = {
      check: async (identifier: string) => {
        try {
          const result = await ratelimit.limit(identifier);
          return { success: result.success, remaining: result.remaining, reset: result.reset };
        } catch (error) {
          logger.error(`Redis rate limit check failed for ${bucket}, falling back to in-memory:`, error);
          return inMemoryLimiter.check(identifier);
        }
      },
    };
  }

  _limiters.set(bucket, limiter);
  return limiter;
}

export async function rateLimit(identifier: string): Promise<RateLimitResult>;
export async function rateLimit(params: {
  key: string;
  type: RateLimitBucket;
}): Promise<RateLimitResult>;
export async function rateLimit(
  arg: string | { key: string; type: RateLimitBucket }
): Promise<RateLimitResult> {
  if (typeof arg === 'string') {
    const limiter = getOrCreateLimiter('api');
    return limiter.check(arg);
  }
  const limiter = getOrCreateLimiter(arg.type);
  return limiter.check(arg.key);
}

export const messageLimiter: RateLimiter = getOrCreateLimiter('message');
