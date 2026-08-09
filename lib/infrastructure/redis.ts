import { Redis } from 'ioredis';
import { logger } from '@/lib/infrastructure/logger';

export interface RedisConnectionOptions {
  label: string;
  maxRetriesPerRequest: number | null;
  enableReadyCheck: boolean;
  lazyConnect: boolean;
  retryStrategy: ((times: number) => number | null) | null;
  enableOfflineQueue: boolean;
}

const DEFAULT_OPTIONS: RedisConnectionOptions = {
  label: 'redis',
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
  retryStrategy: (times: number) => {
    if (times > 3) {
      logger.error('[redis] Connection exhausted retries');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  enableOfflineQueue: false,
};

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  } catch {
    return null;
  }
}

function buildConnectionConfig(opts: RedisConnectionOptions) {
  const shared = {
    maxRetriesPerRequest: opts.maxRetriesPerRequest,
    enableReadyCheck: opts.enableReadyCheck,
    lazyConnect: opts.lazyConnect,
    enableOfflineQueue: opts.enableOfflineQueue,
    retryStrategy: opts.retryStrategy ?? undefined,
  };

  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (redisUrl) {
    const parsed = parseRedisUrl(redisUrl);
    if (parsed) {
      logger.debug(`[redis] Using Redis connection from URL for "${opts.label}"`);
      return { ...parsed, ...shared };
    }
    logger.warn(`[redis] Invalid REDIS_URL for "${opts.label}", falling back to individual env vars`);
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    ...shared,
  };
}

export function createRedisConnection(options?: Partial<RedisConnectionOptions>): Redis {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const client = new Redis(buildConnectionConfig(opts));

  client.on('connect', () => logger.info(`[redis] "${opts.label}" connected`));
  client.on('error', (err) => logger.error(`[redis] "${opts.label}" error`, { error: err.message }));
  client.on('close', () => logger.warn(`[redis] "${opts.label}" connection closed`));
  client.on('reconnecting', () => logger.info(`[redis] "${opts.label}" reconnecting...`));

  return client;
}

export interface RedisUserEvent {
  type: 'NOTIFICATION_COUNT_UPDATE';
  payload: Record<string, unknown>;
  sourceInstance?: string;
}

export function getUserChannel(userId: string): string {
  return `user:${userId}`;
}

let _pub: Redis | null = null;

/**
 * Publisher connection. A subscriber needs its own connection — a client in
 * subscribe mode can't issue regular commands — so add a separate factory call
 * rather than reusing this one when a subscriber is introduced.
 */
export function getRedisPub(): Redis {
  _pub ??= createRedisConnection({ label: 'pubsub-pub', lazyConnect: true });
  return _pub;
}

export async function publishUserEvent(userId: string, event: RedisUserEvent): Promise<void> {
  await getRedisPub().publish(getUserChannel(userId), JSON.stringify(event));
}
