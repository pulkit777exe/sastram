import { logger } from '@/lib/infrastructure/logger';
import { getUpstashRedis, getSecondsUntilUtcMidnight, CHECK_AND_INCR_EXPIRE_LUA, withRedisTimeout } from '@/lib/infrastructure/redis-upstash';

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

  let entry: InMemoryQuotaEntry;
  const hasValidExisting = existing !== undefined && existing.expiresAt > now;
  if (hasValidExisting) {
    entry = existing;
  } else {
    const ttlMs = getSecondsUntilUtcMidnight() * 1000;
    entry = { count: 0, expiresAt: now + ttlMs };
  }

  const isAtLimit = entry.count >= limit;
  if (isAtLimit) {
    inMemoryQuota.set(key, entry);
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  inMemoryQuota.set(key, entry);
  const remaining = Math.max(0, limit - entry.count);
  return { allowed: true, remaining };
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
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

async function checkQuota(
  key: string,
  limit: number,
  onRedisUnavailable: QuotaErrorPolicy,
  onRedisError: QuotaErrorPolicy,
  logPrefix: string
): Promise<QuotaResult> {
  const r = getUpstashRedis();
  if (!r) {
    logger.warn(`[${logPrefix}] Redis unavailable, applying "${onRedisUnavailable}" policy`);
    return handlePolicy(onRedisUnavailable, key, limit);
  }
  try {
    const ttlSeconds = getSecondsUntilUtcMidnight();
    const result = (await withRedisTimeout(r.eval(CHECK_AND_INCR_EXPIRE_LUA, [key], [limit, ttlSeconds]) as Promise<number>, 4000)) as number;
    if (result === -1) {
      return { allowed: false, remaining: 0 };
    }
    const remaining = Math.max(0, limit - result);
    return { allowed: true, remaining };
  } catch (error) {
    logger.error(`[${logPrefix}] Redis error`, error);
    return handlePolicy(onRedisError, key, limit);
  }
}

export type QuotaKind = 'inline' | 'analysis' | 'image' | 'search';

export type QuotaParams = Record<string, string> | string;

interface QuotaSpec {
  buildKey: (params: { userId: string; threadId: string }, date: string) => string;
  limit: number;
  onRedisUnavailable: QuotaErrorPolicy;
  onRedisError: QuotaErrorPolicy;
  logPrefix: string;
}

const QUOTAS: Record<QuotaKind, QuotaSpec> = {
  inline: {
    buildKey: ({ userId, threadId }, date) => `ai_inline:${userId}:${threadId}:${date}`,
    limit: 3,
    onRedisUnavailable: 'failOpen',
    onRedisError: 'failClosed',
    logPrefix: 'ai_inline',
  },
  analysis: {
    buildKey: ({ userId }, date) => `ai_analysis:${userId}:${date}`,
    limit: 30,
    onRedisUnavailable: 'failOpen',
    onRedisError: 'failClosed',
    logPrefix: 'ai_analysis',
  },
  image: {
    buildKey: (_params, date) => `img_moderation:global:${date}`,
    limit: 50,
    onRedisUnavailable: 'failOpen',
    onRedisError: 'failOpen',
    logPrefix: 'img_moderation',
  },
  search: {
    buildKey: ({ userId }, date) => `ai_search:${userId}:${date}`,
    limit: 20,
    onRedisUnavailable: 'failOpen',
    onRedisError: 'inMemory',
    logPrefix: 'ai_search',
  },
};

export async function consumeQuota(kind: QuotaKind, params: QuotaParams): Promise<QuotaResult> {
  const spec = QUOTAS[kind];
  let paramsObj: Record<string, string>;
  if (typeof params === 'string') {
    paramsObj = { userId: params };
  } else {
    paramsObj = params;
  }
  const userId = paramsObj.userId ?? '';
  const threadId = paramsObj.threadId ?? '';
  const key = spec.buildKey({ userId, threadId }, getTodayDateString());
  return checkQuota(key, spec.limit, spec.onRedisUnavailable, spec.onRedisError, spec.logPrefix);
}
