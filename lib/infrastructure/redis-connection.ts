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
      logger.error('[redis-connection] Connection exhausted retries');
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

function buildConnectionConfig(overrides?: Partial<RedisConnectionOptions>) {
  const opts = { ...DEFAULT_OPTIONS, ...overrides };

  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;

  if (redisUrl) {
    const parsed = parseRedisUrl(redisUrl);
    if (parsed) {
      logger.debug(`[redis-connection] Using Redis connection from URL for "${opts.label}"`);
      return {
        ...parsed,
        maxRetriesPerRequest: opts.maxRetriesPerRequest,
        enableReadyCheck: opts.enableReadyCheck,
        lazyConnect: opts.lazyConnect,
        enableOfflineQueue: opts.enableOfflineQueue,
        retryStrategy: opts.retryStrategy ?? undefined,
      };
    }
    logger.warn(`[redis-connection] Invalid REDIS_URL for "${opts.label}", falling back to individual env vars`);
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    maxRetriesPerRequest: opts.maxRetriesPerRequest,
    enableReadyCheck: opts.enableReadyCheck,
    lazyConnect: opts.lazyConnect,
    enableOfflineQueue: opts.enableOfflineQueue,
    retryStrategy: opts.retryStrategy ?? undefined,
  };
}

export function createRedisConnection(options?: Partial<RedisConnectionOptions>): Redis {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const label = opts.label;
  const config = buildConnectionConfig(options);
  const client = new Redis(config);

  client.on('connect', () => {
    logger.info(`[redis-connection] "${label}" connected`);
  });

  client.on('error', (err) => {
    logger.error(`[redis-connection] "${label}" error`, { error: err.message });
  });

  client.on('close', () => {
    logger.warn(`[redis-connection] "${label}" connection closed`);
  });

  client.on('reconnecting', () => {
    logger.info(`[redis-connection] "${label}" reconnecting...`);
  });

  return client;
}
