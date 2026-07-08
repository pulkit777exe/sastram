import { getUpstashRedis } from '@/lib/infrastructure/redis-upstash';

/**
 * Check if a job has already been processed. If not, mark it as processed.
 * Uses Redis SET with NX (set if not exists) and TTL to auto-expire dedup keys.
 *
 * @param jobId - Unique job identifier (QStash message ID or custom key)
 * @param ttlSeconds - How long to remember this job (default: 1 hour)
 * @returns true if job should be processed, false if duplicate
 */
export async function deduplicateJob(
  jobId: string,
  ttlSeconds: number = 3600
): Promise<boolean> {
  const redis = getUpstashRedis();
  if (!redis) {
    return true;
  }

  const key = `job:dedup:${jobId}`;
  const result = await redis.set(key, '1', { ex: ttlSeconds, nx: true });
  return result === 'OK';
}
