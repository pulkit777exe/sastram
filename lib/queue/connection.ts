import { Redis } from 'ioredis';
import { logger } from '@/lib/infrastructure/logger';
import { createRedisConnection } from '@/lib/infrastructure/redis-connection';

let _connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!_connection) {
    _connection = createRedisConnection({
      label: 'queue',
      enableReadyCheck: false,
      lazyConnect: false,
      enableOfflineQueue: true,
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
