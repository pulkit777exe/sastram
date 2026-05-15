import { Redis } from 'ioredis';
import { logger } from '@/lib/infrastructure/logger';

let _connection: Redis | null = null;

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

function buildIoRedisConfig() {
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;

  if (redisUrl) {
    const parsed = parseRedisUrl(redisUrl);
    if (parsed) {
      logger.debug('[queue] Using Redis connection from URL');
      return {
        ...parsed,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times: number) => {
          if (times > 3) {
            logger.error('[queue] Redis connection exhausted retries');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
      };
    }
    logger.warn('[queue] Invalid REDIS_URL, falling back to individual env vars');
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 3) {
        logger.error('[queue] Redis connection exhausted retries');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
  };
}

export function getRedisConnection(): Redis {
  if (!_connection) {
    const config = buildIoRedisConfig();
    _connection = new Redis(config);

    _connection.on('connect', () => {
      logger.info('[queue] Redis connected');
    });

    _connection.on('error', (err) => {
      logger.error('[queue] Redis connection error', { error: err.message });
    });

    _connection.on('close', () => {
      logger.warn('[queue] Redis connection closed');
    });

    _connection.on('reconnecting', () => {
      logger.info('[queue] Redis reconnecting...');
    });
  }

  return _connection;
}

export async function closeRedisConnection(): Promise<void> {
  if (_connection) {
    await _connection.quit();
    _connection = null;
    logger.info('[queue] Redis connection closed');
  }
}
