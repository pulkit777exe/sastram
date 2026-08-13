import { Ratelimit } from '@upstash/ratelimit';
import type { Redis } from '@upstash/redis';
import { logger } from '@/lib/infrastructure/logger';
import { env } from '@/lib/config/env';
import { getUpstashRedis } from '@/lib/infrastructure/redis-upstash';

// duration is in seconds.
export const rateLimitConfig = {
  auth: { points: 5, duration: 900 },
  api: { points: 100, duration: 60 },
  upload: { points: 10, duration: 3600 },
  message: { points: 20, duration: 60 },
  newsletter: { points: 3, duration: 86400 },
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

export class InMemoryRateLimiter implements RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxPoints: number;
  private duration: number;
  private lastCleanup: number = Date.now();
  private readonly CLEANUP_INTERVAL = 60000;
  private readonly MAX_IDENTIFIERS = 10000;

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

    // Once the map is full, reject unseen identifiers rather than let an
    // attacker grow it without bound by rotating keys.
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

// One limiter instance per bucket, so we don't rebuild Ratelimit on every check.
const _limiters = new Map<RateLimitBucket, RateLimiter>();

export type LimiterMode = 'open' | 'in-memory' | 'redis';

/**
 * - `open`: limiting off, or Redis was never configured — allow all.
 * - `in-memory`: Redis configured but unreachable; degrade (weak on serverless).
 * - `redis`: shared global limiting.
 *
 * Split out from getOrCreateLimiter so the failure-mode decision is testable
 * without a live Redis.
 */
export function decideLimiterMode(
  rateLimitEnabled: boolean,
  r: Redis | null,
  redisConfigured: boolean
): LimiterMode {
  if (!rateLimitEnabled) return 'open';
  if (!r) return redisConfigured ? 'in-memory' : 'open';
  return 'redis';
}

export function getOrCreateLimiter(
  bucket: RateLimitBucket,
  redisClient: Redis | null = getUpstashRedis()
): RateLimiter {
  const cached = _limiters.get(bucket);
  if (cached) return cached;

  const config = rateLimitConfig[bucket];
  const r = redisClient;

  const redisConfigured = Boolean(
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  );

  const mode = decideLimiterMode(env.RATE_LIMIT_ENABLED, r, redisConfigured);
  let limiter: RateLimiter;

  if (mode === 'open') {
    limiter = {
      check: async () => ({ success: true, remaining: config.points, reset: Date.now() + config.duration * 1000 }),
    };
  } else if (mode === 'in-memory') {
    logger.error(
      `Rate limit: Redis is configured but the client could not be created for bucket "${bucket}". Degrading to per-instance in-memory limiting (weaker on serverless).`
    );
    limiter = new InMemoryRateLimiter(config.points, config.duration);
  } else {
    const ratelimit = new Ratelimit({
      redis: r as Redis,
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
  return typeof arg === 'string'
    ? getOrCreateLimiter('api').check(arg)
    : getOrCreateLimiter(arg.type).check(arg.key);
}

/**
 * Resolved lazily: binding at module load would freeze the limiter in
 * in-memory mode for the process lifetime if Redis was down at cold start.
 */
export function getMessageLimiter(): RateLimiter {
  return getOrCreateLimiter('message');
}

/** Test hook — lets a suite re-evaluate limiter mode after changing env. */
export function resetRateLimiters(): void {
  _limiters.clear();
}
