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
  private lastCleanup: number = Date.now();
  private readonly CLEANUP_INTERVAL = 60000; // Clean up every minute
  private readonly MAX_IDENTIFIERS = 10000; // Cap tracked identifiers to prevent memory exhaustion

  constructor(maxPoints: number, duration: number) {
    this.maxPoints = maxPoints;
    this.duration = duration;
  }

  private cleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL) return;
    
    this.lastCleanup = now;
    const windowMs = this.duration * 1000;
    
    for (const [identifier, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter((ts) => now - ts < windowMs);
      if (filtered.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, filtered);
      }
    }
  }

  async check(identifier: string): Promise<RateLimitResult> {
    this.cleanup();
    
    // If we've hit the cap, reject unknown identifiers to prevent memory exhaustion
    if (!this.requests.has(identifier) && this.requests.size >= this.MAX_IDENTIFIERS) {
      return { success: false, remaining: 0, reset: Date.now() + this.duration * 1000 };
    }
    
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

// Memoized rate limiters — one instance per bucket name.
// Prevents creating new Ratelimit objects on every check.
const _limiters = new Map<RateLimitBucket, RateLimiter>();

function getOrCreateLimiter(bucket: RateLimitBucket): RateLimiter {
  const cached = _limiters.get(bucket);
  if (cached) return cached;

  const config = rateLimitConfig[bucket];
  const r = getUpstashRedis();

  let limiter: RateLimiter;

  const redisConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  if (!env.RATE_LIMIT_ENABLED) {
    limiter = {
      check: async () => ({ success: true, remaining: config.points, reset: Date.now() + config.duration * 1000 }),
    };
  } else if (!r) {
    if (redisConfigured) {
      logger.error(
        `Rate limit: Redis is configured but the client could not be created for bucket "${bucket}". Degrading to per-instance in-memory limiting (weaker on serverless).`
      );
      limiter = new InMemoryRateLimiter(config.points, config.duration);
    } else {
      limiter = {
        check: async () => ({ success: true, remaining: config.points, reset: Date.now() + config.duration * 1000 }),
      };
    }
  } else {
    const ratelimit = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(config.points, `${config.duration} s`),
      analytics: false,
    });

    const fallback = new InMemoryRateLimiter(config.points, config.duration);

    limiter = {
      check: async (identifier: string) => {
        try {
          const result = await ratelimit.limit(identifier);
          return { success: result.success, remaining: result.remaining, reset: result.reset };
        } catch (error) {
          logger.error(
            `Rate limit: Redis check failed for bucket "${bucket}", degrading to per-instance in-memory limiting (weaker on serverless):`,
            error
          );
          return fallback.check(identifier);
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

export function resetRateLimiters(): void {
  _limiters.clear();
}
