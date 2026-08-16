import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, CHECK_AND_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
}

export type QuotaErrorPolicy = 'failOpen' | 'failClosed' | 'inMemory';

interface InMemoryQuotaEntry {
  count: number;
  expiresAt: number;
}

// Per-instance only, so on serverless this is much weaker than the Redis path.
const inMemoryQuota = new Map<string, InMemoryQuotaEntry>();

function consumeInMemoryQuota(key: string, limit: number): QuotaResult {
  const now = Date.now();
  const existing = inMemoryQuota.get(key);
  const entry =
    existing && existing.expiresAt > now
      ? existing
      : { count: 0, expiresAt: now + getSecondsUntilUtcMidnight() * 1000 };

  if (entry.count >= limit) {
    inMemoryQuota.set(key, entry);
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  inMemoryQuota.set(key, entry);
  return { allowed: true, remaining: Math.max(0, limit - entry.count) };
}

export interface DailyQuotaConfig {
  keyPrefix: string;
  /** Key suffix from the call params (userId, threadId…). Date is appended automatically. */
  buildKey: (params: Record<string, string>) => string;
  limit: number;
  onRedisUnavailable: QuotaErrorPolicy;
  onRedisError: QuotaErrorPolicy;
}

export function createDailyQuota(config: DailyQuotaConfig) {
  return async function consumeQuota(params: Record<string, string> | string): Promise<QuotaResult> {
    const r = getUpstashRedis();
    const date = new Date().toISOString().slice(0, 10);
    const paramsObj = typeof params === 'string' ? { userId: params } : params;
    const key = `${config.keyPrefix}:${config.buildKey(paramsObj)}:${date}`;

    if (!r) {
      logger.warn(`[${config.keyPrefix}] Redis unavailable, applying "${config.onRedisUnavailable}" policy`);
      return handlePolicy(config.onRedisUnavailable, key, config.limit);
    }

    try {
      const result = (await r.eval(CHECK_AND_INCR_EXPIRE_LUA, [key], [config.limit, getSecondsUntilUtcMidnight()])) as number;

      // The Lua script signals "over limit, not incremented" with -1.
      if (result === -1) {
        return { allowed: false, remaining: 0 };
      }

      return { allowed: true, remaining: Math.max(0, config.limit - result) };
    } catch (error) {
      logger.error(`[${config.keyPrefix}] Redis error`, error);
      return handlePolicy(config.onRedisError, key, config.limit);
    }
  };
}

function handlePolicy(policy: QuotaErrorPolicy, key: string, limit: number): QuotaResult {
  switch (policy) {
    case 'failOpen':
      return { allowed: true, remaining: -1 };
    case 'failClosed':
      return { allowed: false, remaining: 0 };
    case 'inMemory':
      return consumeInMemoryQuota(key, limit);
  }
}

export const consumeAiInlineQuota = createDailyQuota({
  keyPrefix: 'ai_inline',
  buildKey: ({ userId, threadId }) => `${userId}:${threadId}`,
  limit: 3,
  onRedisUnavailable: 'failOpen',
  onRedisError: 'failClosed',
});

export const consumeAiAnalysisQuota = createDailyQuota({
  keyPrefix: 'ai_analysis',
  buildKey: ({ userId }) => userId,
  limit: 30,
  onRedisUnavailable: 'failOpen',
  onRedisError: 'failClosed',
});

export const consumeImageModerationQuota = createDailyQuota({
  keyPrefix: 'img_moderation',
  buildKey: () => 'global',
  limit: 50,
  onRedisUnavailable: 'failOpen',
  onRedisError: 'failOpen',
});

export const consumeAiSearchQuota = createDailyQuota({
  keyPrefix: 'ai_search',
  buildKey: ({ userId }) => userId,
  limit: 20,
  onRedisUnavailable: 'failOpen',
  onRedisError: 'inMemory',
});
